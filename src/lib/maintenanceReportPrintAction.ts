import { buildMaintenanceReportPrintTitle, normalizeHuoltoReportData } from './huoltoRaportti/defaults';
import { generateMaintenanceReportPrintDocument } from './huoltoRaportti/maintenanceReportPrintHtml';
import { generateKonvektoriFaultPrintHtml } from './huoltoRaportti/konvektoriPrint';
import type { HuoltoReportData } from './huoltoRaportti/types';
import { resolveMaintenanceReportImageUrls } from './maintenanceReportImageUrl';
import { collectMaintenancePrintImagePaths } from './maintenanceReportPrintImages';
import { syncMaintenanceReportPhotosFromDb } from './maintenanceReportPhotoSync';
import { resolveCompanyLogoUrl } from './companyLogo';
import { openPrintHtml } from './openPrintWindow';
import { shrinkUrlMapForPrint } from './printImageEmbed';
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
  const paths = collectPrintImagePaths(data);
  return resolveMaintenanceReportImageUrls(paths);
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

  const rawImageUrls = await resolveMaintenancePrintImageUrls(reportData);
  const imageUrls = await shrinkUrlMapForPrint(rawImageUrls);
  const html = generateMaintenanceReportPrintDocument(reportData, { companyName, logoUrl, imageUrls });
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
  openPrintHtml(bundle.html, { documentTitle: bundle.documentTitle });
}

async function loadMaintenanceReportKonvektoriFaultPrintBundle(
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

  const reportData = normalizeHuoltoReportData(
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

  const html = generateKonvektoriFaultPrintHtml(reportData, { companyName, logoUrl });

  return {
    data: reportData,
    html,
    documentTitle: `${buildMaintenanceReportPrintTitle(reportData)} — vialliset`,
  };
}

export async function openMaintenanceReportKonvektoriFaultPrint(
  reportId: string,
  dataOverride?: HuoltoReportData,
) {
  const bundle = await loadMaintenanceReportKonvektoriFaultPrintBundle(reportId, dataOverride);
  openPrintHtml(bundle.html, {
    documentTitle: bundle.documentTitle,
    imageWaitMs: 2_000,
  });
}
