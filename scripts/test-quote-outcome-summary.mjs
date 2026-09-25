/**
 * "Tarjous ja kate" -yhteenveto (Messukeskus-esimerkki):
 * - tarjouksen "Hankinta" 2210 = tarvikkeet 250 + kulurivi 250 + laite 1260 + asennustyö 8 h × 50 + huoltoauto 50
 * - vertailun arvio käyttää samaa pohjaa: työt 400 + tarvikkeet 250 + kulut 300 + laite 1260 = 2210
 *   (ennen: kulurivi laskettiin sekä tarvikkeisiin että kuluihin, huoltoauto puuttui → 2410)
 * - toteutunut: 400 + 245 + 40,30 + 1260 = 1945,30 → kate 3982,40 − 1945,30 = 2037,10
 * - kate-ero = −(kulujen ero) kun lisälaskutusta ei ole.
 */
import assert from 'node:assert/strict';
import { calculateWorkReportBillable, formatEuro } from '../src/lib/workReportBilling.ts';
import { computePartnerNetMargin } from '../src/lib/workReportBillingQuote.ts';
import { mergeActualPurchaseFromWorkReportLogs } from '../src/lib/quoteRequestActualPurchaseSync.ts';
import { extractQuotePurchaseLines, sumQuotePurchaseLines } from '../src/lib/quotePurchaseLines.ts';
import { compareQuoteCategories } from '../src/lib/quoteCategoryComparison.ts';
import { createEmptyQuoteRequestData } from '../src/lib/quoteRequest/defaults.ts';
import {
  buildQuoteOutcomeSummary,
  costVarianceTone,
  formatSignedEuro,
  marginVarianceTone,
  outcomeVarianceExplanation,
  renderQuoteOutcomeSummaryHtml,
  verdictFor,
} from '../src/lib/quoteOutcomeSummary.ts';

// --- Värilogiikka
assert.equal(costVarianceTone(2410, 1945.3), 'better');
assert.equal(costVarianceTone(100, 120), 'worse');
assert.equal(costVarianceTone(100, 100.004), 'neutral');
assert.equal(costVarianceTone(null, 100), 'neutral');
assert.equal(marginVarianceTone(1772.4, 2037.1), 'better');
assert.equal(marginVarianceTone(1772.4, 1500), 'worse');
assert.equal(marginVarianceTone(10, 10), 'neutral');
assert.equal(formatSignedEuro(264.7, formatEuro).replace(/\s/g, ' '), '+264,70 €');
assert.equal(formatSignedEuro(-264.7, formatEuro).replace(/\s/g, ' '), '−264,70 €');
assert.equal(formatSignedEuro(0.001, formatEuro).replace(/\s/g, ' '), '0,00 €');
assert.equal(verdictFor(264.7, formatEuro).tone, 'better');
assert.match(verdictFor(264.7, formatEuro).label, /^Meni arviota paremmin \+264,70/);
assert.match(verdictFor(-12, formatEuro).label, /^Meni arviota huonommin −12,00/);
assert.equal(verdictFor(0, formatEuro).label, 'Meni arvion mukaan');
assert.equal(verdictFor(null, formatEuro), null);

// --- Messukeskus-fixture
export const messukeskusQuoteData = {
  ...createEmptyQuoteRequestData('huolto'),
  workItems: [{ id: 'w1', description: 'Huolto / korjaus', hours: 8, pricePerHour: 65, materials: [] }],
  installationLaborPurchaseRate: 50,
  installationVehicleAllowance: 50,
  installationVehicleHoursPerBlock: 8,
  installationSupplies: [
    { id: 'dev-1', name: 'Laite', quantity: 1, purchasePrice: 1260, marginPercent: 30, sellPrice: 1638, rowKind: 'device' },
    { id: 'sup-1', name: 'Tarvikkeet', quantity: 1, purchasePrice: 250, marginPercent: 30, sellPrice: 325, rowKind: 'supply' },
    { id: 'exp-1', name: 'Nosturi', quantity: 1, purchasePrice: 250, marginPercent: 20, sellPrice: 300, rowKind: 'expense' },
  ],
};

