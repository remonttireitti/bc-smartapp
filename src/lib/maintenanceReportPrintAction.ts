import { buildMaintenanceReportPrintTitle, normalizeHuoltoReportData } from './huoltoRaportti/defaults';
import { filterFaultyKonvektoriRows } from './huoltoRaportti/konvektoriTarkastus';
import { generateMaintenanceReportPrintDocument } from './huoltoRaportti/maintenanceReportPrintHtml';
import type { HuoltoReportData } from './huoltoRaportti/types';
import { resolveMaintenanceReportImageUrls } from './maintenanceReportImageUrl';
import { collectMaintenancePrintImagePaths } from './maintenanceReportPrintImages';
import { syncMaintenanceReportPhotosFromDb } from './maintenanceReportPhotoSync';
import { resolveCompanyLogoUrl } from './companyLogo';
import { openPrintHtml } from './openPrintWindow';
import { embedPrintThumbnail, shrinkUrlMapForPrint } from './printImageEmbed';
import { ensurePrintHtmlDocumentTitle } from './printDocumentShell';
import { supabase } from './supabase';
import { isChecklistCategory } from './huoltoCategories';

export function buildMaintenanceReportPrintDocument(fragment: string, documentTitle: string): string {
  return ensurePrintHtmlDocumentTitle(fragment, documentTitle);
}

type MaintenancePrintContext = {
  reportData: HuoltoReportData;
  companyName: string;
  logoUrl?: string;
  imageUrls: Record<string, string>;
};

function collectPrintImagePaths(data: HuoltoReportData): string[] {
  return collectMaintenancePrintImagePaths(data);
}

async function resolveMaintenancePrintImageUrls(
  data: HuoltoReportData,
): Promise<Record<string, string>> {
  const paths = collectPrintImagePaths(data);
  return resolveMaintenanceReportImageUrls(paths);
}

type MaintenanceReportRow = {
  data: HuoltoReportData;
  branding_company_id: string | null;
  owner_company_id: string;
  customer_id: string | null;
};

async function fetchMaintenanceReportRow(reportId: string): Promise<MaintenanceReportRow> {
  const { data, error: loadError } = await supabase
    .from('maintenance_reports')
    .select('id, data, branding_company_id, owner_company_id, customer_id')
    .eq('id', reportId)
    .single();
  if (loadError || !data) {
    throw new Error(loadError?.message ?? 'Raporttia ei löytynyt.');
  }
  return data as MaintenanceReportRow;
}

async function loadPrintLogo(companyId: string, embed: boolean) {
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
    if (resolved) {
      if (embed) {
        const embedded = await embedPrintThumbnail(resolved);
        logoUrl = embedded.startsWith('data:') ? embedded : resolved;
      } else {
        logoUrl = resolved;
      }
    }
  } catch {
    /* optional logo */
  }
  return { companyName, logoUrl };
}

/**
 * Logo ja kuvat haetaan rinnakkain. embedImages=false (tulostesivu): kuvat allekirjoitetuilla
 * URL:eilla, selain lataa ne itse — ei täysikokoisten kuvien latausta ja pienennystä ennen näyttöä.
 */
async function loadMaintenancePrintContext(
  reportId: string,
  dataOverride?: HuoltoReportData,
  options?: { row?: MaintenanceReportRow; embedImages?: boolean },
): Promise<MaintenancePrintContext> {
  const embed = options?.embedImages !== false;
  const row = options?.row ?? (await fetchMaintenanceReportRow(reportId));
  const companyId = row.branding_company_id ?? row.owner_company_id;

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

  const imagesTask = (async () => {
    const photoSync = await syncMaintenanceReportPhotosFromDb(reportId, normalized);
    const reportData = photoSync.data;
    if (photoSync.changed && !dataOverride) {
      void supabase
        .from('maintenance_reports')
        .update({ data: reportData, updated_at: new Date().toISOString() })
        .eq('id', reportId)
        .then(() => undefined);
    }
    const rawImageUrls = await resolveMaintenancePrintImageUrls(reportData);
    const imageUrls = embed ? await shrinkUrlMapForPrint(rawImageUrls) : rawImageUrls;
    return { reportData, imageUrls };
  })();

  const [{ companyName, logoUrl }, { reportData, imageUrls }] = await Promise.all([
    loadPrintLogo(companyId, embed),
    imagesTask,
  ]);

  return { reportData, companyName, logoUrl, imageUrls };
}

function buildMaintenancePrintBundle(
  ctx: MaintenancePrintContext,
  reportData: HuoltoReportData,
  documentTitle?: string,
) {
  const title = documentTitle ?? buildMaintenanceReportPrintTitle(reportData);
  const html = ensurePrintHtmlDocumentTitle(
    generateMaintenanceReportPrintDocument(reportData, {
      companyName: ctx.companyName,
      logoUrl: ctx.logoUrl,
      imageUrls: ctx.imageUrls,
    }),
    title,
  );

  return {
    data: reportData,
    fragment: html,
    documentTitle: title,
    html,
  };
}

export async function loadMaintenanceReportPrintBundle(
  reportId: string,
  options?: { dataOverride?: HuoltoReportData; faultyKonvektoritOnly?: boolean; embedImages?: boolean },
) {
  let row: MaintenanceReportRow | undefined;
  if (!options?.dataOverride) {
    row = await fetchMaintenanceReportRow(reportId);
    const category = (row.data as { reportCategory?: string | null } | null)?.reportCategory ?? null;
    if (isChecklistCategory(category)) {
      const { loadChecklistPrintBundle } = await import('./huoltoChecklist/printBundle');
      const bundle = await loadChecklistPrintBundle(reportId, category, options?.embedImages !== false);
      return {
        data: bundle.data as unknown as HuoltoReportData,
        fragment: bundle.html,
        documentTitle: bundle.documentTitle,
        html: bundle.html,
      };
    }
  }
  const ctx = await loadMaintenancePrintContext(reportId, options?.dataOverride, {
    row,
    embedImages: options?.embedImages,
  });
  let reportData = ctx.reportData;
  if (options?.faultyKonvektoritOnly) {
    const faultyRows = filterFaultyKonvektoriRows(reportData.konvektoriRows);
    if (faultyRows.length === 0) {
      throw new Error('Ei viallisia konvektoreita tulostettavaksi.');
    }
    reportData = { ...reportData, konvektoriRows: faultyRows };
    const documentTitle = `${buildMaintenanceReportPrintTitle(reportData)} — vialliset konvektorit`;
    return buildMaintenancePrintBundle(ctx, reportData, documentTitle);
  }
  return buildMaintenancePrintBundle(ctx, reportData);
}

export async function openMaintenanceReportPrint(
  reportId: string,
  dataOverride?: HuoltoReportData,
) {
  const bundle = await loadMaintenanceReportPrintBundle(reportId, { dataOverride });
  openPrintHtml(bundle.html, { documentTitle: bundle.documentTitle });
}

async function loadMaintenanceReportKonvektoriFaultPrintBundle(
  reportId: string,
  dataOverride?: HuoltoReportData,
) {
  return loadMaintenanceReportPrintBundle(reportId, { dataOverride, faultyKonvektoritOnly: true });
}

export async function openMaintenanceReportKonvektoriFaultPrint(
  reportId: string,
  dataOverride?: HuoltoReportData,
) {
  const bundle = await loadMaintenanceReportKonvektoriFaultPrintBundle(reportId, dataOverride);
  openPrintHtml(bundle.html, { documentTitle: bundle.documentTitle });
}
