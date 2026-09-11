import { buildKonvektoriExampleReportData } from './konvektoriExamplePrint';
import { filterFaultyKonvektoriRows } from './konvektoriTarkastus';
import { generateMaintenanceReportPrintDocument } from './maintenanceReportPrintHtml';
import type { MaintenancePrintMeta } from './printHtml';
import type { HuoltoReportData } from './types';

export function buildKonvektoriExamplePrintDocument(
  meta: MaintenancePrintMeta,
  options?: { faultyOnly?: boolean; huoltoPaivamaara?: string },
): { data: HuoltoReportData; html: string; documentTitle: string } {
  let data = buildKonvektoriExampleReportData({ huoltoPaivamaara: options?.huoltoPaivamaara });
  if (options?.faultyOnly) {
    const faultyRows = filterFaultyKonvektoriRows(data.konvektoriRows);
    data = { ...data, konvektoriRows: faultyRows };
  }
  const documentTitle = options?.faultyOnly
    ? 'Esimerkki — vialliset konvektorit'
    : 'Esimerkki — konvektorihuoltopöytäkirja';
  const html = generateMaintenanceReportPrintDocument(data, meta);
  return { data, html, documentTitle };
}
