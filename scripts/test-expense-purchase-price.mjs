import assert from 'node:assert/strict';
import {
  expensePurchaseLineTotal,
  expensePurchasePriceMissing,
  sumDailyLogExpensePurchaseNet,
} from '../src/lib/workReportExpenseBilling.ts';
import { mergeDailyLogExpensePurchaseIntoQuoteSettings } from '../src/lib/workReportBillingQuote.ts';

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

const merged = mergeDailyLogExpensePurchaseIntoQuoteSettings(
  { customer_mode: 'quote_fixed', quote_sale_net: 1000 },
  250,
);
assert.equal(merged.purchase_lines?.length, 1);
assert.equal(merged.purchase_lines?.[0]?.actual_purchase_net, 250);
assert.equal(merged.actual_purchase_net, 250);

console.log('test-expense-purchase-price: ok');
