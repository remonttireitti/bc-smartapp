import assert from 'node:assert/strict';
import { analyzeWorkReportPurchaseCosts } from '../src/lib/workReportActualPurchase.ts';
import { computePartnerNetMargin } from '../src/lib/workReportBillingQuote.ts';
import { analyzeMarginEatingExpenses } from '../src/lib/workReportQuoteMargin.ts';
import {
  mergeActualPurchaseFromWorkReportLogs,
  patchQuoteRequestDataFromWorkReportActuals,
} from '../src/lib/quoteRequestActualPurchaseSync.ts';

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
      {
        id: 'e2',
        description: 'Ajomatkat (auto)',
        qty: 120,
        unit_price: 0.65,
        expense_type: 'km',
        bill_to_partner: true,
        bill_to_customer: true,
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
assert.equal(analysis.lines.length, 2);

const settings = {
  quote_sale_net: 34590,
  quote_purchase_net: 22950,
  actual_purchase_net: 22950,
  purchase_lines: [
    {
      id: 'group:supplies',
      label: 'Tarvikkeet',
      source: 'group',
      quote_purchase_net: 22950,
      actual_purchase_net: 1412.36,
    },
  ],
};

const merged = mergeActualPurchaseFromWorkReportLogs(settings, logs);
assert.equal(merged.purchase_lines.length, 2);
assert.equal(merged.purchase_lines[0].source, 'device');
assert.equal(merged.purchase_lines[0].label, 'Tarjotut laitteet');
assert.equal(merged.purchase_lines[0].actual_purchase_net, 22950);
assert.equal(merged.purchase_lines[1].id, 'group:diary-supplies');
assert.equal(merged.purchase_lines[1].actual_purchase_net, 190);
assert.equal(merged.actual_purchase_net, 23140);

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
);
assert.equal(deviceAdjusted.purchase_lines[0].actual_purchase_net, 22000);
assert.equal(deviceAdjusted.purchase_lines[1].actual_purchase_net, 364.99);
assert.equal(deviceAdjusted.actual_purchase_net, 22364.99);

const wartilaMerged = mergeActualPurchaseFromWorkReportLogs(settings, wartilaLogs);
assert.equal(wartilaMerged.actual_purchase_net, 23314.99);
assert.equal(analyzeMarginEatingExpenses(wartilaLogs).total, 0);

const wartilaMargin = computePartnerNetMargin(wartilaMerged, 3131.5, {
  logs: wartilaLogs,
  partnerRates: { hourly_regular: 50 },
});
assert.equal(wartilaMargin.netMarginNet, 8143.51);
assert.equal(wartilaMargin.marginEatingExpenseNet, 0);

const withDevice = {
  ...settings,
  purchase_lines: [
    {
      id: 'device:main',
      label: 'Laite',
      source: 'device',
      quote_purchase_net: 20000,
      actual_purchase_net: 21500,
    },
    {
      id: 'group:diary-supplies',
      label: 'Tarvikkeet (päiväkirja)',
      source: 'group',
      quote_purchase_net: 0,
      actual_purchase_net: 190,
    },
  ],
  actual_purchase_net: 21690,
};

const quoteData = patchQuoteRequestDataFromWorkReportActuals(
  {
    installationSupplies: [
      {
        id: 'mat-1',
        name: 'Kierreletku',
        quantity: 1,
        purchasePrice: 40,
        sellPrice: 72,
        marginPercent: 80,
      },
    ],
  },
  withDevice,
  logs,
);
assert.equal(quoteData.installationSupplies[0].purchasePrice, 45);
assert.equal(quoteData.devicePurchaseOverrideNet, 21500);

console.log('test-work-report-actual-purchase: ok');
