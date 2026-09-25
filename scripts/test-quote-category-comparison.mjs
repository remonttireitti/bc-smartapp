import assert from 'node:assert/strict';
import { compareQuoteCategories } from '../src/lib/quoteCategoryComparison.ts';
import { calculateWorkReportBillable } from '../src/lib/workReportBilling.ts';
import { mergeActualPurchaseFromWorkReportLogs } from '../src/lib/quoteRequestActualPurchaseSync.ts';
import { extractQuotePurchaseLines } from '../src/lib/quotePurchaseLines.ts';

const partnerRates = {
  hourly_regular: 50,
  hourly_overtime: 75,
  hourly_on_call: 100,
};

const quoteData = {
  type: 'huolto',
  workItems: [
    { id: '1', description: 'Asennus', hours: 48, pricePerHour: 65, materials: [] },
    {
      id: '2',
      description: 'Matkat',
      hours: 0,
      pricePerHour: 0,
      materials: [
        {
          id: 'km-1',
          name: 'Km-korvaus',
          quantity: 750,
          purchasePrice: 1,
          marginPercent: 25,
          sellPrice: 1.25,
        },
      ],
    },
  ],
  laborHours: 0,
  installationLaborPurchaseRate: 50,
  installationSupplies: [
    {
      id: 'sup-1',
      name: 'Putki',
      quantity: 2,
      purchasePrice: 50,
      marginPercent: 80,
      sellPrice: 90,
      rowKind: 'supply',
    },
    {
      id: 'dev-1',
      name: 'Ilmalämpöpumppu',
      quantity: 1,
      purchasePrice: 5000,
      marginPercent: 20,
      sellPrice: 6000,
      rowKind: 'device',
    },
  ],
  travelKmEnabled: false,
  travelKmDistance: 0,
  travelKmRate: 0.65,
};

const logs = [
  {
    id: 'log-1',
    work_report_id: 'wr-1',
    log_date: '2024-09-08',
    entry_type: 'regular',
    hours_regular: 40,
    hours_overtime: 0,
    hours_on_call: 0,
    trip_legs: [{ distance_km: 400 }],
    expense_lines: [
      {
        id: 'exp-1',
        expense_type: 'material',
        description: 'Liitin',
        qty: 3,
        unit_price: 20,
        purchase_price: 15,
      },
      {
        id: 'exp-2',
        expense_type: 'other',
        description: 'Pysäköinti',
        qty: 1,
        unit_price: 25,
        purchase_price: 25,
      },
    ],
    created_by: 'user-1',
    created_at: '2024-09-08T10:00:00Z',
  },
];

const users = [
  {
    id: 'user-1',
    display_name: 'Tekijä',
    bill_hours_enabled: true,
    bill_expenses_enabled: true,
  },
];

const partnerCalculation = calculateWorkReportBillable({
  logs,
  users,
  rates: partnerRates,
  ratesSource: 'company_default',
  tripKmRate: 0.65,
});

const purchaseLines = extractQuotePurchaseLines(quoteData);
const settings = mergeActualPurchaseFromWorkReportLogs(
  { purchase_lines: purchaseLines },
  logs,
  quoteData,
);

const comparison = compareQuoteCategories({
  quoteData,
  partnerCalculation,
  logs,
  partnerRates,
  tripKmRate: 0.65,
  billingSettings: settings,
});

assert.ok(comparison, 'comparison should exist');

const labor = comparison.rows.find((row) => row.key === 'labor');
assert.ok(labor);
assert.equal(labor.quoteQty, 48);
assert.equal(labor.quoteNet, 2400);
assert.equal(labor.actualQty, 40);
assert.equal(labor.actualNet, 2000);

const expenses = comparison.rows.find((row) => row.key === 'expenses');
assert.ok(expenses);
assert.equal(expenses.quoteQty, 750);
// 750 km × 0,65 = 487,50 + huoltoautokorvaus (48 h → 6 jaksoa × 50 €) = 300 → 787,50
// (sama sisäinen kulu kuin tarjouksen "Hankinta"-summassa).
assert.equal(expenses.quoteNet, 787.5);
assert.match(expenses.quoteNote ?? '', /huoltoautokorvaus 300,00/);
assert.equal(expenses.actualNet, 345);

const supplies = comparison.rows.find((row) => row.key === 'supplies');
assert.ok(supplies);
assert.equal(supplies.quoteNet, 100);
assert.equal(
  supplies.actualNet,
  0,
  'partner_and_customer -kulurivit eivät kuulu tarvikkeisiin',
);

const device = comparison.rows.find((row) => row.key === 'device');
assert.ok(device);
assert.equal(device.quoteNet, 5000);
assert.equal(device.actualNet, 5000);

assert.equal(comparison.rows.length, 4);

console.log('quote-category-comparison: ok');