const quoteLines = extractQuotePurchaseLines(messukeskusQuoteData);
// Tarjouksen "Hankinta"
assert.equal(sumQuotePurchaseLines(quoteLines, 'quote_purchase_net'), 2210);
assert.equal(quoteLines.find((l) => l.id === 'material:exp-1')?.row_kind, 'expense');

const logs = [
  {
    id: 'log-1',
    log_date: '2026-09-20',
    entry_type: 'regular',
    hours_regular: 8,
    created_by: 'u1',
    trip_legs: [{ distance_km: 68.3 }],
    commission_amount: 896.4,
    expense_lines: [
      {
        id: 'exp-tarvike',
        expense_type: 'supplies',
        description: 'Asennustarvikkeet',
        qty: 1,
        unit_price: 245,
        bill_to_partner: false,
        bill_to_customer: false,
      },
    ],
  },
];
const users = [{ id: 'u1', display_name: 'Asentaja', bill_hours_enabled: true, bill_expenses_enabled: true }];
const rates = { hourly_regular: 50, hourly_overtime: 75, hourly_on_call: 100 };
const partnerCalculation = calculateWorkReportBillable({
  logs,
  users,
  rates,
  ratesSource: 'partnership',
  tripKmRate: 0.59,
  billToCompanyId: 'owner',
  billToCompanyName: 'Owner Oy',
});

const settings = mergeActualPurchaseFromWorkReportLogs(
  {
    quote_request_id: 'q-1',
    quote_title: 'Messukeskus – Tarjous huollosta tai korjauksesta',
    quote_sale_net: 3982.4,
    customer_invoice_total: 3982.4,
    customer_mode: 'quote_fixed',
    partner_commission_percent: 50,
    purchase_lines: quoteLines,
  },
  logs,
  messukeskusQuoteData,
);

const comparison = compareQuoteCategories({
  quoteData: messukeskusQuoteData,
  partnerCalculation,
  logs,
  partnerRates: rates,
  tripKmRate: 0.59,
  billingSettings: settings,
});
assert.ok(comparison);
const byKey = Object.fromEntries(comparison.rows.map((row) => [row.key, row]));
assert.equal(byKey.labor.quoteNet, 400);
assert.equal(byKey.labor.actualNet, 400);
assert.equal(byKey.supplies.quoteNet, 250, 'kulurivi ei saa olla myös tarvikkeissa');
assert.equal(byKey.supplies.actualNet, 245);
assert.equal(byKey.expenses.quoteNet, 300, 'kulurivi 250 + huoltoauto 50');
assert.equal(byKey.expenses.actualNet, 40.3);
assert.equal(byKey.device.quoteNet, 1260);
assert.equal(byKey.device.actualNet, 1260);
assert.equal(comparison.quoteTotalNet, 2210, 'arvio = tarjouksen Hankinta');
assert.equal(comparison.actualTotalNet, 1945.3);

const partnerMargin = computePartnerNetMargin(settings, partnerCalculation.grandTotal, {
  logs,
  partnerRates: rates,
  partnerCalculation,
});
assert.ok(partnerMargin);
assert.equal(partnerMargin.grossMarginNet, 2037.1);
assert.equal(partnerMargin.commissionSource, 'daily_log');
assert.equal(partnerMargin.commissionNet, 896.4);
assert.equal(partnerMargin.netMarginNet, 1140.7);

