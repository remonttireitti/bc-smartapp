import { maintenanceReportListTitle, normalizeHuoltoReportData } from './huoltoRaportti/defaults';
import { generateMaintenanceReportHtml } from './huoltoRaportti/printHtml';
import type { HuoltoReportData } from './huoltoRaportti/types';
import { resolveCompanyLogoUrl } from './companyLogo';
import { openPrintHtml } from './openPrintWindow';
import { escapeHtmlPrint } from './printDocumentShell';
import { supabase } from './supabase';

export function buildMaintenanceReportPrintDocument(fragment: string, documentTitle: string): string {
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

export async function loadMaintenanceReportPrintBundle(reportId: string) {
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

  const normalized = normalizeHuoltoReportData({
    ...row.data,
    customerId: row.data.customerId ?? row.customer_id ?? undefined,
  });

  const fragment = generateMaintenanceReportHtml(normalized, { companyName, logoUrl });
  const documentTitle = maintenanceReportListTitle(normalized);

  return {
    data: normalized,
    fragment,
    documentTitle,
    html: buildMaintenanceReportPrintDocument(fragment, documentTitle),
  };
}

export async function openMaintenanceReportPrint(reportId: string) {
  const bundle = await loadMaintenanceReportPrintBundle(reportId);
  openPrintHtml(bundle.html);
}
