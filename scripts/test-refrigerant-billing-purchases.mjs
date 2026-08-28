import assert from 'node:assert/strict';
import {
  collectRefrigerantBillingPurchases,
  refrigerantBillingPurchaseTotals,
} from '../src/lib/refrigerantBillingPurchases.ts';

const viewerCompanyId = 'warehouse-co';

const rows = [
  {
    id: 'report-1',
    title: 'Huolto A',
    status: 'completed',
    owner_company_id: 'owner-co',
    created_by_company_id: 'creator-co',
    delegate_company_id: null,
    customer_id: 'cust-1',
    customers: { name: 'Asiakas Oy' },
    owner_company: { name: 'Omistaja Oy' },
    creator_company: { name: 'Tekijä Oy' },
    billable: {
      calculation: {
        version: 4,
        byUser: [
          {
            userId: 'u1',
            userName: 'Tekijä',
            subtotal: 0,
            excludedSubtotal: 24,
            lines: [
              {
                logId: 'log-1',
                logDate: '2026-08-20',
                kind: 'refrigerant_purchase_deduction',
                description: 'Varastosta R-404A 2.000 kg · 12,00 €/kg = 24,00 € · ei vielä vähennetty',
                qty: 2,
                unitPrice: 12,
                total: 24,
                included: false,
                refrigerantLineId: 'line-1',
                warehouseDeduction: 'pending',
              },
              {
                logId: 'log-2',
                logDate: '2026-08-18',
                kind: 'refrigerant_purchase_deduction',
                description: 'Varastosta R-32 1.000 kg · 10,00 €/kg = 10,00 € · vähennetty',
                qty: 1,
                unitPrice: 10,
                total: 10,
                included: false,
                refrigerantLineId: 'line-2',
                warehouseDeduction: 'deducted',
              },
            ],
          },
        ],
        warehouseDeductionsPending: 24,
        warehouseDeductionsDeducted: 10,
      },
    },
  },
];

const purchases = collectRefrigerantBillingPurchases(rows, viewerCompanyId);
assert.equal(purchases.length, 2);
assert.equal(purchases[0].lineId, 'line-1');
assert.equal(purchases[0].refrigerantType, 'R-404A');
assert.equal(purchases[0].charged, false);
assert.equal(purchases[1].charged, true);
assert.equal(purchases[0].customerName, 'Asiakas Oy');

const totals = refrigerantBillingPurchaseTotals(purchases);
assert.equal(totals.pending, 24);
assert.equal(totals.charged, 10);
assert.equal(totals.pendingCount, 1);
assert.equal(totals.chargedCount, 1);

console.log('test-refrigerant-billing-purchases: ok');
