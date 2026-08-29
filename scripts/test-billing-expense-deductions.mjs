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
      expense_lines: [
        {
          id: 'exp-1',
          daily_log_id: 'log-1',
          expense_type: 'warehouse_purchase',
          description: 'Pihdit',
          qty: 2,
          unit_price: 15,
          bill_to_partner: true,
          bill_to_customer: true,
          warehouse_company_id: 'lk',
          warehouse_cost_deducted: false,
          sort_order: 0,
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
assert.equal(calc.grandTotal, 130);
assert.equal(calc.warehouseDeductionsPending, 30);

const deductions = warehouseDeductionTotalsFromCalculation(calc);
assert.equal(deductions.pending, 30);
assert.equal(deductions.lines.length, 1);
assert.equal(deductions.lines[0].kind, 'expense_purchase_deduction');
assert.equal(deductions.lines[0].warehouseDeduction, 'pending');
assert.equal(deductions.lines[0].expenseLineId, 'exp-1');

assert.equal(billingPartnerNetTotal(calc.grandTotal, calc), 100);

const warehouseCalc = calculateWorkReportBillable({
  logs: [
    {
      id: 'log-1',
      log_date: '2026-08-28',
      entry_type: 'regular',
      hours_regular: 0,
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
      expense_lines: [
        {
          id: 'exp-2',
          daily_log_id: 'log-1',
          expense_type: 'warehouse_purchase',
          description: 'Letku',
          qty: 1,
          unit_price: 42.5,
          bill_to_partner: true,
          bill_to_customer: false,
          warehouse_company_id: 'lk',
          warehouse_cost_deducted: true,
          sort_order: 0,
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
  viewerCompanyId: 'lk',
});

assert.equal(warehouseCalc.warehouseDeductionsDeducted, 42.5);
assert.equal(warehouseCalc.warehouseDeductionsPending, 0);

console.log('test-billing-expense-deductions: ok');
