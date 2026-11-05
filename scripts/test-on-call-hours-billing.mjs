import assert from 'node:assert/strict';
import { calculateWorkReportBillable } from '../src/lib/workReportBilling.ts';
import { calculateWorkReportCustomerBillable } from '../src/lib/workReportCustomerBilling.ts';
import { hoursExtraBillingLabel } from '../src/lib/dailyLogCustomerExtraBilling.ts';
import { emptyExpense, patchExpenseDraft } from '../src/lib/dailyLogExpenseDraft.ts';
import {
  computeCustomerPriceFromPartnerCost,
  inferPartnerExpenseMarginPercent,
} from '../src/lib/workReportExpenseBilling.ts';

const log = {
  id: 'log-oncall',
  work_report_id: 'wr',
  log_date: '2026-11-05',
  entry_type: 'on_call',
  hours_regular: 0,
  hours_overtime: 0,
  hours_on_call: 2.5,
  work_done: 'Pakastimen vian selvitys',
  created_by: 'user-1',
  hourly_rate_override: null,
  customer_hourly_rate_override: null,
  partner_billing: null,
  customer_extra_billing: {},
  expense_lines: [],
  refrigerant_lines: [],
  trip_legs: [],
  commission_amount: 0,
  fixed_price_amount: null,
};

const users = [{
  id: 'user-1',
  display_name: 'Enn Kotselainen',
  bill_hours_enabled: true,
  bill_expenses_enabled: true,
}];

const partner = calculateWorkReportBillable({
  logs: [log],
  users,
  rates: { hourly_regular: 50, hourly_overtime: 75, hourly_on_call: 100 },
  ratesSource: 'partnership',
  billToCompanyId: 'co',
  billToCompanyName: 'Lämpökatsastus Oy',
});

const workLines = partner.byUser[0].lines.filter((l) => l.kind === 'hours_on_call');
assert.equal(workLines.length, 1);
assert.equal(workLines[0].qty, 2.5);
assert.equal(workLines[0].unitPrice, 100);
assert.equal(workLines[0].total, 250);
assert.equal(partner.byUser[0].hoursTotal, 250);

const customer = calculateWorkReportCustomerBillable({
  logs: [log],
  users,
  rates: { hourly_regular: 65, hourly_overtime: 97.5, hourly_on_call: 130 },
  ratesSource: 'company',
});
const custLines = customer.byUser[0].lines.filter((l) => l.kind === 'hours_on_call');
assert.equal(custLines.length, 1);
assert.equal(custLines[0].unitPrice, 130);
assert.equal(custLines[0].total, 325);

assert.equal(hoursExtraBillingLabel({}), null);
assert.equal(hoursExtraBillingLabel({}, { linkedQuoteRequest: false }), null);
assert.equal(hoursExtraBillingLabel({}, { linkedQuoteRequest: true }), 'kuuluu tarjoukseen');

const margin = inferPartnerExpenseMarginPercent(100, 130);
assert.equal(computeCustomerPriceFromPartnerCost(100, margin), 130);

let draft = emptyExpense();
draft = patchExpenseDraft(draft, {
  expense_type: 'other',
  description: 'Päivystys lähtökorvaus',
  unit_price: '100',
  bill_to_partner: true,
  bill_to_customer: true,
});
draft = patchExpenseDraft(draft, { customer_unit_price: '130' });
assert.equal(draft.customer_unit_price, '130');
assert.ok(Number(draft.partner_expense_margin_percent) > 23);

console.log('test-on-call-hours-billing: ok');
