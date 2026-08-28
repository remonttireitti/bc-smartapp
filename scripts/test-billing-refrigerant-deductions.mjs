import assert from 'node:assert/strict';
import {
  calculateWorkReportBillable,
  billingPartnerNetTotal,
  warehouseDeductionTotalsFromCalculation,
} from '../src/lib/workReportBilling.ts';

const report = {
  owner_company_id: 'owner',
  created_by_company_id: 'creator',
};

const calc = calculateWorkReportBillable({
  logs: [
    {
      id: 'log-1',
      log_date: '2026-08-28',
      entry_type: 'regular',
      hours_regular: 2,
      hours_overtime: 0,
      hours_on_call: 0,
      fixed_price_amount: 0,
      customer_fixed_price_amount: 0,
      partner_urakka_margin_percent: null,
      hourly_rate_override: null,
      customer_hourly_rate_override: null,
      commission_amount: 0,
      commission_note: null,
      work_done: 'Test',
      created_by: 'user-1',
      created_at: '2026-08-28T08:00:00Z',
      author_name_snapshot: 'Enn',
      author_deleted: false,
      refrigerant_lines: [
        {
          id: 'ref-1',
          daily_log_id: 'log-1',
          work_report_id: 'wr-1',
          source: 'partner_warehouse',
          cylinder_id: 'cyl-1',
          warehouse_company_id: 'lk',
          owner_user_id: null,
          supplier_name: null,
          supplier_paid_by: null,
          unit_price: 12,
          customer_unit_price: 28,
          bill_to_customer: false,
          warehouse_cost_deducted: false,
          refrigerant_type: 'R-404A',
          qty_kg: 2,
          notes: null,
          cylinder_disposition: 'partial_in_stock',
          created_by: 'user-1',
          created_at: '2026-08-28T08:00:00Z',
          cylinder: { serial_number: 'V055171', bottle_size: 'medium', notes: null },
        },
      ],
    },
  ],
  users: [
    {
      id: 'user-1',
      display_name: 'Enn',
      bill_hours_enabled: true,
      bill_expenses_enabled: true,
    },
  ],
  rates: { hourly_regular: 50, hourly_overtime: 0, hourly_on_call: 0 },
  ratesSource: 'company_default',
  billToCompanyId: 'owner',
  billToCompanyName: 'UKH',
  report,
  viewerCompanyId: 'creator',
});

assert.equal(calc.version, 4);
assert.equal(calc.grandTotal, 156);
assert.equal(calc.warehouseDeductionsPending, 24);

const deductions = warehouseDeductionTotalsFromCalculation(calc);
assert.equal(deductions.pending, 24);
assert.equal(deductions.lines.length, 1);
assert.equal(deductions.lines[0].warehouseDeduction, 'pending');

assert.equal(billingPartnerNetTotal(calc.grandTotal, calc), 132);

console.log('test-billing-refrigerant-deductions: ok');
