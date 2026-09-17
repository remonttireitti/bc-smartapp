import assert from 'node:assert/strict';
import {
  formatOptionalItemPrintPrice,
  optionalItemPrintAmount,
  optionalItemsPrintHtml,
} from '../src/lib/quoteRequest/optionalItemsPrint.ts';

assert.equal(optionalItemPrintAmount(342, 0), 342);
assert.equal(optionalItemPrintAmount(342, 25.5), 429.21);

assert.match(formatOptionalItemPrintPrice(342, 0), /^\+ /);
assert.match(formatOptionalItemPrintPrice(342, 0), /342,00/);

const html = optionalItemsPrintHtml({
  vatRate: 25.5,
  optionalItems: [{ id: '1', description: 'Pumppu', priceGross: 342, enabled: true }],
});
assert.match(html, /Pumppu — \+[\s\u00a0]?429,21/);

console.log('test-optional-item-print-price: ok');
