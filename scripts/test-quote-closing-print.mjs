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
    notes: '',
    validUntil: '2026-12-31',
  },
  customer: { name: 'Testi Oy' },
  meta: { companyName: 'Lämpökatsastus Oy' },
  mode: 'enduser',
});
assert.match(html, /Kiitos tarjouspyynnöstänne/);
assert.match(html, /Ystävällisin terveisin/);
assert.match(html, /quote-print-end-block/);

console.log('test-quote-closing-print: ok');
