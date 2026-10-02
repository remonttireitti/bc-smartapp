import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  WORK_REPORT_PUBLIC_PRINT_VERSION,
  publicPrintHasLinkedQuote,
  sanitizeWorkReportPublicPrintLogs,
} from '../_shared/workReportPublicPrint.ts';

/**
 * Julkinen asiakastuloste (tulostelinkki /j/:token), ei vaadi kirjautumista.
 *
 * Huom: edge-funktioita EI julkaista GitHub Actionsin Pages-deployn mukana.
 * Julkaisu: supabase functions deploy work-report-print-share --project-ref qvqmemeexberatbqxivw --no-verify-jwt
 * Tarkistus: POST {"ping":true} → {"ok":true,"version":"…"}
 *
 * Kyselyt tehdään ilman PostgREST-embedejä (työraportti → asiakas/laite/yritys/profiili haetaan
 * erikseen id:llä), jotta skeeman uudet relaatiot (esim. work_report_equipment 18.9.2026, joka teki
 * equipment(...)-embedistä moniselitteisen) eivät riko julkista linkkiä.
 */

// deno-lint-ignore no-explicit-any
type Admin = SupabaseClient<any, any, any>;
type AnyRecord = Record<string, unknown>;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const REPORT_COLUMNS = [
  'id', 'title', 'heading', 'description', 'orderer_name', 'location_text', 'status',
  'scheduled_start', 'scheduled_end', 'completed_at',
  'owner_company_id', 'created_by_company_id', 'created_by_user_id', 'branding_company_id',
  'partnership_id', 'customer_id', 'equipment_id', 'assigned_user_id',
  'delegate_company_id', 'delegated_at',
  'created_by_user_name_snapshot', 'created_by_user_deleted',
  'assigned_user_name_snapshot', 'assigned_user_deleted',
];

const EXPENSE_LINE_FIELDS =
  'id, daily_log_id, expense_type, description, qty, unit_price, bill_to_partner, bill_to_customer, customer_unit_price, sort_order';

const LOG_BASE_FIELDS = `
  id, work_report_id, log_date, entry_type,
  hours_regular, hours_overtime, hours_on_call,
  work_done, created_by, created_at, author_name_snapshot, author_deleted`;

const LOG_SELECT_FULL = `${LOG_BASE_FIELDS}, customer_extra_billing,
  expense_lines:work_report_daily_expense_lines(${EXPENSE_LINE_FIELDS}),
  refrigerant_lines:work_report_refrigerant_lines(
    id, daily_log_id, work_report_id, source, cylinder_id, warehouse_company_id, owner_user_id, supplier_name,
    unit_price, customer_unit_price, bill_to_customer,
    refrigerant_type, qty_kg, notes, created_by, created_at,
    cylinder:refrigerant_cylinders(serial_number, refrigerant_type),
    warehouse_company:companies!work_report_refrigerant_lines_warehouse_company_id_fkey(name),
    owner_user:profiles!work_report_refrigerant_lines_owner_user_id_fkey(display_name)
  ),
  images:work_report_daily_log_images(id, daily_log_id, storage_path, file_name, mime_type, caption)`;

/** Varakysely, jos jokin embed/sarake puuttuu tai on moniselitteinen. */
const LOG_SELECT_MIN = `${LOG_BASE_FIELDS},
  expense_lines:work_report_daily_expense_lines(${EXPENSE_LINE_FIELDS}),
  refrigerant_lines:work_report_refrigerant_lines(id, daily_log_id, refrigerant_type, qty_kg, bill_to_customer, created_at),
  images:work_report_daily_log_images(id, daily_log_id, storage_path, file_name, caption)`;

const IMAGE_BUCKET = 'work-report-images';
const LOGO_BUCKET = 'company-logos';
const SIGNED_URL_TTL = 60 * 60 * 24 * 7;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function storagePath(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return null;
  return trimmed.replace(/^\/+/, '');
}

async function signedStorageUrl(admin: Admin, bucket: string, path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

async function resolveLogoUrl(admin: Admin, logoUrl: string | null | undefined): Promise<string | null> {
  if (!logoUrl) return null;
  if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) return logoUrl;
  return signedStorageUrl(admin, LOGO_BUCKET, storagePath(logoUrl));
}

