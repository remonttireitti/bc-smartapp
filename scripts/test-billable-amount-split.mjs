import assert from 'node:assert/strict';
import {
  formatBillingAmountSplitLabel,
  resolveCustomerBillingAmounts,
  resolvePartnerBillingAmounts,
} from '../src/lib/workReportBillingCopy.ts';

function formatEuro(amount) {
  return `${amount.toFixed(2).replace('.', ',')} €`;
}

{
  const amounts = resolvePartnerBillingAmounts(1109.38, 1109.38, 'paid');
  assert.equal(amounts.state, 'billed');
  assert.equal(amounts.billed, 1109.38);
  assert.equal(amounts.open, 0);
  assert.equal(
    formatBillingAmountSplitLabel(amounts.billed, amounts.open, formatEuro),
    'Laskutettu 1109,38 € · Laskuttamatta 0,00 €',
  );
}

{
  const amounts = resolvePartnerBillingAmounts(1109.38, 800, 'partial');
  assert.equal(amounts.state, 'partial');
  assert.equal(amounts.billed, 800);
  assert.equal(amounts.open, 309.38);
}

{
  const amounts = resolvePartnerBillingAmounts(1109.38, null, 'none');
  assert.equal(amounts.state, 'open');
  assert.equal(amounts.billed, 0);
  assert.equal(amounts.open, 1109.38);
}

{
  const paid = resolveCustomerBillingAmounts(500, true);
  assert.equal(paid.state, 'billed');
  assert.equal(paid.billed, 500);
  assert.equal(paid.open, 0);

  const open = resolveCustomerBillingAmounts(500, false);
  assert.equal(open.state, 'open');
  assert.equal(open.billed, 0);
  assert.equal(open.open, 500);
}

console.log('test-billable-amount-split: ok');
