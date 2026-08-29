import assert from 'node:assert/strict';
import {
  collectPartnerBillingDeductions,
  partnerBillingDeductionTotals,
} from '../src/lib/partnerBillingDeductions.ts';

const viewerCompanyId = 'creator-co';

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
                deductionPartnerCompanyId: 'warehouse-co',
                deductionPartnerName: 'Lämpökatsastus Oy',
                warehouseDeduction: 'pending',
              },
              {
                logId: 'log-2',
                logDate: '2026-08-18',
                kind: 'partner_purchase_deduction',
                description: 'Kumppanin piikki · Mittarisarja · 1 kpl × 100,00 € + 10 % = 111,11 € · ei vielä vähennetty',
                qty: 1,
                unitPrice: 111.11,
                total: 111.11,
                included: false,
                partnerPurchaseLineId: 'pp-1',
                deductionPartnerCompanyId: 'warehouse-co',
                deductionPartnerName: 'Lämpökatsastus Oy',
                warehouseDeduction: 'pending',
              },
              {
                logId: 'log-3',
                logDate: '2026-08-17',
                kind: 'refrigerant_purchase_deduction',
                description: 'Varastosta R-32 1.000 kg · 10,00 €/kg = 10,00 € · vähennetty',
                qty: 1,
                unitPrice: 10,
                total: 10,
                included: false,
                refrigerantLineId: 'line-2',
                deductionPartnerCompanyId: 'warehouse-co',
                deductionPartnerName: 'Lämpökatsastus Oy',
                warehouseDeduction: 'deducted',
              },
            ],
          },
        ],
        warehouseDeductionsPending: 135.11,
        warehouseDeductionsDeducted: 10,
      },
    },
  },
];

const deductions = collectPartnerBillingDeductions(rows, viewerCompanyId);
assert.equal(deductions.length, 3);
assert.equal(deductions[0].lineKind, 'refrigerant');
assert.equal(deductions[0].deductionPartnerName, 'Lämpökatsastus Oy');
assert.equal(deductions[1].lineKind, 'partner_purchase');
assert.equal(deductions[1].purchaseLabel, 'Mittarisarja');
assert.equal(deductions[1].charged, false);

const filtered = collectPartnerBillingDeductions(rows, viewerCompanyId, 'warehouse-co');
assert.equal(filtered.length, 3);

const otherPartner = collectPartnerBillingDeductions(rows, viewerCompanyId, 'owner-co');
assert.equal(otherPartner.length, 0);

const totals = partnerBillingDeductionTotals(deductions);
assert.equal(totals.pending, 135.11);
assert.equal(totals.charged, 10);
assert.equal(totals.pendingCount, 2);
assert.equal(totals.chargedCount, 1);

console.log('test-refrigerant-billing-purchases: ok');
