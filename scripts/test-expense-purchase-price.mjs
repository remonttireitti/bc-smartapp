import assert from 'node:assert/strict';
import {
  expensePurchaseLineTotal,
  expensePurchasePriceMissing,
  sumDailyLogExpensePurchaseNet,
} from '../src/lib/workReportExpenseBilling.ts';

assert.equal(
  expensePurchaseLineTotal({ qty: 2, unit_price: 15.5 }),
  31,
);

assert.equal(
  expensePurchasePriceMissing({
    bill_to_partner: false,
    bill_to_customer: true,
    unit_price: 0,
  }),
  true,
);

assert.equal(
  sumDailyLogExpensePurchaseNet([
    {
      expense_lines: [
        { qty: 1, unit_price: 100 },
        { qty: 2, unit_price: 12.5 },
      ],
    },
  ]),
  125,
);

console.log('test-expense-purchase-price: ok');
