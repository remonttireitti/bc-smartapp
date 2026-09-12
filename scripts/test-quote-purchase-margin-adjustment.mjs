import assert from 'node:assert/strict';
import { computeQuotePurchaseMarginAdjustment } from '../src/lib/workReportBillingQuote.ts';

const adjustment = computeQuotePurchaseMarginAdjustment({
  quote_sale_net: 24550,
  quote_purchase_net: 22850,
  actual_purchase_net: 24000,
  purchase_lines: [
    {
      id: 'machines',
      label: 'Koneet',
      quote_purchase_net: 22850,
      actual_purchase_net: 24000,
    },
  ],
});

assert.ok(adjustment);
assert.equal(adjustment.purchaseDeltaNet, 1150);
assert.equal(adjustment.marginNetAtQuote, 1700);
assert.equal(adjustment.marginNetAfterActual, 550);
assert.equal(adjustment.marginPercentAtQuote, 6.92);
assert.equal(adjustment.marginPercentAfterActual, 2.24);

console.log('test-quote-purchase-margin-adjustment: ok');
