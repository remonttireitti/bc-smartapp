import assert from 'node:assert/strict';
import {
  expensePurchaseLineTotal,
  expensePurchasePriceMissing,
  sumDailyLogExpensePurchaseNet,
} from '../src/lib/workReportExpenseBilling.ts';
import { computeBasicWorkReportNetMargin } from '../src/lib/workReportBasicNetMargin.ts';

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
        {
          qty: 1,
          unit_price: 100,
          bill_to_partner: false,
          bill_to_customer: true,
        },
        {
          qty: 2,
          unit_price: 12.5,
          bill_to_partner: false,
          bill_to_customer: true,
        },
        { qty: 5, unit_price: 20, bill_to_partner: true, bill_to_customer: true },
      ],
    },
  ]),
  125,
);

assert.equal(
  sumDailyLogExpensePurchaseNet([
    {
      expense_lines: [
        {
          qty: 1,
          unit_price: 0,
          bill_to_partner: false,
          bill_to_customer: true,
        },
      ],
    },
  ]),
  0,
);

const margin = computeBasicWorkReportNetMargin({
  customerCalculation: {
    version: 3,
    billToCompanyId: null,
    billToCompanyName: 'Asiakas',
    ratesUsed: { hourly_regular: 65, hourly_overtime: 0, hourly_on_call: 0 },
    ratesSource: 'company_default',
    byUser: [],
    grandTotal: 3805.68,
    excludedTotal: 0,
  },
  partnerCalculation: {
    version: 3,
    billToCompanyId: null,
    billToCompanyName: 'Kumppani',
    ratesUsed: { hourly_regular: 50, hourly_overtime: 0, hourly_on_call: 0 },
    ratesSource: 'partnership',
    byUser: [],
    grandTotal: 185.11,
    excludedTotal: 0,
  },
  logs: [
    {
      expense_lines: [
        {
          qty: 1,
          unit_price: 3570.78,
          bill_to_partner: false,
          bill_to_customer: true,
          description: 'Chiller Oy osto',
        },
      ],
    },
  ],
});
assert.equal(margin.ok, true);
if (margin.ok) {
  assert.equal(margin.netMarginNet, 49.79);
}

console.log('test-expense-purchase-price: ok');