async function resolveLogImages(
  admin: Admin,
  logs: Array<{ id: string; images?: Array<{ storage_path: string; file_name: string; caption?: string | null }> }>,
): Promise<Record<string, Array<{ fileName: string; url: string; caption: string }>>> {
  const result: Record<string, Array<{ fileName: string; url: string; caption: string }>> = {};
  for (const log of logs) {
    const images: Array<{ fileName: string; url: string; caption: string }> = [];
    for (const image of log.images ?? []) {
      const url = await signedStorageUrl(admin, IMAGE_BUCKET, storagePath(image.storage_path));
      if (!url) continue;
      images.push({ fileName: image.file_name, url, caption: image.caption?.trim() ?? '' });
    }
    result[log.id] = images;
  }
  return result;
}

async function loadReportRow(admin: Admin, reportId: string): Promise<AnyRecord | null> {
  const primary = await admin.from('work_reports').select(REPORT_COLUMNS.join(', ')).eq('id', reportId).maybeSingle();
  if (!primary.error) return (primary.data as AnyRecord | null) ?? null;
  console.error('work-report-print-share report select failed, retrying with *', primary.error.message);
  const fallback = await admin.from('work_reports').select('*').eq('id', reportId).maybeSingle();
  if (fallback.error) {
    console.error('work-report-print-share report fallback failed', fallback.error.message);
    return null;
  }
  const row = fallback.data as AnyRecord | null;
  if (!row) return null;
  const picked: AnyRecord = {};
  for (const column of REPORT_COLUMNS) picked[column] = row[column] ?? null;
  return picked;
}

async function namesById(admin: Admin, table: string, columns: string, ids: Array<unknown>) {
  const unique = [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))];
  const map = new Map<string, AnyRecord>();
  if (unique.length === 0) return map;
  const { data, error } = await admin.from(table).select(`id, ${columns}`).in('id', unique);
  if (error) {
    console.error(`work-report-print-share ${table} lookup failed`, error.message);
    return map;
  }
  for (const row of (data ?? []) as unknown as AnyRecord[]) map.set(String(row.id), row);
  return map;
}

function nameOnly(row: AnyRecord | undefined): { name: string } | null {
  return row ? { name: String(row.name ?? '') } : null;
}

async function loadEquipmentLinks(admin: Admin, reportId: string, legacyEquipmentId: unknown) {
  const { data, error } = await admin
    .from('work_report_equipment')
    .select('equipment_id, sort_order')
    .eq('work_report_id', reportId)
    .order('sort_order', { ascending: true });
  const ids = error ? [] : ((data ?? []) as AnyRecord[]).map((row) => String(row.equipment_id));
  if (ids.length === 0 && typeof legacyEquipmentId === 'string' && legacyEquipmentId) ids.push(legacyEquipmentId);
  const equipment = await namesById(admin, 'equipment', 'name, tag', ids);
  return ids
    .map((id) => equipment.get(id))
    .filter((row): row is AnyRecord => !!row)
    .map((row) => ({ id: String(row.id), name: String(row.name ?? ''), tag: (row.tag as string | null) ?? null }));
}

