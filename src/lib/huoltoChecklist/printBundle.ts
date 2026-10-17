import { resolveCompanyLogoUrl } from '../companyLogo';
import { resolveMaintenanceReportImageUrls } from '../maintenanceReportImageUrl';
import { embedPrintThumbnail, shrinkUrlMapForPrint } from '../printImageEmbed';
import { ensurePrintHtmlDocumentTitle } from '../printDocumentShell';
import { formatCustomerAddressParts } from '../customers';
import { supabase } from '../supabase';
import type { ChecklistCategoryKey } from '../huoltoCategories';
import { normalizeChecklistReport, type ChecklistReportData } from './logic';
import { buildChecklistPrintTitle, generateChecklistPrintHtml } from './printHtml';

type Row = {
  data: unknown;
  branding_company_id: string | null;
  owner_company_id: string;
  customers: { name: string; address: string | null; postal_code: string | null; city: string | null } | null;
  equipment: { name: string; tag: string | null; model: string | null; serial_number: string | null; location: string | null } | null;
};

export async function loadChecklistPrintBundle(reportId: string, category: ChecklistCategoryKey, embedImages = true) {
  const { data: rowData, error } = await supabase
    .from('maintenance_reports')
    .select('data, branding_company_id, owner_company_id, customers(name, address, postal_code, city), equipment(name, tag, model, serial_number, location)')
    .eq('id', reportId)
    .single();
  if (error || !rowData) throw new Error(error?.message ?? 'Raporttia ei löytynyt.');
  const row = rowData as unknown as Row;
  const data: ChecklistReportData = normalizeChecklistReport(row.data, category);

  const logoTask = (async () => {
    const { data: companyRow } = await supabase
      .from('companies')
      .select('name, logo_url')
      .eq('id', row.branding_company_id ?? row.owner_company_id)
      .single();
    const company = companyRow as { name: string; logo_url: string | null } | null;
    let logoUrl: string | undefined;
    try {
      const resolved = await resolveCompanyLogoUrl(company?.logo_url);
      if (resolved) {
        const embedded = embedImages ? await embedPrintThumbnail(resolved) : resolved;
        logoUrl = embedded.startsWith('data:') ? embedded : resolved;
      }
    } catch {
      /* logo valinnainen */
    }
    return { company, logoUrl };
  })();
  const paths = Object.values(data.items).flatMap((s) => (s.photos ?? []).map((p) => p.storagePath));
  const imagesTask = (async () => {
    if (!paths.length) return {} as Record<string, string>;
    const raw = await resolveMaintenanceReportImageUrls(paths, 3600, embedImages ? undefined : 960);
    return embedImages ? shrinkUrlMapForPrint(raw) : raw;
  })();
  const [{ company, logoUrl }, imageUrls] = await Promise.all([logoTask, imagesTask]);

  const customerName = row.customers?.name ?? data.asiakas;
  const documentTitle = buildChecklistPrintTitle(data, customerName);
  const html = ensurePrintHtmlDocumentTitle(
    generateChecklistPrintHtml(data, {
      companyName: company?.name ?? '',
      logoUrl,
      imageUrls,
      customer: row.customers
        ? { name: row.customers.name, address: formatCustomerAddressParts(row.customers) || data.osoite }
        : null,
      device: row.equipment
        ? { name: row.equipment.name, tag: row.equipment.tag, model: row.equipment.model, serial: row.equipment.serial_number, location: row.equipment.location }
        : null,
    }),
    documentTitle,
  );
  return { data, html, documentTitle };
}
