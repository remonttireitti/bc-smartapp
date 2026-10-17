import { buildChecklistExampleDocument } from './huoltoChecklist/exampleDocument';
import { buildKonvektoriExamplePrintDocument } from './huoltoRaportti/konvektoriExamplePrintDocument';
import { KONVEKTORI_EXAMPLE_COMPANY_NAME } from './huoltoRaportti/konvektoriExamplePrint';
import { exampleChecklistCategory, type ExamplePrintKey } from './examplePrints';
import { ensurePrintHtmlDocumentTitle } from './printDocumentShell';

/** Esimerkkitulosteen HTML ja otsikko (staattinen, keksitty data). */
export function buildExamplePrintDocument(key: ExamplePrintKey, now = new Date()): { html: string; documentTitle: string } {
  const category = exampleChecklistCategory(key);
  if (category) return buildChecklistExampleDocument(category, now);
  const { html, documentTitle } = buildKonvektoriExamplePrintDocument(
    { companyName: KONVEKTORI_EXAMPLE_COMPANY_NAME },
    { huoltoPaivamaara: now.toISOString().slice(0, 10) },
  );
  return { html: ensurePrintHtmlDocumentTitle(html, documentTitle), documentTitle };
}
