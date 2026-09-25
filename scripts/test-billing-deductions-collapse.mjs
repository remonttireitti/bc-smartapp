/**
 * Laskutuksen "Vähennykset (varasto ja piikki)" -osio piilossa, ellei ole vähennettävää;
 * oikopolkurivi avaa osion (oletuksena Vähennetty-suodatin).
 */
import assert from 'node:assert/strict';
import {
  billingDeductionExpandFilter,
  billingDeductionPanelMode,
  billingDeductionShortcutSummary,
  canCollapseBillingDeductionPanel,
} from '../src/lib/billingDeductionPanelView.ts';
import { partnerBillingDeductionTotals } from '../src/lib/partnerBillingDeductions.ts';

const row = (charged, total) => ({ charged, total });

// Ei yhtään vähennystä → ei mitään
const none = partnerBillingDeductionTotals([]);
assert.equal(billingDeductionPanelMode(none, false), 'hidden');
assert.equal(billingDeductionPanelMode(none, true), 'hidden');
assert.equal(canCollapseBillingDeductionPanel(none), false);

// Avoimia → koko osio, Avoimet-suodatin, ei piilotusta
const open = partnerBillingDeductionTotals([row(false, 12.5), row(true, 100)]);
assert.equal(billingDeductionPanelMode(open, false), 'full');
assert.equal(billingDeductionPanelMode(open, true), 'full');
assert.equal(billingDeductionExpandFilter(open), 'open');
assert.equal(canCollapseBillingDeductionPanel(open), false);

// Vain vähennettyjä → oikopolku, avattaessa Vähennetty
const charged = partnerBillingDeductionTotals([row(true, 200), row(true, 71.11)]);
assert.equal(billingDeductionPanelMode(charged, false), 'collapsed');
assert.equal(billingDeductionPanelMode(charged, true), 'full');
assert.equal(billingDeductionExpandFilter(charged), 'charged');
assert.equal(canCollapseBillingDeductionPanel(charged), true);
const summary = billingDeductionShortcutSummary(charged);
assert.match(summary, /^ei avoimia · 2 vähennetty \(271,11\s€\)$/u);

console.log('test-billing-deductions-collapse: OK');