const summary = buildQuoteOutcomeSummary({ partnerMargin, comparison, formatEuro });
assert.equal(summary.saleTotalNet, 3982.4);
assert.deepEqual(summary.costs, { estimateNet: 2210, actualNet: 1945.3, varianceNet: -264.7, tone: 'better' });
assert.deepEqual(summary.grossMargin, { estimateNet: 1772.4, actualNet: 2037.1, varianceNet: 264.7, tone: 'better' });
assert.equal(summary.grossMargin.varianceNet, -summary.costs.varianceNet, 'kate-ero = −kulujen ero');
assert.equal(summary.rows.length, 4, 'ei "Muut kate-erät" -riviä');
assert.equal(summary.rows.find((r) => r.key === 'labor').qtyLabel, '8 h / 8 h');
assert.equal(summary.rows.find((r) => r.key === 'expenses').qtyLabel, '0 km / 68,3 km');
assert.equal(summary.rows.find((r) => r.key === 'expenses').tone, 'better');
assert.equal(summary.netMarginNet, 1140.7);
assert.equal(summary.verdict.tone, 'better');
assert.match(summary.verdict.label, /paremmin \+264,70/);
assert.match(outcomeVarianceExplanation(summary, formatEuro), /^Kulut 264,70\s€ arviota pienemmät$/);

// --- Sisäinen tuloste: sama yhteenveto
const html = renderQuoteOutcomeSummaryHtml(summary, { escapeHtml: (v) => v, formatEuro, quoteTitle: 'Messukeskus' });
assert.match(html, /Kiinteä tarjoushinta/);
assert.match(html, /Meni arviota paremmin \+264,70/);
assert.match(html, /2\s?210,00/);
assert.match(html, /Puhdas kate/);
assert.match(html, /#15803d/);

// --- Toteutuneet rivit summautuvat aina katteeseen ("Muut kate-erät")
const withEating = {
  ...partnerMargin,
  deductionRows: [...partnerMargin.deductionRows, { key: 'margin_eating', label: 'Katetta syövät kulut', amount: 30 }],
  grossMarginNet: 2007.1,
};
const s2 = buildQuoteOutcomeSummary({ partnerMargin: withEating, comparison, formatEuro });
const other = s2.rows.find((r) => r.key === 'other');
assert.equal(other.actualNet, 30);
assert.equal(other.tone, 'worse');
assert.equal(
  Math.round(s2.rows.reduce((sum, r) => sum + r.actualNet, 0) * 100) / 100,
  s2.costs.actualNet,
);
assert.equal(s2.grossMargin.varianceNet, -s2.costs.varianceNet);

// --- Lisälaskutus: kate-ero = −kulujen ero + lisät
const withExtras = {
  ...partnerMargin,
  customerExtrasNet: 500,
  deductionRows: [...partnerMargin.deductionRows, { key: 'piikki_material', label: 'Lisätilauksen hankintakulut', amount: 200 }],
  grossMarginNet: 2337.1,
};
const s3 = buildQuoteOutcomeSummary({ partnerMargin: withExtras, comparison, formatEuro });
assert.equal(s3.saleTotalNet, 4482.4);
assert.equal(s3.costs.varianceNet, -64.7);
assert.equal(s3.grossMargin.varianceNet, 564.7);
assert.equal(Math.round((-s3.costs.varianceNet + s3.customerExtrasNet) * 100) / 100, s3.grossMargin.varianceNet);
assert.match(outcomeVarianceExplanation(s3, formatEuro), /lisälaskutus \+500,00/);

// --- Ei tarjousvertailua: ei arviota eikä tuomiota
const s4 = buildQuoteOutcomeSummary({ partnerMargin, comparison: null, formatEuro });
assert.equal(s4.costs.estimateNet, null);
assert.equal(s4.grossMargin.varianceNet, null);
assert.equal(s4.verdict, null);

// --- Vain kulut (katetta ei näytetä): tuomio kulujen erosta
const s5 = buildQuoteOutcomeSummary({ partnerMargin: null, comparison, quoteSaleNet: 3982.4, formatEuro });
assert.equal(s5.grossMargin, null);
assert.equal(s5.hasMargin, false);
assert.deepEqual(s5.costs, { estimateNet: 2210, actualNet: 1945.3, varianceNet: -264.7, tone: 'better' });
assert.equal(s5.verdict.tone, 'better');
assert.equal(buildQuoteOutcomeSummary({ partnerMargin: null, comparison: null, formatEuro }), null);

console.log('test-quote-outcome-summary: OK');
