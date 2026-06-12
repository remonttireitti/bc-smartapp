import { buildMaintenanceReportPrintTitle, normalizeHuoltoReportData } from './huoltoRaportti/defaults';
import { generateLegacyMaintenanceReportHtml } from './huoltoRaportti/legacyPrintAdapter';
import type { HuoltoReportData } from './huoltoRaportti/types';
import { BUCKET } from './maintenanceReportImages';
import { collectMaintenancePrintImagePaths } from './maintenanceReportPrintImages';
import { syncMaintenanceReportPhotosFromDb } from './maintenanceReportPhotoSync';
import { resolveCompanyLogoUrl } from './companyLogo';
import { openPrintHtml } from './openPrintWindow';
import { escapeHtmlPrint } from './printDocumentShell';
import { supabase } from './supabase';

export function buildMaintenanceReportPrintDocument(fragment: string, documentTitle: string): string {
  // Legacy print already returns a full HTML document.
  if (/<!doctype html/i.test(fragment) || /<html[\s>]/i.test(fragment)) {
    return fragment;
  }
  return `<!doctype html>
<html lang="fi">
<head>
<meta charset="utf-8" />
<title>${escapeHtmlPrint(documentTitle)}</title>
</head>
<body>
${fragment}
</body>
</html>`;
}

function collectPrintImagePaths(data: HuoltoReportData): string[] {
  return collectMaintenancePrintImagePaths(data);
}

async function resolveMaintenancePrintImageUrls(
  data: HuoltoReportData,
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  const paths = collectPrintImagePaths(data);

  await Promise.all(
    paths.map(async (path) => {
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
      if (signed?.signedUrl) map[path] = signed.signedUrl;
    }),
  );

  return map;
}

export async function loadMaintenanceReportPrintBundle(
  reportId: string,
  dataOverride?: HuoltoReportData,
) {
  const { data, error: loadError } = await supabase
    .from('maintenance_reports')
    .select('id, data, branding_company_id, owner_company_id, customer_id')
    .eq('id', reportId)
    .single();

  if (loadError || !data) {
    throw new Error(loadError?.message ?? 'Raporttia ei löytynyt.');
  }

  const row = data as {
    data: HuoltoReportData;
    branding_company_id: string | null;
    owner_company_id: string;
    customer_id: string | null;
  };

  const companyId = row.branding_company_id ?? row.owner_company_id;
  const { data: companyRow } = await supabase
    .from('companies')
    .select('name, logo_url')
    .eq('id', companyId)
    .single();

  const companyName = (companyRow as { name: string } | null)?.name ?? '—';
  let logoUrl: string | undefined;
  try {
    const resolved = await resolveCompanyLogoUrl(
      (companyRow as { logo_url: string | null } | null)?.logo_url,
    );
    if (resolved) logoUrl = resolved;
  } catch {
    /* optional logo */
  }

  const normalized = normalizeHuoltoReportData(
    dataOverride
      ? {
          ...dataOverride,
          customerId: dataOverride.customerId ?? row.customer_id ?? undefined,
        }
      : {
          ...row.data,
          customerId: row.data.customerId ?? row.customer_id ?? undefined,
        },
  );

  const photoSync = await syncMaintenanceReportPhotosFromDb(reportId, normalized);
  const reportData = photoSync.data;
  if (photoSync.changed && !dataOverride) {
    await supabase
      .from('maintenance_reports')
      .update({ data: reportData, updated_at: new Date().toISOString() })
      .eq('id', reportId);
  }

  const imageUrls = await resolveMaintenancePrintImageUrls(reportData);
  const html = generateLegacyMaintenanceReportHtml(reportData, { companyName, logoUrl, imageUrls });
  const documentTitle = buildMaintenanceReportPrintTitle(reportData);

  return {
    data: reportData,
    fragment: html,
    documentTitle,
    html,
  };
}

export async function openMaintenanceReportPrint(
  reportId: string,
  dataOverride?: HuoltoReportData,
) {
  const bundle = await loadMaintenanceReportPrintBundle(reportId, dataOverride);
  openPrintHtml(bundle.html);
}
