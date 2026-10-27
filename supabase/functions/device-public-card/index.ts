import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

/**
 * Laitteen julkinen huoltokortti (QR-tarra, /q/:token), ei vaadi kirjautumista. Vain luku.
 *
 * Turva:
 * - token = laitekohtainen satunnainen (≥ 32 merkkiä, base64url), equipment.public_qr_token; mitätöinti = null / uusi arvo.
 * - Palauttaa VAIN tämän laitteen perustiedot, julkaistut (valmiit) huoltopöytäkirjat ja niiden tulosteen tiedot
 *   + tulosteen brändin (yrityksen nimi/logo). Ei hintoja, laskutusta, kumppanitietoja, muita laitteita
 *   eikä asiakasrekisterin tietoja (vain se mitä pöytäkirjan tuloste jo näyttää).
 * - Kuvien allekirjoitetut URL:t vain polkuihin, jotka esiintyvät kyseisen raportin datassa.
 * - RLS:ää ei laajenneta: kysely service rolella vain tokenilla rajattuna.
 */

// deno-lint-ignore no-explicit-any
type Admin = SupabaseClient<any, any, any>;
type AnyRecord = Record<string, unknown>;

const VERSION = 'device-public-card-1';
const TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLISHED = ['submitted', 'completed', 'valmis', 'toimitettu', 'complete', 'ready', 'done'];
const IMAGE_BUCKET = 'maintenance-report-images';
const LOGO_BUCKET = 'company-logos';
const SIGNED_URL_TTL = 60 * 60;
const MAX_PATHS = 60;

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

async function signed(admin: Admin, bucket: string, path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL);
  return error || !data?.signedUrl ? null : data.signedUrl;
}

async function branding(admin: Admin, companyId: string | null) {
  if (!companyId) return { companyName: '', logoUrl: null as string | null };
  const { data } = await admin.from('companies').select('name, logo_url').eq('id', companyId).maybeSingle();
  const row = (data ?? {}) as AnyRecord;
  const logo = str(row.logo_url);
  const logoUrl = !logo ? null : /^https?:\/\//.test(logo) ? logo : await signed(admin, LOGO_BUCKET, logo.replace(/^\/+/, ''));
  return { companyName: String(row.name ?? ''), logoUrl };
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Vain POST' }, 405);
  try {
    const body = (await req.json().catch(() => ({}))) as AnyRecord;
    if (body.ping === true) return json({ ok: true, version: VERSION });

    const token = String(body.token ?? '').trim();
    if (!TOKEN_RE.test(token)) return notFound();

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: eqRow, error: eqError } = await admin
      .from('equipment')
      .select('id, customer_id, owner_company_id, name, tag, model, serial_number, location, device_type, public_qr_token')
      .eq('public_qr_token', token)
      .maybeSingle();
    if (eqError) console.error('device-public-card equipment', eqError.message);
    const eq = eqRow as AnyRecord | null;
    // Tarkistus myös täsmällisellä vertailulla (ei esim. tyhjää tokenia).
    if (!eq || eq.public_qr_token !== token) return notFound();
    const equipmentId = String(eq.id);
    // Laitetietosarakkeet erikseen: vanhassa skeemassa niitä ei välttämättä ole.
    const { data: extraRow } = await admin
      .from('equipment')
      .select('manufacturer, refrigerant, refrigerant_charge_kg')
      .eq('id', equipmentId)
      .maybeSingle();
    const extra = (extraRow ?? {}) as AnyRecord;
    const charge = Number(extra.refrigerant_charge_kg);

    const { data: reportRows, error: repError } = await admin
      .from('maintenance_reports')
      .select('id, status, data, completed_at, updated_at, branding_company_id, owner_company_id')
      .eq('equipment_id', equipmentId)
      .in('status', PUBLISHED);
    if (repError) console.error('device-public-card reports', repError.message);
    const reports = ((reportRows ?? []) as AnyRecord[])
      .map((r) => ({ row: r, date: reportDate(r) ?? '' }))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    const requestedId = str(body.reportId);
    if (requestedId && !UUID_RE.test(requestedId)) return notFound();
    const selected = requestedId ? reports.find((r) => r.row.id === requestedId) : reports[0];
    if (requestedId && !selected) return notFound();

    // Kuvien URL:t: vain valitun raportin datassa esiintyvät polut.
    if (Array.isArray(body.paths)) {
      if (!selected) return json({ imageUrls: {} });
      const haystack = JSON.stringify(selected.row.data ?? {});
      const out: Record<string, string> = {};
      for (const p of (body.paths as unknown[]).slice(0, MAX_PATHS)) {
        const path = typeof p === 'string' ? p.trim() : '';
        if (!path || path.includes('..') || !haystack.includes(path)) continue;
        const url = await signed(admin, IMAGE_BUCKET, path.replace(/^\/+/, ''));
        if (url) out[path] = url;
      }
      return json({ imageUrls: out });
    }

    // Huoltohistoriamerkinnät (taulu valinnainen: virhe → tyhjä lista).
    const { data: noteRows, error: noteError } = await admin
      .from('equipment_notes')
      .select('id, entry_date, author_company_name, installer_name, installer_tukes, text, is_service_visit')
      .eq('equipment_id', equipmentId)
      .order('entry_date', { ascending: false })
      .limit(200);
    if (noteError && noteError.code !== '42P01' && noteError.code !== 'PGRST205') console.error('device-public-card notes', noteError.message);
    const notes = ((noteRows ?? []) as AnyRecord[]).map((n) => ({
      id: String(n.id),
      date: str(n.entry_date),
      text: String(n.text ?? ''),
      company: str(n.author_company_name),
      installer: str(n.installer_name),
      tukes: str(n.installer_tukes),
      serviceVisit: n.is_service_visit === true,
    }));

    // Laitteeseen kohdistetut työraportit (valmiit): vain pvm, yritys, asentaja + Tukes, mitä tehtiin.
    // EI hintoja, kuluja, laskutusta, provisiota eikä kumppanitietoja.
    const work = await loadWorkEntries(admin, equipmentId);

    const brandCompany = selected
      ? str(selected.row.branding_company_id) ?? str(selected.row.owner_company_id)
      : str(eq.owner_company_id);
    const brand = await branding(admin, brandCompany);

    return json({
      device: {
        name: str(eq.name),
        tag: str(eq.tag),
        model: str(eq.model),
        serialNumber: str(eq.serial_number),
        location: str(eq.location),
        deviceType: str(eq.device_type),
        manufacturer: str(extra.manufacturer),
        refrigerant: str(extra.refrigerant),
        refrigerantChargeKg: extra.refrigerant_charge_kg != null && Number.isFinite(charge) ? charge : null,
      },
      // Kirjautuneelle käyttäjälle linkki laitekorttiin (RLS ratkaisee pääsyn; tunnisteet eivät ole salaisuuksia).
      appLink: { customerId: str(eq.customer_id), equipmentId },
      branding: brand,
      notes,
      work,
      history: reports.map((r) => ({ id: String(r.row.id), date: r.date || null })),
      report: selected ? { id: String(selected.row.id), date: selected.date || null, data: selected.row.data ?? {} } : null,
    });
  } catch (error) {
    console.error('device-public-card', error instanceof Error ? error.message : error);
    return json({ error: 'Palvelinvirhe' }, 500);
  }
});
