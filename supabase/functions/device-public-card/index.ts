import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

/**
 * Laitteen QR-sivu (/q/:token): vain kirjautuneille, vain luku.
 * - token = laitekohtainen satunnainen arvo (equipment.public_qr_token); mitätöinti = null / uusi arvo.
 * - Käyttäjän JWT tarkistetaan; laitteen, huoltopöytäkirjojen, merkintöjen ja työraporttien näkyvyys ratkaistaan
 *   käyttäjän omalla RLS:llä (portaalikäyttäjä näkee vain oman asiakkaansa laitteet).
 * - Palauttaa vain historiarivit: pvm, tyyppi, yritys, lyhyt kuvaus. Ei hintoja/laskutusta/kumppanitietoja.
 * - Linkitettyjen laitteiden rivit vain yhteenvetona (ei avattavia).
 */

// deno-lint-ignore no-explicit-any
type Admin = SupabaseClient<any, any, any>;
type AnyRecord = Record<string, unknown>;

const VERSION = 'device-public-card-3';
const TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;
const PUBLISHED = ['submitted', 'completed', 'valmis', 'toimitettu', 'complete', 'ready', 'done'];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

const notFound = () => json({ error: 'Linkki ei ole voimassa', code: 'not_found' }, 404);

function str(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || null;
}

function reportDate(row: AnyRecord): string | null {
  const data = (row.data ?? {}) as AnyRecord;
  const d = str(data.huoltoPaivamaara);
  if (d) return d;
  return str(row.completed_at)?.slice(0, 10) ?? str(row.updated_at)?.slice(0, 10) ?? null;
}

const WORK_DONE_STATUSES = ['completed', 'billed_partner', 'billed_customer'];

