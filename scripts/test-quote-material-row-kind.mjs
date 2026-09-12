import assert from 'node:assert/strict';
import { computeQuoteInternalTotals } from '../src/lib/quoteRequest/calculations.ts';
import { extractQuotePurchaseLines } from '../src/lib/quotePurchaseLines.ts';
import {
  hasOfferedDeviceRows,
  installationSuppliesDevicePurchaseNet,
  installationSuppliesSupplyPurchaseNet,
} from '../src/lib/quoteRequest/installationSupplies.ts';
import { resolveNonPumpDeviceSellNet } from '../src/lib/quoteRequest/manualDevicePricing.ts';
import { createEmptyQuoteRequestData } from '../src/lib/quoteRequest/defaults.ts';

const base = createEmptyQuoteRequestData('huolto');
const quote = {
  ...base,
  installationSupplies: [
    {
      id: 'dev-1',
      name: '3 kpl jäähdytyskone',
      quantity: 1,
      purchasePrice: 22950,
      marginPercent: 25,
      sellPrice: 28687.5,
      rowKind: 'device',
    },
    {
      id: 'sup-1',
      name: 'Kuparit',
      quantity: 1,
      purchasePrice: 500,
      marginPercent: 80,
      sellPrice: 900,
      rowKind: 'supply',
    },
  ],
  devicePurchaseOverrideNet: null,
  deviceSaleOverrideNet: null,
};

assert.equal(hasOfferedDeviceRows(quote.installationSupplies), true);
assert.equal(installationSuppliesDevicePurchaseNet(quote.installationSupplies), 22950);
assert.equal(installationSuppliesSupplyPurchaseNet(quote.installationSupplies), 500);

const internal = computeQuoteInternalTotals(quote, null);
assert.equal(internal.devicePurchaseNet, 22950);
assert.equal(internal.materialsPurchaseNet, 500);

assert.equal(resolveNonPumpDeviceSellNet(quote), 28687.5);

const lines = extractQuotePurchaseLines(quote);
assert.ok(lines.some((line) => line.source === 'device' && line.quote_purchase_net === 22950));
assert.ok(lines.some((line) => line.source === 'material' && line.quote_purchase_net === 500));
assert.equal(
  lines.filter((line) => line.source === 'group' && line.id === 'group:materials-adjustment').length,
  0,
);

console.log('test-quote-material-row-kind: ok');