async function loadLogs(admin: Admin, reportId: string): Promise<AnyRecord[] | null> {
  for (const select of [LOG_SELECT_FULL, LOG_SELECT_MIN]) {
    const { data, error } = await admin
      .from('work_report_daily_logs')
      .select(select)
      .eq('work_report_id', reportId)
      .order('log_date', { ascending: true })
      .order('created_at', { ascending: true });
    if (!error) return (data ?? []) as unknown as AnyRecord[];
    console.error('work-report-print-share logs select failed', error.message);
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Vain POST' }, 405);
  }

  try {
    const body = (await req.json().catch(() => ({}))) as AnyRecord;
    if (body.ping === true) {
      return json({ ok: true, version: WORK_REPORT_PUBLIC_PRINT_VERSION });
    }

    const token = String(body.token ?? '').trim();
    if (!token) {
      return json({ error: 'Puuttuva jakotunnus', code: 'missing_token' }, 400);
    }
    if (!/^[A-Za-z0-9_-]{6,128}$/.test(token)) {
      return json({ error: 'Jakolinkki ei ole voimassa', code: 'not_found' }, 404);
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: share, error: shareError } = await admin
      .from('work_report_print_shares')
      .select('id, work_report_id, enabled, expires_at')
      .or(`short_token.eq.${token},access_token.eq.${token}`)
      .maybeSingle();

    if (shareError) {
      console.error('work-report-print-share lookup failed', shareError.message);
      return json({ error: 'Jakolinkin haku epäonnistui', code: 'lookup_failed' }, 500);
    }
    if (!share) return json({ error: 'Jakolinkki ei ole voimassa', code: 'not_found' }, 404);
    if (!share.enabled) return json({ error: 'Jakolinkki on poistettu käytöstä', code: 'disabled' }, 403);
    if (share.expires_at && new Date(share.expires_at).getTime() <= Date.now()) {
      return json({ error: 'Jakolinkki on vanhentunut', code: 'expired' }, 403);
    }

    const reportId = String(share.work_report_id);
    const [reportRow, logsRaw, billableResult] = await Promise.all([
      loadReportRow(admin, reportId),
      loadLogs(admin, reportId),
      admin.from('work_report_billable').select('billing_quote').eq('work_report_id', reportId).maybeSingle(),
    ]);

    if (!reportRow) return json({ error: 'Työraporttia ei löytynyt', code: 'report_not_found' }, 404);
    if (!logsRaw) return json({ error: 'Työraportin kirjausten haku epäonnistui', code: 'logs_failed' }, 500);

    const companyIds = [
      reportRow.owner_company_id,
      reportRow.branding_company_id,
      reportRow.created_by_company_id,
      reportRow.delegate_company_id,
    ];
    const [companies, customers, profiles, equipmentLinks] = await Promise.all([
      namesById(admin, 'companies', 'name, logo_url', companyIds),
      namesById(admin, 'customers', 'name', [reportRow.customer_id]),
      namesById(admin, 'profiles', 'display_name, email', [
        reportRow.assigned_user_id,
        reportRow.created_by_user_id,
        ...logsRaw.map((log) => log.created_by),
      ]),
      loadEquipmentLinks(admin, reportId, reportRow.equipment_id),
    ]);

    const legacyEquipment = equipmentLinks.find((row) => row.id === reportRow.equipment_id) ?? equipmentLinks[0];
    const assigned = profiles.get(String(reportRow.assigned_user_id ?? ''));
    const creator = profiles.get(String(reportRow.created_by_user_id ?? ''));
    const report = {
      ...reportRow,
      customers: nameOnly(customers.get(String(reportRow.customer_id ?? ''))),
      equipment: legacyEquipment ? { name: legacyEquipment.name, tag: legacyEquipment.tag } : null,
      owner_company: nameOnly(companies.get(String(reportRow.owner_company_id ?? ''))),
      branding_company: nameOnly(companies.get(String(reportRow.branding_company_id ?? ''))),
      created_by_company: nameOnly(companies.get(String(reportRow.created_by_company_id ?? ''))),
      delegate_company: nameOnly(companies.get(String(reportRow.delegate_company_id ?? ''))),
      assigned_user: assigned ? { display_name: assigned.display_name ?? null } : null,
      created_by_user: creator ? { display_name: creator.display_name ?? null, email: creator.email ?? null } : null,
    };

    const logsWithAuthor = logsRaw.map((log) => {
      const author = profiles.get(String(log.created_by ?? ''));
      return { ...log, author: author ? { display_name: author.display_name ?? null } : null };
    });
    const linkedQuoteRequest = publicPrintHasLinkedQuote(
      (billableResult.data as { billing_quote?: unknown } | null)?.billing_quote,
    );
    const logs = sanitizeWorkReportPublicPrintLogs(logsWithAuthor, { linkedQuoteRequest });

    const brandingCompany =
      companies.get(String(reportRow.branding_company_id ?? '')) ??
      companies.get(String(reportRow.owner_company_id ?? ''));
    const logImages = await resolveLogImages(
      admin,
      logs as unknown as Array<{ id: string; images?: Array<{ storage_path: string; file_name: string; caption?: string | null }> }>,
    );
    const logoUrl = await resolveLogoUrl(admin, (brandingCompany?.logo_url as string | null | undefined) ?? null);

    // Kuvien tallennuspolkuja ei palauteta selaimelle (allekirjoitetut URLit ovat logImages-kentässä).
    const logsOut = logs.map((log) => ({ ...log, images: [] }));

    return json({
      version: WORK_REPORT_PUBLIC_PRINT_VERSION,
      report,
      logs: logsOut,
      logImages,
      equipmentLinks,
      meta: {
        companyName: (brandingCompany?.name as string | undefined) ?? '—',
        logoUrl,
      },
    });
  } catch (error) {
    console.error('work-report-print-share failed', error);
    return json({ error: 'Tulosteen lataus epäonnistui', code: 'internal' }, 500);
  }
});