async function loadWorkEntries(admin: Admin, equipmentId: string) {
  try {
    const ids = new Set<string>();
    const direct = await admin.from('work_reports').select('id').eq('equipment_id', equipmentId).limit(500);
    for (const r of (direct.data ?? []) as AnyRecord[]) ids.add(String(r.id));
    const links = await admin.from('work_report_equipment').select('work_report_id').eq('equipment_id', equipmentId).limit(500);
    if (!links.error) for (const r of (links.data ?? []) as AnyRecord[]) ids.add(String(r.work_report_id));
    if (!ids.size) return [];
    const { data: reps } = await admin
      .from('work_reports')
      .select('id, owner_company_id, assigned_user_id, completed_at, status')
      .in('id', [...ids])
      .in('status', WORK_DONE_STATUSES);
    const reports = (reps ?? []) as AnyRecord[];
    if (!reports.length) return [];
    const { data: logRows } = await admin
      .from('work_report_daily_logs')
      .select('id, work_report_id, log_date, work_done, created_by, author_name_snapshot')
      .in('work_report_id', reports.map((r) => String(r.id)))
      .limit(1000);
    const logs = (logRows ?? []) as AnyRecord[];
    const companyIds = [...new Set(reports.map((r) => str(r.owner_company_id)).filter(Boolean))] as string[];
    const userIds = [...new Set([...logs.map((l) => str(l.created_by)), ...reports.map((r) => str(r.assigned_user_id))].filter(Boolean))] as string[];
    const [{ data: comps }, { data: profs }] = await Promise.all([
      companyIds.length ? admin.from('companies').select('id, name').in('id', companyIds) : Promise.resolve({ data: [] }),
      userIds.length ? admin.from('profiles').select('id, display_name, tukes_number').in('id', userIds) : Promise.resolve({ data: [] }),
    ]);
    const compName = new Map(((comps ?? []) as AnyRecord[]).map((c) => [String(c.id), str(c.name)]));
    const prof = new Map(((profs ?? []) as AnyRecord[]).map((p) => [String(p.id), p]));
    const byReport = new Map(reports.map((r) => [String(r.id), r]));
    const out: Array<{ id: string; date: string | null; company: string | null; installer: string | null; tukes: string | null; text: string }> = [];
    // Yksi rivi per työraportti (ei kirjauskohtaisia duplikaatteja).
    for (const rep of reports) {
      const mine = logs.filter((l) => String(l.work_report_id) === String(rep.id) && str(l.work_done));
      if (!mine.length) continue;
      const dates = mine.map((l) => str(l.log_date)).filter(Boolean).sort() as string[];
      const people = [...new Set(mine.map((l) => {
        const p = prof.get(String(l.created_by ?? '')) as AnyRecord | undefined;
        return [str(l.author_name_snapshot) ?? str(p?.display_name), str(p?.tukes_number) ? `Tukes ${str(p?.tukes_number)}` : null].filter(Boolean).join(', ');
      }).filter(Boolean))];
      out.push({
        id: String(rep.id),
        date: dates.at(-1) ?? str(rep.completed_at)?.slice(0, 10) ?? null,
        company: compName.get(String(rep.owner_company_id)) ?? null,
        installer: people.join('; ') || null,
        tukes: null,
        text: [...new Set(mine.map((l) => str(l.work_done) as string))].join(' / '),
      });
    }
    return out;
  } catch (error) {
    console.error('device-public-card work', error instanceof Error ? error.message : error);
    return [];
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clip = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);
const escHtml = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Asiakasportaalin tunnuspyyntö QR-sivulta (ei kirjautumista). Menee laitteen omistajayritykselle:
 * tallennus portal_access_requests-tauluun (jos olemassa) + sähköposti yrityksen admineille (Resend).
 * Vastaus ei koskaan sisällä laitteen/asiakkaan tietoja.
 */
async function handlePortalRequest(token: string, body: AnyRecord): Promise<Response> {
  if (clip(body.website, 200)) return json({ ok: true }); // hunajapurkki
  const elapsed = Number(body.elapsedMs ?? 0);
  if (!Number.isFinite(elapsed) || elapsed < 3000) return json({ error: 'Yritä uudelleen' }, 400);
  const name = clip(body.name, 100);
  const email = clip(body.email, 200).toLowerCase();
  const phone = clip(body.phone, 40);
  const message = clip(body.message, 500);
  if (!name || !EMAIL_RE.test(email)) return json({ error: 'Nimi ja sähköposti vaaditaan' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: eqRow } = await admin
    .from('equipment')
    .select('id, owner_company_id, customer_id, name, tag, public_qr_token')
    .eq('public_qr_token', token)
    .maybeSingle();
  const eq = eqRow as AnyRecord | null;
  if (!eq || eq.public_qr_token !== token) return notFound();
  const companyId = String(eq.owner_company_id);

  // Rajoitus: max 5 pyyntöä / laite / tunti (jos taulu olemassa).
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count, error: cntErr } = await admin
    .from('portal_access_requests')
    .select('id', { count: 'exact', head: true })
    .eq('equipment_id', eq.id)
    .gte('created_at', since);
  if (!cntErr && (count ?? 0) >= 5) return json({ error: 'Liian monta pyyntöä, yritä myöhemmin' }, 429);
  if (!cntErr) {
    const { error: insErr } = await admin.from('portal_access_requests').insert({
      equipment_id: eq.id, owner_company_id: companyId, customer_id: eq.customer_id ?? null, name, email, phone: phone || null, message: message || null,
    });
    if (insErr) console.error('portal_request insert', insErr.message);
  }

  const apiKey = (Deno.env.get('RESEND_API_KEY') || '').trim();
  if (apiKey) {
    const [{ data: admins }, { data: cust }] = await Promise.all([
      admin.from('profiles').select('email').eq('company_id', companyId).eq('role', 'admin').not('email', 'is', null).limit(10),
      eq.customer_id ? admin.from('customers').select('name').eq('id', eq.customer_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const to = [...new Set(((admins ?? []) as AnyRecord[]).map((a) => String(a.email ?? '').trim()).filter((e) => EMAIL_RE.test(e)))];
    if (to.length) {
      const device = [str(eq.tag), str(eq.name)].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · ');
      const custName = str((cust as AnyRecord | null)?.name) ?? '';
      const link = eq.customer_id ? `https://bestcool.eu/asiakkaat/${eq.customer_id}` : 'https://bestcool.eu/asiakkaat';
      const row = (k: string, v: string) => (v ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">${k}</td><td style="padding:4px 0">${escHtml(v)}</td></tr>` : '');
      const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2933;max-width:560px;padding:20px">
<h2 style="font-size:18px;margin:0 0 12px">Asiakasportaalin tunnuspyyntö</h2>
<table role="presentation" cellpadding="0" cellspacing="0">${row('Nimi', name)}${row('Sähköposti', email)}${row('Puhelin', phone)}${row('Laite', device)}${row('Asiakas', custName)}${row('Viesti', message)}</table>
<p style="margin:16px 0 0"><a href="${link}">Avaa asiakas sovelluksessa</a></p></div>`;
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'BC Smartapp <huolto@bestcool.eu>', to, subject: `Tunnuspyyntö – ${device || 'laite'}`, html, reply_to: email }),
      });
      if (!res.ok) console.warn('portal_request mail failed', res.status);
    }
  }
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Vain POST' }, 405);
  try {
    const body = (await req.json().catch(() => ({}))) as AnyRecord;
    if (body.ping === true) return json({ ok: true, version: VERSION });

    const token = String(body.token ?? '').trim();
    if (!TOKEN_RE.test(token)) return notFound();

    if (body.action === 'portal_request') return await handlePortalRequest(token, body);

    // Vain kirjautuneille: käyttäjän JWT tarkistetaan ja näkyvyys ratkaistaan käyttäjän omalla RLS:llä.
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const url = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: userData } = jwt ? await admin.auth.getUser(jwt) : { data: { user: null } };
    if (!userData?.user) return json({ error: 'Kirjaudu sisään', code: 'login_required' }, 401);
    const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    });

    const { data: eqRow } = await admin
      .from('equipment')
      .select('id, customer_id, name, tag, public_qr_token')
      .eq('public_qr_token', token)
      .maybeSingle();
    const eq = eqRow as AnyRecord | null;
    if (!eq || eq.public_qr_token !== token) return notFound();
    const equipmentId = String(eq.id);

    // Portaali / yritys: laitteen pitää näkyä käyttäjälle normaalein säännöin.
    const { data: visible } = await asUser.from('equipment').select('id').eq('id', equipmentId).maybeSingle();
    if (!visible) return notFound();

    // Asentaja (oma yritys) näkee myös keskeneräiset; portaali vain valmiit.
    const { data: prof } = await admin.from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
    const installer = ['admin', 'manager', 'technician'].includes(String((prof as AnyRecord | null)?.role ?? ''));

    // Omat huoltopöytäkirjat: vain käyttäjälle RLS:n kautta näkyvät.
    let repQuery = asUser
      .from('maintenance_reports')
      .select('id, status, data, completed_at, updated_at, branding_company_id, owner_company_id, created_by_company_id')
      .eq('equipment_id', equipmentId);
    if (!installer) repQuery = repQuery.in('status', PUBLISHED);
    const { data: reportRows } = await repQuery;
    const repRows = (reportRows ?? []) as AnyRecord[];
    const companyIds = [...new Set(repRows.map((r) => str(r.created_by_company_id) ?? str(r.owner_company_id)).filter(Boolean))] as string[];
    const { data: comps } = companyIds.length
      ? await admin.from('companies').select('id, name').in('id', companyIds)
      : { data: [] };
    const compName = new Map(((comps ?? []) as AnyRecord[]).map((c) => [String(c.id), str(c.name)]));

    type Row = { id: string; date: string | null; type: string; company: string | null; text: string; reportId: string | null; draft?: boolean };
    const rows: Row[] = repRows.map((r) => {
      const d = (r.data ?? {}) as AnyRecord;
      const kind = d.huoltoReportDocumentKind === 'kayttoonotto' ? 'Käyttöönotto' : 'Huoltopöytäkirja';
      return {
        id: `r-${r.id}`,
        date: reportDate(r),
        type: kind,
        company: compName.get(String(str(r.created_by_company_id) ?? r.owner_company_id)) ?? null,
        text: (str(d.huomiot) ?? '').slice(0, 120),
        reportId: String(r.id),
        draft: !PUBLISHED.includes(String(r.status ?? '')),
      };
    });

    // Merkinnät (RLS: näkyy kun laite näkyy).
    const { data: noteRows } = await asUser
      .from('equipment_notes')
      .select('id, entry_date, author_company_name, text, is_service_visit')
      .eq('equipment_id', equipmentId)
      .limit(200);
    for (const n of (noteRows ?? []) as AnyRecord[]) {
      rows.push({ id: `n-${n.id}`, date: str(n.entry_date), type: n.is_service_visit === true ? 'Huoltokäynti' : 'Merkintä', company: str(n.author_company_name), text: String(n.text ?? '').slice(0, 120), reportId: null });
    }

    // Työraportit: yhteenveto, vain käyttäjälle näkyvät raportit.
    const work = await loadWorkEntries(admin, equipmentId);
    if (work.length) {
      const { data: visWork } = await asUser.from('work_reports').select('id').in('id', work.map((w) => w.id));
      const ok = new Set(((visWork ?? []) as AnyRecord[]).map((w) => String(w.id)));
      for (const w of work) if (ok.has(w.id)) rows.push({ id: `w-${w.id}`, date: w.date, type: 'Työraportti', company: w.company, text: w.text.slice(0, 120), reportId: null });
    }

    // Linkitettyjen laitteiden (toinen yritys) yhteenvetorivit — ei klikattavia.
    const { data: sharedRows } = await admin.rpc('eqlink_shared_history_internal', { p_equipment: equipmentId });
    const KIND: Record<string, string> = { 'huoltopöytäkirja': 'Huoltopöytäkirja', 'merkintä': 'Merkintä', 'huoltokäynti': 'Huoltokäynti', 'työraportti': 'Työraportti' };
    ((sharedRows ?? []) as AnyRecord[]).slice(0, 300).forEach((r, i) => {
      rows.push({ id: `s-${i}`, date: str(r.entry_date), type: KIND[String(r.kind)] ?? String(r.kind ?? ''), company: str(r.company), text: [str(r.summary), str(r.work_done)].filter(Boolean).join(': ').slice(0, 120), reportId: null });
    });

    rows.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
    return json({
      device: { name: str(eq.name), tag: str(eq.tag) },
      appLink: { customerId: str(eq.customer_id), equipmentId },
      rows,
    });
  } catch (error) {
    console.error('device-public-card', error instanceof Error ? error.message : error);
    return json({ error: 'Palvelinvirhe' }, 500);
  }
});
