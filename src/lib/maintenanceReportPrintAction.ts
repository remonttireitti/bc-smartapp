import { buildMaintenanceReportPrintTitle, normalizeHuoltoReportData } from './huoltoRaportti/defaults';
import { filterFaultyKonvektoriRows } from './huoltoRaportti/konvektoriTarkastus';
import { ilpLisaLaitteet, isIlpMultiDeviceType, mergeIlpVisitReports } from './huoltoRaportti/ilpLaitteet';
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

export function buildMaintenanceReportPrintDocument(fragment: string, documentTitle: string): string {
  return ensurePrintHtmlDocumentTitle(fragment, documentTitle);
}

type MaintenancePrintContext = {
  reportId: string;
  ownerCompanyId: string;
  customerId: string | null;
  status: string | null;
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

async function loadMaintenancePrintContext(
  reportId: string,
  dataOverride?: HuoltoReportData,
): Promise<MaintenancePrintContext> {
  const { data, error: loadError } = await supabase
    .from('maintenance_reports')
    .select('id, data, branding_company_id, owner_company_id, customer_id, status')
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
    status: string | null;
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
    if (resolved) {
      const embedded = await embedPrintThumbnail(resolved);
      logoUrl = embedded.startsWith('data:') ? embedded : resolved;
    }
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

  return {
    reportId,
    ownerCompanyId: row.owner_company_id,
    customerId: row.customer_id,
    status: row.status,
    reportData,
    companyName,
    logoUrl,
    imageUrls,
  };
}

function buildMaintenancePrintBundle(
  ctx: MaintenancePrintContext,
  reportData: HuoltoReportData,
  documentTitle?: string,
  ilpVisit?: IlpVisitPrintInfo,
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
    ilpVisit: ilpVisit ?? { siblingCount: 0, combined: false },
  };
}

export type IlpVisitPrintInfo = { siblingCount: number; combined: boolean };

/**
 * Vanhat ILP-raportit (yksi laite / raportti): saman käynnin muut raportit —
 * sama omistaja, asiakas, huoltopäivä, tila ja asiakirjatyyppi.
 */
async function loadIlpVisitSiblings(ctx: MaintenancePrintContext): Promise<HuoltoReportData[]> {
  const base = ctx.reportData;
  const date = String(base.huoltoPaivamaara ?? '').trim();
  if (!isIlpMultiDeviceType(base.laiteTyyppi) || ilpLisaLaitteet(base).length > 0) return [];
  if (!ctx.customerId || !date) return [];
  let query = supabase
    .from('maintenance_reports')
    .select('id, data, customer_id')
    .eq('owner_company_id', ctx.ownerCompanyId)
    .eq('customer_id', ctx.customerId)
    .eq('data->>laiteTyyppi', 'lämpöpumppu')
    .eq('data->>huoltoPaivamaara', date)
    .neq('id', ctx.reportId)
    .order('created_at', { ascending: true })
    .limit(40);
  if (ctx.status) query = query.eq('status', ctx.status);
  const { data: rows, error } = await query;
  if (error || !rows) return [];
  const kind = (d: HuoltoReportData) => (d.huoltoReportDocumentKind === 'kayttoonotto' ? 'kayttoonotto' : 'huolto');
  const siblings: HuoltoReportData[] = [];
  for (const raw of rows as { id: string; data: HuoltoReportData; customer_id: string | null }[]) {
    const normalized = normalizeHuoltoReportData({
      ...raw.data,
      customerId: raw.data?.customerId ?? raw.customer_id ?? undefined,
    });
    if (kind(normalized) !== kind(base) || ilpLisaLaitteet(normalized).length > 0) continue;
    try {
      siblings.push((await syncMaintenanceReportPhotosFromDb(raw.id, normalized)).data);
    } catch {
      siblings.push(normalized);
    }
  }
  return siblings;
}

export async function loadMaintenanceReportPrintBundle(
  reportId: string,
  options?: {
    dataOverride?: HuoltoReportData;
    faultyKonvektoritOnly?: boolean;
    /** ILP: yhdistä saman käynnin vanhat laiteraportit yhdeksi pöytäkirjaksi (oletus true). */
    combineIlpVisit?: boolean;
  },
) {
  const ctx = await loadMaintenancePrintContext(reportId, options?.dataOverride);
  let reportData = ctx.reportData;
  if (isIlpMultiDeviceType(reportData.laiteTyyppi) && !options?.faultyKonvektoritOnly) {
    const siblings = await loadIlpVisitSiblings(ctx);
    const combined = siblings.length > 0 && options?.combineIlpVisit !== false;
    if (combined) {
      reportData = mergeIlpVisitReports(reportData, siblings);
      const rawImageUrls = await resolveMaintenancePrintImageUrls(reportData);
      ctx.imageUrls = await shrinkUrlMapForPrint(rawImageUrls);
    }
    return buildMaintenancePrintBundle(ctx, reportData, undefined, { siblingCount: siblings.length, combined });
  }
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
