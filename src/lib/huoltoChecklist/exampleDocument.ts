import type { ChecklistCategoryKey } from '../huoltoCategories';
import { ensurePrintHtmlDocumentTitle } from '../printDocumentShell';
import { EXAMPLE_COMPANY_NAME, EXAMPLE_CUSTOMER, buildChecklistExampleReport } from './examples';
import { buildChecklistPrintTitle, generateChecklistPrintHtml } from './printHtml';

/** LVI / IV / Sähkö -esimerkkitulosteen HTML ja otsikko. */
export function buildChecklistExampleDocument(category: ChecklistCategoryKey, now = new Date()) {
  const data = buildChecklistExampleReport(category, now);
  const documentTitle = `Esimerkki — ${buildChecklistPrintTitle(data, EXAMPLE_CUSTOMER.name)}`;
  const html = generateChecklistPrintHtml(data, {
    companyName: EXAMPLE_COMPANY_NAME,
    imageUrls: {},
    customer: { name: EXAMPLE_CUSTOMER.name, address: EXAMPLE_CUSTOMER.address },
    device: null,
  });
  return { data, html: ensurePrintHtmlDocumentTitle(html, documentTitle), documentTitle };
}
