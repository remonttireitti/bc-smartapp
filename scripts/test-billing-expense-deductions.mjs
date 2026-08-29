import assert from 'node:assert/strict';
import { partnerPurchaseLineTotal } from '../src/lib/partnerPurchaseDeduction.ts';
import {
  calculateWorkReportBillable,
  billingPartnerNetTotal,
  warehouseDeductionTotalsFromCalculation,
} from '../src/lib/workReportBilling.ts';

const report = {
  owner_company_id: 'owner',
  created_by_company_id: 'creator',
};

assert.equal(
  partnerPurchaseLineTotal({ qty: 1, unit_price: 100, partner_margin_percent: 10 }),
  111.11,
);

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
      partner_purchase_lines: [
        {
          id: 'pp-1',
          daily_log_id: 'log-1',
          work_report_id: 'wr-1',
          partner_company_id: 'owner',
          supplier_name: 'Tukkuri Oy',
          description: 'Mittarisarja',
          qty: 1,
          unit_price: 100,
          partner_margin_percent: 10,
          cost_deducted: false,
          sort_order: 0,
          partner_company: { name: 'UKH' },
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

assert.equal(calc.version, 5);
assert.equal(calc.grandTotal, 100);
assert.equal(calc.warehouseDeductionsPending, 0);

const deductions = warehouseDeductionTotalsFromCalculation(calc);
assert.equal(deductions.pending, 0);
assert.equal(deductions.lines.length, 0);

assert.equal(billingPartnerNetTotal(calc.grandTotal, calc), 100);

const ownerCalc = calculateWorkReportBillable({
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
      partner_purchase_lines: [
        {
          id: 'pp-2',
          daily_log_id: 'log-1',
          work_report_id: 'wr-1',
          partner_company_id: 'owner',
          supplier_name: null,
          description: 'Letku',
          qty: 1,
          unit_price: 50,
          partner_margin_percent: 10,
          cost_deducted: true,
          sort_order: 0,
          partner_company: { name: 'UKH' },
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
  viewerCompanyId: 'owner',
});

assert.equal(ownerCalc.warehouseDeductionsDeducted, 0);
assert.equal(ownerCalc.warehouseDeductionsPending, 0);

console.log('test-billing-expense-deductions: ok');
