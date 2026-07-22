import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const REPORT_SELECT = `
  id, title, heading, description, orderer_name, location_text, status,
  scheduled_start, scheduled_end, completed_at,
  owner_company_id, created_by_company_id, created_by_user_id, branding_company_id,
  partnership_id, customer_id, equipment_id, assigned_user_id,
  delegate_company_id, delegated_at,
  created_by_user_name_snapshot, created_by_user_deleted,
  assigned_user_name_snapshot, assigned_user_deleted,
  customers(name),
  equipment(name, tag),
  owner_company:companies!work_reports_owner_company_id_fkey(name),
  branding_company:companies!work_reports_branding_company_id_fkey(name),
  created_by_company:companies!work_reports_created_by_company_id_fkey(name),
  delegate_company:companies!work_reports_delegate_company_id_fkey(name),
  assigned_user:profiles!work_reports_assigned_user_id_fkey(display_name),
  created_by_user:profiles!work_reports_created_by_user_id_fkey(display_name, email)
`;

const PRINT_LOG_SELECT = `
  id, work_report_id, log_date, entry_type,
  hours_regular, hours_overtime, hours_on_call, fixed_price_amount, hourly_rate_override,
  commission_amount, commission_note, work_done, created_by, created_at,
  author_name_snapshot, author_deleted,
  author:profiles!work_report_daily_logs_created_by_fkey(display_name),
  expense_lines:work_report_daily_expense_lines(
    id, daily_log_id, expense_type, description, qty, unit_price, bill_to_partner, bill_to_customer, customer_unit_price, sort_order
  ),
  refrigerant_lines:work_report_refrigerant_lines(
    id, daily_log_id, work_report_id, source, cylinder_id, warehouse_company_id, owner_user_id, supplier_name,
    supplier_paid_by, unit_price, customer_unit_price, bill_to_customer,
    refrigerant_type, qty_kg, notes, created_by, created_at,
    cylinder:refrigerant_cylinders(serial_number, refrigerant_type),
    warehouse_company:companies!work_report_refrigerant_lines_warehouse_company_id_fkey(name),
    owner_user:profiles!work_report_refrigerant_lines_owner_user_id_fkey(display_name)
  ),
  images:work_report_daily_log_images(id, daily_log_id, storage_path, file_name, mime_type, caption)
`;

const IMAGE_BUCKET = 'work-report-images';
const LOGO_BUCKET = 'company-logos';
const SIGNED_URL_TTL = 60 * 60 * 24 * 7;

function storagePath(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return null;
  return trimmed.replace(/^\/+/, '');
}

async function signedStorageUrl(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  path: string | null,
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

async function resolveLogoUrl(
  admin: ReturnType<typeof createClient>,
  logoUrl: string | null | undefined,
): Promise<string | null> {
  if (!logoUrl) return null;
  if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) return logoUrl;
  return signedStorageUrl(admin, LOGO_BUCKET, storagePath(logoUrl));
}

async function resolveLogImages(
  admin: ReturnType<typeof createClient>,
  logs: Array<{ id: string; images?: Array<{ storage_path: string; file_name: string; caption?: string | null }> }>,
): Promise<Record<string, Array<{ fileName: string; url: string; caption: string }>>> {
  const result: Record<string, Array<{ fileName: string; url: string; caption: string }>> = {};

  for (const log of logs) {
    const images: Array<{ fileName: string; url: string; caption: string }> = [];
    for (const image of log.images ?? []) {
      const path = storagePath(image.storage_path);
      const url = await signedStorageUrl(admin, IMAGE_BUCKET, path);
      if (!url) continue;
      images.push({
        fileName: image.file_name,
        url,
        caption: image.caption?.trim() ?? '',
      });
    }
    result[log.id] = images;
  }

  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Vain POST' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const token = String(body.token ?? '').trim();

    if (!token) {
      return new Response(JSON.stringify({ error: 'Puuttuva jakotunnus' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: share, error: shareError } = await admin
      .from('work_report_print_shares')
      .select('id, work_report_id, enabled, expires_at')
      .or(`short_token.eq.${token},access_token.eq.${token}`)
      .maybeSingle();

    if (shareError) {
      console.error('work-report-print-share lookup failed', shareError.message);
      return new Response(JSON.stringify({ error: 'Jakolinkin haku epäonnistui' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!share) {
      return new Response(JSON.stringify({ error: 'Jakolinkki ei ole voimassa' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!share.enabled) {
      return new Response(JSON.stringify({ error: 'Jakolinkki on poistettu käytöstä' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (share.expires_at && new Date(share.expires_at).getTime() <= Date.now()) {
      return new Response(JSON.stringify({ error: 'Jakolinkki on vanhentunut' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const [{ data: reportData, error: reportError }, { data: logsData, error: logsError }] =
      await Promise.all([
        admin.from('work_reports').select(REPORT_SELECT).eq('id', share.work_report_id).single(),
        admin
          .from('work_report_daily_logs')
          .select(PRINT_LOG_SELECT)
          .eq('work_report_id', share.work_report_id)
          .order('log_date', { ascending: true })
          .order('created_at', { ascending: true }),
      ]);

    if (reportError || !reportData) {
      return new Response(JSON.stringify({ error: 'Työraporttia ei löytynyt' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (logsError) {
      return new Response(JSON.stringify({ error: logsError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const logs = logsData ?? [];
    const brandingCompanyId = reportData.branding_company_id ?? reportData.owner_company_id;
    const { data: companyRow } = await admin
      .from('companies')
      .select('name, logo_url')
      .eq('id', brandingCompanyId)
      .single();

    const logImages = await resolveLogImages(admin, logs);
    const logoUrl = await resolveLogoUrl(admin, (companyRow as { logo_url?: string | null } | null)?.logo_url);

    return new Response(
      JSON.stringify({
        report: reportData,
        logs,
        logImages,
        meta: {
          companyName: (companyRow as { name?: string } | null)?.name ?? '—',
          logoUrl,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tulosteen lataus epäonnistui';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
