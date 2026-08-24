import assert from 'node:assert/strict';
import {
  applyExpenseBillingMode,
  computeCustomerPriceFromPartnerCost,
  expenseCustomerPriceMissing,
  inferPartnerExpenseMarginPercent,
  resolveExpenseBillingMode,
} from '../src/lib/workReportExpenseBilling.ts';

assert.equal(computeCustomerPriceFromPartnerCost(90, 10), 100);
assert.equal(inferPartnerExpenseMarginPercent(90, 100), 10);

const partnerRow = applyExpenseBillingMode(
  { bill_to_partner: true, bill_to_customer: true, unit_price: '50', customer_unit_price: '' },
  'partner_and_customer',
);
assert.equal(resolveExpenseBillingMode(partnerRow), 'partner_and_customer');

const customerOnlyRow = applyExpenseBillingMode(
  { bill_to_partner: true, bill_to_customer: true, unit_price: '50', customer_unit_price: '' },
  'customer_only',
);
assert.equal(resolveExpenseBillingMode(customerOnlyRow), 'customer_only');
assert.equal(
  expenseCustomerPriceMissing({ ...customerOnlyRow, customer_unit_price: '', unit_price: '50' }),
  true,
);
assert.equal(
  expenseCustomerPriceMissing({ ...customerOnlyRow, customer_unit_price: '80', unit_price: '50' }),
  false,
);

console.log('test-expense-billing: ok');
