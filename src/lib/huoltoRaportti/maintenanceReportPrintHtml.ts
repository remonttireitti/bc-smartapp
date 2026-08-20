import { buildMaintenanceReportPrintTitle } from './defaults';
import { generateMaintenanceReportHtml, type MaintenancePrintMeta } from './printHtml';
import type { HuoltoReportData } from './types';
import { ensurePrintHtmlDocumentTitle } from '../printDocumentShell';

/** Tuotantotuloste — sama section-malli kuin lomake (printHtml.ts). */
export function generateMaintenanceReportPrintDocument(
  data: HuoltoReportData,
  meta: MaintenancePrintMeta,
): string {
  const fragment = generateMaintenanceReportHtml(data, meta);
  const documentTitle = buildMaintenanceReportPrintTitle(data);
  return ensurePrintHtmlDocumentTitle(fragment, documentTitle);
}
