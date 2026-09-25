/**
 * Tarjous ja kate -paneeli ilman kohdistettua tarjousta: Tarjoushinta / asiakashinta tallentuvat
 * billing_quoteen (quote_sale_net / customer_invoice_total) ja laskelma (kate, provisio, partner_total)
 * päivittyy tallennetuista arvoista. "Huomio kumppanille" -kenttä on poistettu paneelista.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  applyBillingQuotePrices,
  billingQuotePriceDraftFromSettings,
  billingQuotePricesChanged,
  billingQuotePricesFromDraft,
} from '../src/lib/billingQuotePriceDraft.ts';
import {
  normalizeBillingQuoteSettings,
  parseBillingQuoteSettings,
} from '../src/lib/workReportBillingQuote.ts';
import { calculateWorkReportBillable } from '../src/lib/workReportBilling.ts';
import { applyQuoteCommissionToPartnerCalculation } from '../src/lib/workReportPartnerTotal.ts';

// --- Luonnos ↔ asetukset
const stored = parseBillingQuoteSettings({
  quote_sale_net: 3000,
  customer_invoice_total: 3000,
  customer_mode: 'quote_fixed',
  partner_commission_percent: 50,
  notes: 'vanha huomio',
});
assert.deepEqual(billingQuotePriceDraftFromSettings(stored), { saleNet: '3000', customerTotal: '3000' });
assert.deepEqual(billingQuotePriceDraftFromSettings({ quote_sale_net: 1234.5 }), {
  saleNet: '1234,5',
  customerTotal: '',
});

// Ilman erillistä asiakashintaa asiakashinta = tarjoushinta.
let r = billingQuotePricesFromDraft({ saleNet: '3 500,25', customerTotal: '' }, { separateCustomerTotal: false });
assert.deepEqual(r, { value: { quote_sale_net: 3500.25, customer_invoice_total: 3500.25 } });
assert.equal(billingQuotePricesChanged(r.value, stored), true);
// Erillinen asiakashinta (esim. sis. alv).
r = billingQuotePricesFromDraft({ saleNet: '3000', customerTotal: '3765' }, { separateCustomerTotal: true });
assert.deepEqual(r, { value: { quote_sale_net: 3000, customer_invoice_total: 3765 } });
r = billingQuotePricesFromDraft({ saleNet: '3000', customerTotal: '' }, { separateCustomerTotal: true });
assert.deepEqual(r, { value: { quote_sale_net: 3000, customer_invoice_total: null } });
// Ei muutosta.
r = billingQuotePricesFromDraft({ saleNet: '3000', customerTotal: '3000' }, { separateCustomerTotal: false });
assert.equal(billingQuotePricesChanged(r.value, stored), false);
// Virheet.
assert.ok('error' in billingQuotePricesFromDraft({ saleNet: '', customerTotal: '' }, { separateCustomerTotal: false }));
assert.ok('error' in billingQuotePricesFromDraft({ saleNet: 'abc', customerTotal: '' }, { separateCustomerTotal: false }));
assert.ok('error' in billingQuotePricesFromDraft({ saleNet: '-1', customerTotal: '' }, { separateCustomerTotal: false }));
assert.ok('error' in billingQuotePricesFromDraft({ saleNet: '10', customerTotal: 'x' }, { separateCustomerTotal: true }));

// --- Tallennus säilyttää muut asetukset; kannasta luettu (JSON) palauttaa samat arvot.
const next = normalizeBillingQuoteSettings(
  applyBillingQuotePrices(stored, { quote_sale_net: 4000, customer_invoice_total: 4000 }),
);
const reloaded = parseBillingQuoteSettings(JSON.parse(JSON.stringify(next)));
assert.equal(reloaded.quote_sale_net, 4000);
assert.equal(reloaded.customer_invoice_total, 4000);
assert.equal(reloaded.customer_mode, 'quote_fixed');
assert.equal(reloaded.partner_commission_percent, 50);
assert.equal(reloaded.notes, 'vanha huomio');
assert.deepEqual(billingQuotePriceDraftFromSettings(reloaded), { saleNet: '4000', customerTotal: '4000' });

// --- Uudelleenlaskenta: provisio ja partner_total seuraavat tallennettua tarjoushintaa.
const logs = [
  {
    id: 'log-1',
    log_date: '2026-09-20',
    entry_type: 'regular',
    hours_regular: 8,
    created_by: 'u1',
    expense_lines: [],
  },
];
const base = calculateWorkReportBillable({
  logs,
  users: [{ id: 'u1', display_name: 'A', bill_hours_enabled: true, bill_expenses_enabled: true }],
  rates: { hourly_regular: 50, hourly_overtime: 75, hourly_on_call: 100 },
  ratesSource: 'partnership',
  billToCompanyId: 'owner',
  billToCompanyName: 'Owner Oy',
});
assert.equal(base.grandTotal, 400);
const before = applyQuoteCommissionToPartnerCalculation({ billingQuote: stored, logs, calculation: base });
const after = applyQuoteCommissionToPartnerCalculation({ billingQuote: reloaded, logs, calculation: base });
// Kate ennen provisiota = tarjoushinta − työ (400); provisio 50 %.
assert.equal(before.partnerMargin.grossMarginNet, 2600);
assert.equal(before.partnerMargin.commissionNet, 1300);
assert.equal(before.calculation.grandTotal, 1700);
assert.equal(after.partnerMargin.grossMarginNet, 3600);
assert.equal(after.partnerMargin.commissionNet, 1800);
assert.equal(after.calculation.grandTotal, 2200);

// --- UI: hinnat tallennetaan, Huomio kumppanille poistettu.
const panel = readFileSync(new URL('../src/components/WorkReportBillingQuotePanel.tsx', import.meta.url), 'utf8');
assert.ok(!panel.includes('Huomio kumppanille'));
assert.ok(!panel.includes('settings.notes'));
assert.ok(panel.includes('saveBillingQuotePrices'));
const page = readFileSync(new URL('../src/pages/WorkReportDetailPage.tsx', import.meta.url), 'utf8');
assert.ok(page.includes('onSaved={handleBillingQuotePricesSaved}'));
assert.match(page, /handleBillingQuotePricesSaved[\s\S]*refreshBillable[\s\S]*refreshCustomerBillable/);

console.log('billing quote prices save OK');
