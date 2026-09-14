import assert from 'node:assert/strict';
import { computeQuoteInternalTotals } from '../src/lib/quoteRequest/calculations.ts';
import { extractQuotePurchaseLines } from '../src/lib/quotePurchaseLines.ts';
import {
  hasOfferedDeviceRows,
  installationSuppliesDevicePurchaseNet,
  installationSuppliesSupplyPurchaseNet,
} from '../src/lib/quoteRequest/installationSupplies.ts';
import {
  manualDevicePrintLabel,
  quoteUsesOfferedDeviceRows,
  resolveNonPumpDeviceSellNet,
} from '../src/lib/quoteRequest/manualDevicePricing.ts';
import { QUOTE_TYPE_LABELS } from '../src/lib/quoteRequest/constants.ts';
import { generateQuoteServicePrintHtml } from '../src/lib/quoteRequest/printHtml.ts';
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
assert.equal(quoteUsesOfferedDeviceRows(quote), true);
assert.equal(manualDevicePrintLabel(quote), '3 kpl jäähdytyskone');
assert.equal(QUOTE_TYPE_LABELS.huolto, 'Tarjous huollosta tai korjauksesta');

const servicePrint = generateQuoteServicePrintHtml({
  data: {
    ...quote,
    deviceBrand: '406 tarkkaamo',
    deviceModel: '406 tarkkaamo KAC 73',
    faultDescription: 'Vanha kompressori rikki',
    workItems: [
      {
        id: 'work-1',
        description: 'Asennustyö',
        hours: 8,
        pricePerHour: 65,
        materials: [],
        equipmentName: '406 tarkkaamo 406 tarkkaamo KAC 73',
      },
    ],
  },
  customer: { name: 'Messukeskus', address: 'Messuaukio 1', city: 'Helsinki' },
  meta: { companyName: 'Lämpökatsastus Oy' },
  mode: 'enduser',
});
assert.match(servicePrint, /Tarjous huollosta tai korjauksesta/);
assert.match(servicePrint, /Huollettava laite/);
assert.match(servicePrint, /3 kpl jäähdytyskone/);
assert.doesNotMatch(servicePrint, /406 tarkkaamo 406 tarkkaamo KAC 73<\/td>/);

const lines = extractQuotePurchaseLines(quote);
assert.ok(lines.some((line) => line.source === 'device' && line.quote_purchase_net === 22950));
assert.ok(lines.some((line) => line.source === 'material' && line.quote_purchase_net === 500));
assert.equal(
  lines.filter((line) => line.source === 'group' && line.id === 'group:materials-adjustment').length,
  0,
);

const laborQuote = {
  ...base,
  workItems: [],
  laborHours: 0,
  installationSupplies: [
    {
      id: 'lab-1',
      name: 'Asennustyö',
      quantity: 8,
      purchasePrice: 50,
      marginPercent: 30,
      sellPrice: 65,
      rowKind: 'labor',
    },
    {
      id: 'exp-1',
      name: 'Km korvaus',
      quantity: 100,
      purchasePrice: 0.5,
      marginPercent: 20,
      sellPrice: 0.6,
      rowKind: 'expense',
    },
  ],
};

const laborTotals = computeQuoteInternalTotals(laborQuote, null);
assert.equal(laborTotals.workSellNet, 520);
assert.ok(laborTotals.travelSellNet >= 60);

console.log('test-quote-material-row-kind: ok');
