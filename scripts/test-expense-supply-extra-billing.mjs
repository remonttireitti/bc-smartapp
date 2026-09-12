import assert from 'node:assert/strict';
import {
  buildSupplyLineFlagsFromExpenseDrafts,
  computeSupplyCustomerUnitPrice,
  DEFAULT_SUPPLY_MARGIN_PERCENT,
  expenseExtraBillable,
  expenseExtraBillingAllowed,
  expenseSupplyExtraBillingLabel,
  resolveExpenseBillingMode,
  resolveExpenseExtraBillableFromSources,
  resolveExpenseExtraBillingAllowedFromSources,
  syncSupplyExpenseCustomerPrice,
} from '../src/lib/workReportExpenseBilling.ts';
import {
  buildCustomerExtraBillingFromLogForm,
  parseDailyLogCustomerExtraBilling,
  serializeDailyLogCustomerExtraBilling,
} from '../src/lib/dailyLogCustomerExtraBilling.ts';
import {
  extraCustomerWorkFromDailyLogs,
  computeQuoteExtrasMarginFromLogs,
} from '../src/lib/dailyLogCustomerExtraBilling.ts';
import { analyzeMarginEatingExpenses } from '../src/lib/workReportQuoteMargin.ts';

assert.equal(DEFAULT_SUPPLY_MARGIN_PERCENT, 80);
assert.equal(computeSupplyCustomerUnitPrice(100, 80), 180);
assert.equal(computeSupplyCustomerUnitPrice(342.62, 80), 616.72);
assert.equal(
  expenseSupplyExtraBillingLabel({
    bill_to_partner: false,
    bill_to_customer: true,
    extra_billable: false,
    extra_billing_allowed: false,
  }),
  'kuuluu tarjoukseen · syö katetta',
);
assert.equal(
  expenseSupplyExtraBillingLabel({
    bill_to_partner: false,
    bill_to_customer: true,
    extra_billable: true,
    extra_billing_allowed: false,
  }),
  'lisälaskutettavissa · ei lupaa',
);
assert.equal(
  expenseSupplyExtraBillingLabel({
    bill_to_partner: false,
    bill_to_customer: true,
    extra_billable: true,
    extra_billing_allowed: true,
  }),
  'lisälaskutus luvalla',
);
assert.equal(expenseExtraBillable({ extra_billable: true, extra_billing_allowed: false }), true);
assert.equal(expenseExtraBillingAllowed({ extra_billable: true, extra_billing_allowed: false }), false);
assert.equal(expenseExtraBillingAllowed({ extra_billable: true, extra_billing_allowed: true }), true);

const pendingPiikki = syncSupplyExpenseCustomerPrice({
  bill_to_partner: false,
  bill_to_customer: true,
  unit_price: '50',
  customer_unit_price: '90',
  extra_billable: true,
  extra_billing_allowed: false,
  customer_margin_percent: '80',
});
assert.equal(resolveExpenseBillingMode(pendingPiikki), 'customer_only');
assert.equal(pendingPiikki.bill_to_customer, true);
assert.equal(pendingPiikki.customer_unit_price, '');

const logs = [
  {
    id: 'log-1',
    log_date: '2026-09-12',
    expense_lines: [
      {
        id: 'exp-1',
        description: 'Onninen tarvikkeet',
        qty: 1,
        unit_price: 342.62,
        bill_to_partner: false,
        bill_to_customer: true,
        customer_unit_price: 616.72,
        extra_billable: true,
        extra_billing_allowed: true,
        customer_margin_percent: 80,
      },
      {
        id: 'exp-2',
        description: 'Odottaa lupaa',
        qty: 1,
        unit_price: 50,
        bill_to_partner: false,
        bill_to_customer: false,
        extra_billable: true,
        extra_billing_allowed: false,
      },
      {
        id: 'exp-3',
        description: 'Piilotettu tarvike',
        qty: 1,
        unit_price: 25,
        bill_to_partner: false,
        bill_to_customer: false,
        extra_billable: false,
        extra_billing_allowed: false,
      },
    ],
  },
];

const works = extraCustomerWorkFromDailyLogs(logs);
assert.equal(works.length, 1);
assert.equal(works[0].expense_lines?.length, 1);
assert.equal(works[0].expense_lines?.[0].customer_unit_price, 616.72);

const margin = computeQuoteExtrasMarginFromLogs(logs, { hourly_regular: 50 });
assert.equal(margin.customerExtrasNet, 616.72);
assert.equal(margin.piikkiMaterialCostNet, 342.62);

const eating = analyzeMarginEatingExpenses(logs);
assert.equal(eating.total, 75);
assert.equal(expenseExtraBillingAllowed(logs[0].expense_lines[0]), true);
assert.equal(expenseExtraBillingAllowed(logs[0].expense_lines[1]), false);

assert.equal(
  resolveExpenseExtraBillableFromSources(
    { extra_billable: undefined, extra_billing_allowed: false },
    { extra_billable: true, extra_billing_allowed: false },
  ),
  true,
);
assert.equal(
  resolveExpenseExtraBillableFromSources(
    { extra_billable: false, extra_billing_allowed: false, customer_unit_price: 180 },
    null,
  ),
  false,
);
assert.equal(
  resolveExpenseExtraBillingAllowedFromSources(
    { extra_billing_allowed: undefined },
    { extra_billable: true, extra_billing_allowed: true },
  ),
  true,
);

const expenseDrafts = [
  {
    expense_type: 'supply',
    description: 'Onninen',
    qty: '1',
    unit_price: '50',
    bill_to_partner: false,
    bill_to_customer: true,
    extra_billable: true,
    extra_billing_allowed: false,
    customer_margin_percent: '80',
  },
];
const flags = buildSupplyLineFlagsFromExpenseDrafts(expenseDrafts);
assert.equal(flags.length, 1);
assert.equal(flags[0].extra_billable, true);

const serialized = serializeDailyLogCustomerExtraBilling(
  buildCustomerExtraBillingFromLogForm(
    {
      hours_extra_billable: false,
      hours_extra_billing_allowed: false,
      hours_extra_hours: '',
      extra_expense_description: '',
      extra_expense_qty: '1',
      extra_expense_customer_price: '',
      extra_expense_purchase_price: '',
      extra_expense_partner_billing: 'charge',
      entry_type: 'regular',
      hours_regular: '8',
      hours_overtime: '',
      hours_on_call: '',
      work_done: 'Työ',
      customer_hourly_rate_override: '',
    },
    expenseDrafts,
  ),
);
const parsed = parseDailyLogCustomerExtraBilling(serialized);
assert.equal(parsed.supply_line_flags?.[0]?.extra_billable, true);
assert.equal(parsed.supply_line_flags?.[0]?.extra_billing_allowed, false);

console.log('test-expense-supply-extra-billing: ok');
