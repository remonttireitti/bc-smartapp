import assert from 'node:assert/strict';
import { analyzeWorkReportPurchaseCosts } from '../src/lib/workReportActualPurchase.ts';
import { computePartnerNetMargin } from '../src/lib/workReportBillingQuote.ts';
import { analyzeMarginEatingExpenses } from '../src/lib/workReportQuoteMargin.ts';
import { createEmptyQuoteRequestData } from '../src/lib/quoteRequest/defaults.ts';
import { mergeActualPurchaseFromWorkReportLogs } from '../src/lib/quoteRequestActualPurchaseSync.ts';

const logs = [
  {
    id: 'log-1',
    log_date: '2026-09-10',
    expense_lines: [
      {
        id: 'e1',
        description: 'Kierreletku',
        qty: 2,
        unit_price: 45,
        bill_to_partner: false,
        bill_to_customer: true,
        customer_unit_price: 81,
      },
    ],
    partner_purchase_lines: [
      {
        id: 'p1',
        description: 'Piikkiosto',
        qty: 1,
        unit_price: 100,
      },
    ],
  },
];

const analysis = analyzeWorkReportPurchaseCosts(logs);
assert.equal(analysis.suppliesNet, 190);

const quoteData = {
  ...createEmptyQuoteRequestData('huolto'),
  installationSupplies: [
    {
      id: 'dev-1',
      name: '3 kpl jäähdytyskone',
      quantity: 1,
      purchasePrice: 22896,
      marginPercent: 25,
      sellPrice: 28620,
      rowKind: 'device',
    },
    {
      id: 'sup-1',
      name: 'LVI-tarvikkeet',
      quantity: 1,
      purchasePrice: 753,
      marginPercent: 20,
      sellPrice: 941.25,
      rowKind: 'supply',
    },
  ],
};

const settings = {
  quote_sale_net: 34590,
  quote_purchase_net: 23649,
  purchase_lines: [
    {
      id: 'group:diary-supplies',
      label: 'Tarvikkeet (päiväkirja)',
      source: 'group',
      quote_purchase_net: 24309.36,
      actual_purchase_net: 1413.36,
    },
  ],
};

const merged = mergeActualPurchaseFromWorkReportLogs(settings, logs, quoteData);
assert.equal(merged.purchase_lines.length, 2);
assert.equal(merged.purchase_lines[0].source, 'device');
assert.equal(merged.purchase_lines[0].quote_purchase_net, 22896);
assert.equal(merged.purchase_lines[0].actual_purchase_net, 22896);
assert.equal(merged.purchase_lines[1].label, 'Tarvikkeet');
assert.equal(merged.purchase_lines[1].quote_purchase_net, 753);
assert.equal(merged.purchase_lines[1].actual_purchase_net, 190);
assert.equal(merged.quote_purchase_net, 23649);
assert.equal(merged.actual_purchase_net, 23086);

const wartilaLogs = [
  {
    id: 'log-w',
    log_date: '2026-09-12',
    expense_lines: [
      {
        description: 'Onninen kuparit',
        qty: 1,
        unit_price: 342.62,
        bill_to_partner: false,
        bill_to_customer: true,
      },
      {
        description: 'Dahl nielusaha',
        qty: 1,
        unit_price: 22.37,
        bill_to_partner: false,
        bill_to_customer: true,
      },
    ],
  },
];

const deviceAdjusted = mergeActualPurchaseFromWorkReportLogs(
  {
    quote_sale_net: 34590,
    purchase_lines: [
      {
        id: 'device:dev-1',
        label: '3 kpl jäähdytyskone',
        source: 'device',
        quote_purchase_net: 22896,
        actual_purchase_net: 22000,
      },
    ],
  },
  wartilaLogs,
  quoteData,
);
assert.equal(deviceAdjusted.purchase_lines[0].actual_purchase_net, 22000);
assert.equal(deviceAdjusted.purchase_lines[1].actual_purchase_net, 364.99);
assert.equal(deviceAdjusted.actual_purchase_net, 22364.99);

const wartilaMerged = mergeActualPurchaseFromWorkReportLogs(settings, wartilaLogs, quoteData);
assert.equal(wartilaMerged.purchase_lines[0].quote_purchase_net, 22896);
assert.equal(wartilaMerged.purchase_lines[1].quote_purchase_net, 753);
assert.equal(wartilaMerged.actual_purchase_net, 23260.99);
assert.equal(analyzeMarginEatingExpenses(wartilaLogs).total, 0);

const wartilaMargin = computePartnerNetMargin(wartilaMerged, 3131.5, {
  logs: wartilaLogs,
  partnerRates: { hourly_regular: 50 },
});
assert.ok(wartilaMargin.netMarginNet < 10000);
assert.ok(wartilaMargin.netMarginNet > 6000);
assert.equal(wartilaMargin.marginEatingExpenseNet, 0);

const approvedExtraLogs = [
  {
    id: 'log-approved',
    log_date: '2026-09-12',
    expense_lines: [
      {
        id: 'exp-approved',
        description: 'Onninen kuparit',
        qty: 1,
        unit_price: 342.62,
        bill_to_partner: false,
        bill_to_customer: true,
        customer_unit_price: 616.72,
        extra_billable: true,
        extra_billing_allowed: true,
      },
      {
        id: 'exp-pending',
        description: 'Odottaa lupaa',
        qty: 1,
        unit_price: 50,
        bill_to_partner: false,
        bill_to_customer: true,
        extra_billable: true,
        extra_billing_allowed: false,
      },
    ],
  },
];

const approvedExtraAnalysis = analyzeWorkReportPurchaseCosts(approvedExtraLogs);
assert.equal(approvedExtraAnalysis.suppliesNet, 50);
assert.equal(approvedExtraAnalysis.lines.length, 1);
assert.equal(approvedExtraAnalysis.lines[0].description, 'Odottaa lupaa');

console.log('test-work-report-actual-purchase: ok');
