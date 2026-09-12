import assert from 'node:assert/strict';
import { parseBillingQuoteSettings, normalizeBillingQuoteSettings } from '../src/lib/workReportBillingQuote.ts';
import { mergeActualPurchaseFromWorkReportLogs } from '../src/lib/quoteRequestActualPurchaseSync.ts';
import { extractQuotePurchaseLines } from '../src/lib/quotePurchaseLines.ts';
import { compareQuoteCategories } from '../src/lib/quoteCategoryComparison.ts';
import { calculateWorkReportBillable } from '../src/lib/workReportBilling.ts';

const quoteData = {
  type: 'huolto',
  workItems: [{ id: '1', description: 'Työ', hours: 58, pricePerHour: 65, materials: [] }],
  installationSupplies: [
    {
      id: 'dev-1',
      name: 'Laite',
      quantity: 1,
      purchasePrice: 15249,
      marginPercent: 20,
      sellPrice: 18000,
      rowKind: 'device',
    },
    {
      id: 'sup-1',
      name: 'Tarvikkeet',
      quantity: 1,
      purchasePrice: 4350,
      marginPercent: 80,
      sellPrice: 7830,
      rowKind: 'supply',
    },
  ],
  travelKmEnabled: false,
  installationLaborPurchaseRate: 50,
};

const logs = [
  {
    id: 'log-1',
    work_report_id: 'wr-1',
    log_date: '2024-09-08',
    entry_type: 'regular',
    hours_regular: 51,
    hours_overtime: 0,
    hours_on_call: 0,
    trip_legs: [{ distance_km: 846.1 }],
    expense_lines: [
      {
        id: 'exp-1',
        expense_type: 'material',
        description: 'Onninen',
        qty: 1,
        unit_price: 100,
        purchase_price: 85,
        bill_to_partner: false,
        bill_to_customer: true,
      },
    ],
    created_by: 'user-1',
    created_at: '2024-09-08T10:00:00Z',
  },
];

const partnerRates = { hourly_regular: 50, hourly_overtime: 75, hourly_on_call: 100 };
const partnerCalculation = calculateWorkReportBillable({
  logs,
  users: [{ id: 'user-1', display_name: 'Tekijä', bill_hours_enabled: true, bill_expenses_enabled: true }],
  rates: partnerRates,
  ratesSource: 'company_default',
  tripKmRate: 0.65,
});

const rawSettings = parseBillingQuoteSettings({
  quote_request_id: 'quote-1',
  quote_sale_net: 34590,
  quote_purchase_net: 45868,
  actual_purchase_net: 45868,
  purchase_lines: extractQuotePurchaseLines(quoteData),
});

const merged = normalizeBillingQuoteSettings(
  mergeActualPurchaseFromWorkReportLogs(rawSettings, logs, quoteData),
);

assert.notEqual(merged.actual_purchase_net, 45868, 'merged actual should differ from stale quote total');
assert.ok(merged.actual_purchase_net < 20000, 'merged actual should reflect diary supplies + device');

const comparison = compareQuoteCategories({
  quoteData,
  partnerCalculation,
  logs,
  partnerRates,
  tripKmRate: 0.65,
  billingSettings: merged,
});

assert.ok(comparison);
assert.equal(comparison.rows.find((row) => row.key === 'device')?.actualNet, 15249);
assert.ok((comparison.rows.find((row) => row.key === 'supplies')?.actualNet ?? 0) < 4350);

console.log('work-report-print-quote-merge: ok');
