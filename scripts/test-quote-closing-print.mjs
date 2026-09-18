import assert from 'node:assert/strict';
import {
  QUOTE_CLOSING_SIGNATURE_LABEL,
  QUOTE_CLOSING_THANK_YOU_TEXT,
  quoteClosingPrintHtml,
} from '../src/lib/quoteRequest/quoteClosingPrint.ts';
import { generateQuoteServicePrintHtml } from '../src/lib/quoteRequest/printHtml.ts';

assert.match(QUOTE_CLOSING_THANK_YOU_TEXT, /Kiitos tarjouspyynnöstänne/);
assert.equal(QUOTE_CLOSING_SIGNATURE_LABEL, 'Ystävällisin terveisin');

const closing = quoteClosingPrintHtml({
  companyName: 'Lämpökatsastus Oy',
  settings: { quote_signatory_name: 'Matti Meikäläinen' },
});
assert.match(closing, /quote-closing-thanks/);
assert.match(closing, /Kiitos tarjouspyynnöstänne/);
assert.match(closing, /Ystävällisin terveisin/);
assert.match(closing, /Lämpökatsastus Oy/);
assert.match(closing, /Matti Meikäläinen/);

const styles = (await import('../src/lib/quoteRequest/quoteClosingPrint.ts')).quoteClosingPrintStyles();
assert.match(styles, /text-align:\s*center/);
assert.match(styles, /--quote-closing-font-size/);

const html = generateQuoteServicePrintHtml({
  data: {
    type: 'huolto',
    quoteVatProfile: 'business',
    vatRate: 0,
    introText: 'Huolto',
    faultDescription: '',
    workItems: [],
    materials: [],
    installationSupplies: [],
    optionalItems: [],
    notes: 'Muista huomio',
    deliveryTermsText: '',
    paymentTermsText: '',
    validUntil: '2026-12-31',
  },
  customer: { name: 'Testi Oy' },
  meta: { companyName: 'Lämpökatsastus Oy' },
  mode: 'enduser',
});
assert.match(html, /Kiitos tarjouspyynnöstänne/);
assert.match(html, /Ystävällisin terveisin/);
assert.match(html, /quote-print-page-2/);
const page2 = html.match(/quote-print-page-2[\s\S]*<\/body>/)?.[0] ?? '';
assert.match(page2, /Huomautukset/);
assert.match(page2, /Kiitos tarjouspyynnöstänne/);
assert.ok(
  page2.indexOf('Huomautukset') < page2.indexOf('Kiitos tarjouspyynnöstänne'),
  'closing should come after notes',
);

const otherHtml = generateQuoteServicePrintHtml({
  data: {
    type: 'huolto',
    quoteVatProfile: 'business',
    vatRate: 0,
    introText: 'Huolto',
    faultDescription: '',
    workItems: [],
    materials: [],
    installationSupplies: [],
    optionalItems: [],
    notes: 'Muista huomio',
    deliveryTermsText: '',
    paymentTermsText: '',
    validUntil: '2026-12-31',
  },
  customer: { name: 'Testi Oy' },
  meta: { companyName: 'Toinen Yritys Oy' },
  mode: 'enduser',
});
assert.match(otherHtml, /quote-print-end-block/);
assert.ok(
  otherHtml.indexOf('Huomautukset') < otherHtml.indexOf('Kiitos tarjouspyynnöstänne'),
  'non-LK closing should follow notes',
);

const { ensurePrintHtmlDocumentTitle, injectPrintDocumentBootstrap } = await import(
  '../src/lib/printDocumentShell.ts'
);
const bootstrapped = injectPrintDocumentBootstrap(
  ensurePrintHtmlDocumentTitle(html, 'Tarjous – Testi'),
  'Tarjous – Testi',
);
assert.match(bootstrapped, /class="no-print"/);
assert.match(bootstrapped, /Tulosta \/ PDF/);
assert.match(bootstrapped, /\.no-print\s*\{\s*display:\s*none\s*!important/);

console.log('test-quote-closing-print: ok');
