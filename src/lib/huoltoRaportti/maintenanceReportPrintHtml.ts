import { buildMaintenanceReportPrintTitle } from './defaults';
import { generateMaintenanceReportHtml, type MaintenancePrintMeta } from './printHtml';
import type { HuoltoReportData } from './types';
import { escapeHtmlPrint } from '../printDocumentShell';

function wrapMaintenancePrintFragment(fragment: string, documentTitle: string): string {
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

/** Tuotantotuloste — sama section-malli kuin lomake (printHtml.ts). */
export function generateMaintenanceReportPrintDocument(
  data: HuoltoReportData,
  meta: MaintenancePrintMeta,
): string {
  const fragment = generateMaintenanceReportHtml(data, meta);
  const documentTitle = buildMaintenanceReportPrintTitle(data);
  return wrapMaintenancePrintFragment(fragment, documentTitle);
}
