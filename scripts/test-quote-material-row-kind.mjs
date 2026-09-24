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
assert.equal(laborTotals.expensePurchaseNet, 50);
assert.equal(laborTotals.purchaseNet, 50);

const disposalQuote = {
  ...base,
  overallDiscountPercent: 5,
  vatRate: 0,
  installationLaborHours: 8,
  installationLaborPurchaseRate: 50,
  installationVehicleAllowance: 0,
  installationSupplies: [
    {
      id: 'lab-1',
      name: 'Asennustyö — työ',
      quantity: 8,
      purchasePrice: 50,
      marginPercent: 30,
      sellPrice: 65,
      rowKind: 'labor',
    },
    {
      id: 'sup-1',
      name: 'Asennustarvikkeet putkien jatkamiseen',
      quantity: 1,
      purchasePrice: 150,
      marginPercent: 80,
      sellPrice: 270,
      rowKind: 'supply',
    },
    {
      id: 'exp-1',
      name: 'Vanhojen laitteiden hävitys',
      quantity: 1,
      purchasePrice: 200,
      marginPercent: 80,
      sellPrice: 360,
      rowKind: 'expense',
    },
    {
      id: 'sup-2',
      name: 'Asennustarvikkeet kotelointiin',
      quantity: 1,
      purchasePrice: 100,
      marginPercent: 80,
      sellPrice: 180,
      rowKind: 'supply',
    },
    {
      id: 'sup-3',
      name: 'Typpi koeponnistukseen',
      quantity: 1,
      purchasePrice: 50,
      marginPercent: 80,
      sellPrice: 90,
      rowKind: 'supply',
    },
    {
      id: 'dev-1',
      name: 'Mitsubishi Heavy 7 kW ilmalämpöpumppu jäähdytykseen',
      quantity: 1,
      purchasePrice: 1260,
      marginPercent: 120,
      sellPrice: 2772,
      rowKind: 'device',
    },
  ],
};

const disposalTotals = computeQuoteInternalTotals(disposalQuote, null);
assert.equal(disposalTotals.expensePurchaseNet, 200);
// 400 (työ sisäinen) + 150 + 100 + 50 (tarvikkeet) + 1260 (laite) + 200 (kulu)
assert.equal(disposalTotals.purchaseNet, 2160);
assert.notEqual(disposalTotals.purchaseNet, 1960);

const disposalLines = extractQuotePurchaseLines(disposalQuote);
assert.ok(
  disposalLines.some(
    (line) => line.label.includes('hävitys') && line.quote_purchase_net === 200,
  ),
  'expense purchase line should appear in extractQuotePurchaseLines',
);

console.log('test-quote-material-row-kind: ok');
