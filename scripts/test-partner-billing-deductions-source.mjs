import assert from 'node:assert/strict';
import {
  buildPartnerBillingDeductionsFromSource,
  collectPartnerBillingDeductions,
  mergePartnerBillingDeductions,
} from '../src/lib/partnerBillingDeductions.ts';

const viewerCompanyId = 'creator-co';
const warehouseCompanyId = 'lk-co';
const ownerCompanyId = 'ukh-co';

const reports = [
  {
    id: 'report-1',
    title: 'Sinikalliontie 3 – Kylmiöt lämpönee',
    owner_company_id: ownerCompanyId,
    created_by_company_id: viewerCompanyId,
    delegate_company_id: null,
    customers: { name: 'Asiakas Oy' },
    owner_company: { name: 'Uudenmaan Kylmähuolto Oy' },
    creator_company: { name: 'Lämpökatsastus Oy' },
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
                logDate: '2026-08-28',
                kind: 'refrigerant_purchase_deduction',
                description: 'Varastosta R-404A 2.000 kg · 80,00 €/kg = 160,00 € · ei vielä vähennetty',
                qty: 2,
                unitPrice: 80,
                total: 160,
                included: false,
                refrigerantLineId: 'ref-1',
                warehouseDeduction: 'pending',
              },
            ],
          },
        ],
        warehouseDeductionsPending: 160,
      },
    },
  },
];

const refrigerantLines = [
  {
    id: 'ref-1',
    work_report_id: 'report-1',
    source: 'partner_warehouse',
    warehouse_company_id: warehouseCompanyId,
    qty_kg: 2,
    unit_price: 80,
    customer_unit_price: 80,
    refrigerant_type: 'R-404A',
    warehouse_cost_deducted: false,
    warehouse_company: { name: 'Lämpökatsastus Oy' },
    daily_log: { log_date: '2026-08-28' },
  },
];

const sourceDeductions = buildPartnerBillingDeductionsFromSource(
  reports,
  refrigerantLines,
  [],
  viewerCompanyId,
);

assert.equal(sourceDeductions.length, 1);
assert.equal(sourceDeductions[0].deductionPartnerId, warehouseCompanyId);
assert.equal(sourceDeductions[0].deductionPartnerName, 'Lämpökatsastus Oy');
assert.equal(sourceDeductions[0].purchaseLabel, 'R-404A');
assert.equal(sourceDeductions[0].total, 160);
assert.equal(sourceDeductions[0].charged, false);

const calculationDeductions = collectPartnerBillingDeductions(reports, viewerCompanyId);
assert.equal(calculationDeductions.length, 1);
assert.equal(
  calculationDeductions[0].deductionPartnerName,
  'Uudenmaan Kylmähuolto Oy',
  'vanha laskelma ilman deductionPartnerName kaatuu raportin omistajaan',
);

const merged = mergePartnerBillingDeductions(sourceDeductions, calculationDeductions);
assert.equal(merged.length, 1);
assert.equal(merged[0].deductionPartnerName, 'Lämpökatsastus Oy');

const warehouseViewerDeductions = buildPartnerBillingDeductionsFromSource(
  reports,
  refrigerantLines,
  [],
  warehouseCompanyId,
);
assert.equal(warehouseViewerDeductions.length, 1);
assert.equal(warehouseViewerDeductions[0].deductionPartnerName, 'Lämpökatsastus Oy');

const ownerViewerDeductions = buildPartnerBillingDeductionsFromSource(
  reports,
  refrigerantLines,
  [],
  ownerCompanyId,
);
assert.equal(ownerViewerDeductions.length, 0);

console.log('test-partner-billing-deductions-source: ok');
