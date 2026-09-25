/**
 * Provisio-osion "Tarjouksen provisio (koko työraportti)" -lomake: % / € -luonnos ↔ billing_quote.
 * Vertailutaulukko on vain näyttö; nämä säännöt vastaavat aiempaa taulukon editoria.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  quoteCommissionChanged,
  quoteCommissionDraftFromSettings,
  quoteCommissionFromDraft,
  quoteCommissionSubtitle,
} from '../src/lib/quoteCommissionDraft.ts';
import { computePartnerNetMargin, normalizeBillingQuoteSettings } from '../src/lib/workReportBillingQuote.ts';

// Oletus: 50 %, ei summaa.
const empty = {};
assert.deepEqual(quoteCommissionDraftFromSettings(empty), { percent: '50', amount: '' });
assert.equal(quoteCommissionSubtitle(quoteCommissionDraftFromSettings(empty)), 'Tarjous: 50 % katteesta');

// Tallennettu % ja €.
assert.deepEqual(quoteCommissionDraftFromSettings({ partner_commission_percent: 42.5 }), {
  percent: '42,5',
  amount: '',
});
const amountSettings = { partner_commission_percent: 40, partner_commission_amount: 812.35 };
assert.deepEqual(quoteCommissionDraftFromSettings(amountSettings), { percent: '40', amount: '812,35' });
assert.equal(quoteCommissionSubtitle({ percent: '40', amount: '812,35' }), 'Tarjous: sovittu 812,35 €');

// % → amount null.
let r = quoteCommissionFromDraft({ percent: '45,5', amount: '' }, empty);
assert.deepEqual(r, { value: { percent: 45.5, amount: null } });
assert.equal(quoteCommissionChanged(r.value, empty), true);
// Tyhjä % = oletus 50 → ei muutosta.
r = quoteCommissionFromDraft({ percent: '', amount: '' }, empty);
assert.deepEqual(r, { value: { percent: 50, amount: null } });
assert.equal(quoteCommissionChanged(r.value, empty), false);
// € voittaa; % säilyy tallennettuna (kuten taulukon editorissa).
r = quoteCommissionFromDraft({ percent: '10', amount: '1 000,5' }, { partner_commission_percent: 40 });
assert.deepEqual(r, { value: { percent: 40, amount: 1000.5 } });
assert.equal(quoteCommissionChanged(r.value, { partner_commission_percent: 40 }), true);
// Summan tyhjennys → takaisin prosenttitilaan.
r = quoteCommissionFromDraft({ percent: '40', amount: '' }, amountSettings);
assert.deepEqual(r, { value: { percent: 40, amount: null } });
assert.equal(quoteCommissionChanged(r.value, amountSettings), true);
// Sama summa → ei muutosta.
r = quoteCommissionFromDraft({ percent: '40', amount: '812,35' }, amountSettings);
assert.equal(quoteCommissionChanged(r.value, amountSettings), false);
// 0 € on sallittu sovittu summa.
assert.deepEqual(quoteCommissionFromDraft({ percent: '', amount: '0' }, empty), {
  value: { percent: 50, amount: 0 },
});
// Virheet.
assert.ok('error' in quoteCommissionFromDraft({ percent: '120', amount: '' }, empty));
assert.ok('error' in quoteCommissionFromDraft({ percent: 'abc', amount: '' }, empty));
assert.ok('error' in quoteCommissionFromDraft({ percent: '', amount: '-5' }, empty));

// Laskenta ennallaan: sama tallennettu arvo → sama provisio kuin ennen.
const base = normalizeBillingQuoteSettings({ quote_sale_net: 3982.4, quote_purchase_net: 0 });
const pct = computePartnerNetMargin(
  normalizeBillingQuoteSettings({ ...base, partner_commission_percent: 50, partner_commission_amount: null }),
  400,
);
const pctViaDraft = quoteCommissionFromDraft({ percent: '50', amount: '' }, base).value;
const pct2 = computePartnerNetMargin(
  normalizeBillingQuoteSettings({
    ...base,
    partner_commission_percent: pctViaDraft.percent,
    partner_commission_amount: pctViaDraft.amount,
  }),
  400,
);
assert.equal(pct2.commissionNet, pct.commissionNet);
assert.equal(pct2.commissionSource, 'percent');
const amt = quoteCommissionFromDraft({ percent: '50', amount: '500' }, base).value;
const amtMargin = computePartnerNetMargin(
  normalizeBillingQuoteSettings({ ...base, partner_commission_percent: amt.percent, partner_commission_amount: amt.amount }),
  400,
);
assert.equal(amtMargin.commissionNet, 500);
assert.equal(amtMargin.commissionSource, 'amount');

// Vertailutaulukko on vain näyttö: ei provisio- eikä laite-editoria.
const panel = readFileSync(new URL('../src/components/WorkReportBillingQuotePanel.tsx', import.meta.url), 'utf8');
const view = readFileSync(new URL('../src/components/QuoteOutcomeSummaryView.tsx', import.meta.url), 'utf8');
for (const src of [panel, view]) {
  assert.ok(!src.includes('Tallenna provisio'));
  assert.ok(!src.includes('Muokkaa provisiota'));
  assert.ok(!src.includes('saveBillingQuoteCommission'));
  assert.ok(!src.includes('commissionEditor'));
  assert.ok(!src.includes('Muokkaa laitetta'));
  assert.ok(!src.includes('deviceEditor'));
}
const page = readFileSync(new URL('../src/pages/WorkReportDetailPage.tsx', import.meta.url), 'utf8');
assert.ok(page.includes('Tarjouksen provisio (koko työraportti)'));
assert.ok(page.includes('saveBillingQuoteCommission'));

console.log('quote commission draft OK');
