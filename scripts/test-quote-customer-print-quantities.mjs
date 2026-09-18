import assert from 'node:assert/strict';
import {
  DEFAULT_QUOTE_CUSTOMER_PRINT_QUANTITY_SETTINGS,
  parseQuoteCustomerPrintQuantitySettings,
  quoteQuantityVisibleForKind,
  serializeQuoteCustomerPrintQuantitySettings,
} from '../src/lib/quoteCustomerPrintSettings.ts';
import {
  formatQuoteMaterialQtyLabel,
  formatQuoteWorkHoursQtyLabel,
} from '../src/lib/quoteCustomerPrintQuantity.ts';

const laborRow = {
  id: '1',
  name: 'Asennustyö',
  quantity: 2.5,
  purchasePrice: 40,
  marginPercent: 25,
  sellPrice: 50,
  rowKind: 'labor',
};

assert.equal(
  formatQuoteMaterialQtyLabel(laborRow, DEFAULT_QUOTE_CUSTOMER_PRINT_QUANTITY_SETTINGS),
  '2.5 h',
);

const supplyRow = {
  id: '2',
  name: 'Putki',
  quantity: 3,
  purchasePrice: 10,
  marginPercent: 20,
  sellPrice: 12,
  rowKind: 'supply',
  unit: 'm',
};
assert.equal(
  formatQuoteMaterialQtyLabel(supplyRow, DEFAULT_QUOTE_CUSTOMER_PRINT_QUANTITY_SETTINGS),
  '3 m',
);

const urakkaRow = {
  ...supplyRow,
  id: '3',
  unit: 'urakka',
};
assert.equal(
  formatQuoteMaterialQtyLabel(urakkaRow, DEFAULT_QUOTE_CUSTOMER_PRINT_QUANTITY_SETTINGS),
  'urakka',
);

const hidden = {
  ...DEFAULT_QUOTE_CUSTOMER_PRINT_QUANTITY_SETTINGS,
  showSupplyQuantities: false,
};
assert.equal(formatQuoteMaterialQtyLabel(supplyRow, hidden), null);
assert.equal(quoteQuantityVisibleForKind('supply', hidden), false);

assert.equal(
  formatQuoteWorkHoursQtyLabel(4, DEFAULT_QUOTE_CUSTOMER_PRINT_QUANTITY_SETTINGS),
  '4 h',
);

const hiddenWork = {
  ...DEFAULT_QUOTE_CUSTOMER_PRINT_QUANTITY_SETTINGS,
  showWorkItemQuantities: false,
};
assert.equal(formatQuoteWorkHoursQtyLabel(4, hiddenWork), null);

const params = serializeQuoteCustomerPrintQuantitySettings({
  ...DEFAULT_QUOTE_CUSTOMER_PRINT_QUANTITY_SETTINGS,
  showQuantities: false,
});
assert.equal(parseQuoteCustomerPrintQuantitySettings(params).showQuantities, false);
assert.equal(parseQuoteCustomerPrintQuantitySettings(params).showLaborQuantities, false);

const customUnitParams = serializeQuoteCustomerPrintQuantitySettings({
  ...DEFAULT_QUOTE_CUSTOMER_PRINT_QUANTITY_SETTINGS,
  defaultUnits: { ...DEFAULT_QUOTE_CUSTOMER_PRINT_QUANTITY_SETTINGS.defaultUnits, expense: 'erä' },
});
assert.equal(
  parseQuoteCustomerPrintQuantitySettings(customUnitParams).defaultUnits.expense,
  'erä',
);

const fontParams = serializeQuoteCustomerPrintQuantitySettings({
  ...DEFAULT_QUOTE_CUSTOMER_PRINT_QUANTITY_SETTINGS,
  taglineFontSizePx: 13,
  closingFontSizePx: 12,
});
assert.equal(fontParams.get('fontti_esittely'), '13');
assert.equal(fontParams.get('fontti_kiitos'), '12');
const parsedFonts = parseQuoteCustomerPrintQuantitySettings(fontParams);
assert.equal(parsedFonts.taglineFontSizePx, 13);
assert.equal(parsedFonts.closingFontSizePx, 12);

const { quotePrintTypographyStyleAttr } = await import('../src/lib/quoteCustomerPrintSettings.ts');
assert.match(
  quotePrintTypographyStyleAttr({ taglineFontSizePx: 13, closingFontSizePx: 12 }),
  /--quote-tagline-font-size:13px/,
);
assert.match(
  quotePrintTypographyStyleAttr({ taglineFontSizePx: 13, closingFontSizePx: 12 }),
  /--quote-closing-font-size:12px/,
);

console.log('test-quote-customer-print-quantities: ok');
