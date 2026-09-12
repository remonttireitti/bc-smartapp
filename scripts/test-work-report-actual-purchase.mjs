import assert from 'node:assert/strict';
import { analyzeWorkReportPurchaseCosts } from '../src/lib/workReportActualPurchase.ts';
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
assert.equal(analysis.lines[0].description, 'Kierreletku');
assert.equal(analysis.lines[0].total, 90);
assert.equal(analysis.lines[1].source, 'partner_purchase');

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
      actual_purchase_net: 22950,
    },
  ],
};

const merged = mergeActualPurchaseFromWorkReportLogs(settings, logs);
assert.equal(merged.actual_purchase_net, 190);
assert.equal(merged.purchase_lines[0].actual_purchase_net, 190);

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
      ...settings.purchase_lines[0],
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
