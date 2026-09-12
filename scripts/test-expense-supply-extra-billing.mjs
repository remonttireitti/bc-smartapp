import assert from 'node:assert/strict';
import {
  computeSupplyCustomerUnitPrice,
  DEFAULT_SUPPLY_MARGIN_PERCENT,
  expenseExtraBillingAllowed,
  expenseSupplyExtraBillingLabel,
} from '../src/lib/workReportExpenseBilling.ts';
import {
  extraCustomerWorkFromDailyLogs,
  computeQuoteExtrasMarginFromLogs,
} from '../src/lib/dailyLogCustomerExtraBilling.ts';
import { analyzeMarginEatingExpenses } from '../src/lib/workReportQuoteMargin.ts';

assert.equal(DEFAULT_SUPPLY_MARGIN_PERCENT, 80);
assert.equal(computeSupplyCustomerUnitPrice(100, 80), 500);
assert.equal(
  expenseSupplyExtraBillingLabel({ bill_to_partner: false, bill_to_customer: true, extra_billing_allowed: false }),
  'ei lisälaskutusta · syö katetta',
);
assert.equal(
  expenseSupplyExtraBillingLabel({ bill_to_partner: false, bill_to_customer: true, extra_billing_allowed: true }),
  'lisälaskutus mahdollinen',
);

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
        customer_unit_price: 1713.1,
        extra_billing_allowed: true,
        customer_margin_percent: 80,
      },
      {
        id: 'exp-2',
        description: 'Piilotettu tarvike',
        qty: 1,
        unit_price: 50,
        bill_to_partner: false,
        bill_to_customer: false,
        extra_billing_allowed: false,
      },
    ],
  },
];

const works = extraCustomerWorkFromDailyLogs(logs);
assert.equal(works.length, 1);
assert.equal(works[0].expense_lines?.length, 1);
assert.equal(works[0].expense_lines?.[0].customer_unit_price, 1713.1);

const margin = computeQuoteExtrasMarginFromLogs(logs, { hourly_regular: 50 });
assert.equal(margin.customerExtrasNet, 1713.1);
assert.equal(margin.piikkiMaterialCostNet, 342.62);

const eating = analyzeMarginEatingExpenses(logs);
assert.equal(eating.total, 50);
assert.equal(expenseExtraBillingAllowed(logs[0].expense_lines[0]), true);

console.log('test-expense-supply-extra-billing: ok');
