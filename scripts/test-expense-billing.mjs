import assert from 'node:assert/strict';
import {
  applyExpenseBillingMode,
  computeCustomerPriceFromPartnerCost,
  expenseCustomerPriceMissing,
  expenseIncludedInCustomerInvoice,
  inferPartnerExpenseMarginPercent,
  resolveExpenseBillingMode,
  resolveExpenseCustomerUnitPrice,
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
  false,
);
assert.equal(
  expenseCustomerPriceMissing({ ...customerOnlyRow, customer_unit_price: '80', unit_price: '50' }),
  false,
);

const quoteIncludedSupply = {
  ...customerOnlyRow,
  unit_price: '400.5',
  customer_unit_price: '',
  customer_margin_percent: 80,
  extra_billable: false,
  extra_billing_allowed: false,
};
assert.equal(expenseIncludedInCustomerInvoice(quoteIncludedSupply), false);
assert.equal(expenseCustomerPriceMissing(quoteIncludedSupply), false);

const extraBillableSupply = {
  ...quoteIncludedSupply,
  extra_billable: true,
  extra_billing_allowed: true,
};
assert.equal(expenseIncludedInCustomerInvoice(extraBillableSupply), true);
assert.equal(expenseCustomerPriceMissing(extraBillableSupply), false);
assert.equal(resolveExpenseCustomerUnitPrice(extraBillableSupply), 720.9);

console.log('test-expense-billing: ok');
