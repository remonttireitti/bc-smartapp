import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

/**
 * Laitteen QR-sivu (/q/:token): julkinen, ei kirjautumista, vain luku.
 * - token = laitekohtainen satunnainen arvo (equipment.public_qr_token); mitätöinti = null / uusi arvo → 404.
 * - Data haetaan service rolella, rajattuna tiukasti tokenin laitteeseen (ja sen aktiivisesti linkitettyihin laitteisiin).
 * - Palauttaa vain: laitteen otsikkotiedot (tunnus, malli, kylmäaine, määrä, GWP, omistaja, osoite) ja
 *   historiarivit (pvm, asentaja, Tukes, mitä tehtiin). Ei hintoja, y-tunnusta, yhteystietoja, dokumentteja eikä raporttien tunnisteita.
 */

// deno-lint-ignore no-explicit-any
type Admin = SupabaseClient<any, any, any>;
type AnyRecord = Record<string, unknown>;

const VERSION = 'device-public-card-4';
const TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;
const HUOLTO_STATUSES = ['draft', 'submitted', 'completed', 'valmis', 'toimitettu', 'complete', 'ready', 'done'];

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
      const names: string[] = [];
      const tukesList: string[] = [];
      for (const l of mine) {
        const p = prof.get(String(l.created_by ?? '')) as AnyRecord | undefined;
        const n = str(l.author_name_snapshot) ?? str(p?.display_name);
        const t = str(p?.tukes_number);
        if (n && !names.includes(n)) names.push(n);
        if (t && !tukesList.includes(t)) tukesList.push(t);
      }
      out.push({
        id: String(rep.id),
        date: dates.at(-1) ?? str(rep.completed_at)?.slice(0, 10) ?? null,
        company: compName.get(String(rep.owner_company_id)) ?? null,
        installer: names.join(', ') || null,
        tukes: tukesList.join(', ') || null,
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

const clipText = (v: string | null, n: number) => (v && v.length > n ? `${v.slice(0, n - 1).trimEnd()}…` : v);

function parseKg(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  const t = str(v);
  if (!t) return null;
  const n = Number(t.replace(',', '.').replace(/\s*kg$/i, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

type PublicRow = { id: string; date: string | null; type: string; installer: string | null; tukes: string | null; text: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Vain POST' }, 405);
  try {
    const body = (await req.json().catch(() => ({}))) as AnyRecord;
    if (body.ping === true) return json({ ok: true, version: VERSION });

    const token = String(body.token ?? '').trim();
    if (!TOKEN_RE.test(token)) return notFound();

    if (body.action === 'portal_request') return await handlePortalRequest(token, body);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    });

    const { data: eqRow } = await admin
      .from('equipment')
      .select('id, customer_id, name, tag, model, manufacturer, refrigerant, refrigerant_charge_kg, location, huolto_technical_snapshot, public_qr_token')
      .eq('public_qr_token', token)
      .maybeSingle();
    const eq = eqRow as AnyRecord | null;
    if (!eq || eq.public_qr_token !== token) return notFound();
    const equipmentId = String(eq.id);

    // Otsikko: omistaja (asiakkaan nimi) ja osoite. Ei y-tunnusta, yhteystietoja tai muuta asiakastietoa.
    const { data: custRow } = eq.customer_id
      ? await admin.from('customers').select('name, address, postal_code, city').eq('id', eq.customer_id).maybeSingle()
      : { data: null };
    const cust = custRow as AnyRecord | null;
    const address = [str(cust?.address), [str(cust?.postal_code), str(cust?.city)].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null;

    const snap = (eq.huolto_technical_snapshot ?? {}) as AnyRecord;
    const asetukset = (snap.huoltoAsetukset ?? {}) as AnyRecord;
    const gwpOverride = typeof asetukset.gwp === 'number' && Number.isFinite(asetukset.gwp) && asetukset.gwp > 0 ? asetukset.gwp : null;

    const rows: PublicRow[] = [];

    // Huoltopöytäkirjat (valmiit ja keskeneräiset huoltona) — vain yhteenveto, ei raportin tunnistetta.
    const { data: reportRows } = await admin
      .from('maintenance_reports')
      .select('id, status, data, completed_at, updated_at, created_by_company_id, owner_company_id')
      .eq('equipment_id', equipmentId)
      .in('status', HUOLTO_STATUSES)
      .limit(500);
    const repRows = (reportRows ?? []) as AnyRecord[];
    const companyIds = [...new Set(repRows.map((r) => str(r.created_by_company_id) ?? str(r.owner_company_id)).filter(Boolean))] as string[];
    const { data: comps } = companyIds.length ? await admin.from('companies').select('id, name').in('id', companyIds) : { data: [] };
    const compName = new Map(((comps ?? []) as AnyRecord[]).map((c) => [String(c.id), str(c.name)]));
    for (const r of repRows) {
      const d = (r.data ?? {}) as AnyRecord;
      const kind = d.huoltoReportDocumentKind === 'kayttoonotto' ? 'Käyttöönotto' : 'Huolto';
      const leak = String(d.huoltoKylmaaineVuotoTarkastus ?? '') === 'true' || String(((d.mlpData ?? {}) as AnyRecord).kylmaainePaetosTarkastettu ?? '') === 'true';
      const note = clipText(str(d.huomiot), 200);
      const label = leak && kind === 'Huolto' ? 'Huolto, vuototarkastus' : kind;
      rows.push({
        id: `r-${rows.length}`,
        date: reportDate(r),
        type: 'Huolto',
        installer: str(d.huoltoSuorittajaNimi) ?? compName.get(String(str(r.created_by_company_id) ?? r.owner_company_id)) ?? null,
        tukes: str(d.huoltoSuorittajaTUKES),
        text: note ? `${label}: ${note}` : label,
      });
    }

    // Merkinnät
    const { data: noteRows } = await admin
      .from('equipment_notes')
      .select('entry_date, author_company_name, installer_name, installer_tukes, text, is_service_visit')
      .eq('equipment_id', equipmentId)
      .limit(300);
    for (const n of (noteRows ?? []) as AnyRecord[]) {
      rows.push({
        id: `n-${rows.length}`,
        date: str(n.entry_date),
        type: n.is_service_visit === true ? 'Huolto' : 'Merkintä',
        installer: str(n.installer_name) ?? str(n.author_company_name),
        tukes: str(n.installer_tukes),
        text: clipText(str(n.text), 200) ?? '',
      });
    }

    // Työraportit (korjaukset): vain pvm, tekijä, Tukes, tehty työ.
    for (const w of await loadWorkEntries(admin, equipmentId)) {
      rows.push({ id: `w-${rows.length}`, date: w.date, type: 'Korjaus', installer: w.installer ?? w.company, tukes: w.tukes, text: clipText(w.text, 200) ?? '' });
    }

    // Aktiivisesti linkitettyjen laitteiden (toinen yritys) rivit.
    const { data: sharedRows } = await admin.rpc('eqlink_shared_history_internal', { p_equipment: equipmentId });
    for (const r of ((sharedRows ?? []) as AnyRecord[]).slice(0, 300)) {
      const kind = String(r.kind ?? '');
      const done = clipText(str(r.work_done), 200);
      const label = str(r.summary);
      rows.push({
        id: `s-${rows.length}`,
        date: str(r.entry_date),
        type: kind === 'työraportti' ? 'Korjaus' : kind === 'merkintä' ? 'Merkintä' : 'Huolto',
        installer: str(r.installer) ?? str(r.company),
        tukes: str(r.tukes),
        text: kind === 'huoltopöytäkirja' ? (done ? `${label ?? 'Huolto'}: ${done}` : label ?? 'Huolto') : done ?? label ?? '',
      });
    }

    rows.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));

    const refrigerant = str(eq.refrigerant) ?? str(snap.kylmaaineTyyppi) ?? str(snap.kylmaaineLaatu);
    const chargeKg = (eq.refrigerant_charge_kg != null ? Number(eq.refrigerant_charge_kg) : null) ?? parseKg(snap.kylmaaineMaaraYhteensa);
    return json({
      device: {
        tag: str(eq.tag),
        name: str(eq.name),
        model: str(eq.model),
        manufacturer: str(eq.manufacturer),
        refrigerant,
        chargeKg: chargeKg && Number.isFinite(chargeKg) && chargeKg > 0 ? chargeKg : null,
        gwp: gwpOverride,
        owner: str(cust?.name),
        address,
        location: str(eq.location),
      },
      rows: rows.map((r) => ({ id: r.id, date: r.date, type: r.type, installer: r.installer, tukes: r.tukes, text: r.text })),
    });
  } catch (error) {
    console.error('device-public-card', error instanceof Error ? error.message : error);
    return json({ error: 'Palvelinvirhe' }, 500);
  }
});
