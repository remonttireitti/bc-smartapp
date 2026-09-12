import assert from 'node:assert/strict';
import { buildQuoteHinnoitteluTiles } from '../src/lib/quoteRequest/quoteHinnoitteluEntries.ts';
import {
  QUOTE_MATERIAL_ROW_KIND_LABELS,
  QUOTE_MATERIAL_ROW_KINDS,
  quoteMaterialRowKindLabel,
  resolveQuoteMaterialRowKind,
} from '../src/lib/quoteRequest/installationSupplies.ts';
import { QUOTE_CATEGORY_LABELS } from '../src/lib/workReportEntryCategories.ts';
import { createEmptyQuoteRequestData } from '../src/lib/quoteRequest/defaults.ts';

assert.deepEqual(QUOTE_MATERIAL_ROW_KINDS, ['labor', 'supply', 'expense', 'device']);
assert.equal(quoteMaterialRowKindLabel('labor'), 'Työ');
assert.equal(quoteMaterialRowKindLabel('supply'), 'Tarvike');
assert.equal(quoteMaterialRowKindLabel('expense'), 'Kulu');
assert.equal(quoteMaterialRowKindLabel('device'), 'Laite');
assert.equal(QUOTE_CATEGORY_LABELS.labor, 'Työt');
assert.equal(QUOTE_CATEGORY_LABELS.supplies, 'Tarvikkeet');
assert.equal(QUOTE_CATEGORY_LABELS.expenses, 'Kulut');
assert.equal(QUOTE_CATEGORY_LABELS.device, 'Laite');

assert.equal(resolveQuoteMaterialRowKind({ rowKind: 'expense' }), 'expense');
assert.equal(resolveQuoteMaterialRowKind({}), 'supply');

const huolto = createEmptyQuoteRequestData('huolto');
huolto.devicePurchaseOverrideNet = 10000;
huolto.deviceMarginPercent = 25;
huolto.deviceBrand = 'Mitsubishi';
huolto.deviceModel = 'V-Multi';

const tiles = buildQuoteHinnoitteluTiles(huolto);
assert.ok(!tiles.some((tile) => tile.id === 'device-pricing'), 'Laite/urakka-ruutu poistettu');

console.log('test-quote-unified-row-types: ok');
