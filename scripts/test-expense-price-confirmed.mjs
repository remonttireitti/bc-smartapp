/**
 * Vahvistettu 0 € (kulua ei syntynyt): supply_line_flags[i].price_confirmed.
 * - ei "hinta puuttuu", lasketaan 0 €:na (ei tarjouspyynnön hintaa alustavasti)
 * - tiilen luonnos ↔ tallennus säilyttää lipun; taulukon 0 € kirjoittaa saman lipun
 * - tarjousrivien synkka ei poista eikä luo uudelleen vahvistettua riviä
 * - asiakastuloste piilottaa yhä 0 €-rivin
 */
import assert from 'node:assert/strict';
import {
  annotateExpensePriceConfirmed,
  withSupplyLinePriceConfirmed,
  parseDailyLogCustomerExtraBilling,
  serializeDailyLogCustomerExtraBilling,
} from '../src/lib/dailyLogCustomerExtraBilling.ts';
import {
  collectUnpricedQuoteRows,
  countUnpricedExpenseLines,
  expenseLinesForCustomerPrint,
  isUntouchedSeededLine,
  unpricedQuoteRowTotals,
} from '../src/lib/quoteSeededRows.ts';
import { expensesToDrafts } from '../src/lib/dailyLogExpenseDraft.ts';
import { buildSupplyLineFlagsFromExpenseDrafts } from '../src/lib/workReportExpenseBilling.ts';
import { buildQuoteOutcomeSummary } from '../src/lib/quoteOutcomeSummary.ts';

const zero = { unit_price: 0, customer_unit_price: null, bill_to_partner: false, bill_to_customer: false };
const log = {
  id: 'l1',
  log_date: '2026-10-06',
  customer_extra_billing: { supply_line_flags: [{ extra_billable: false, extra_billing_allowed: false, customer_margin_percent: 80 }] },
  expense_lines: [
    // tarkoituksella väärässä järjestyksessä: sort_order ratkaisee
    { id: 'b', expense_type: 'material', description: 'Majoitus', qty: 3, sort_order: 2, ...zero },
    { id: 'km', expense_type: 'km', description: 'Ajomatkat (10 km)', qty: 10, unit_price: 0.59, sort_order: 1 },
    { id: 'a', expense_type: 'material', description: 'Kupariputki', qty: 2, sort_order: 0, ...zero },
  ],
};
const settings = {
  quote_request_id: 'q',
  purchase_lines: [
    { id: 'material:a', label: 'Kupariputki', quote_purchase_net: 580 },
    { id: 'material:b', label: 'Majoitus', quote_purchase_net: 300 },
  ],
  quote_seeded_rows: {
    quote_request_id: 'q',
    lines: [
      { id: 'material:a', description: 'Kupariputki', expense_type: 'material', qty: 2 },
      { id: 'material:b', description: 'Majoitus', expense_type: 'material', qty: 3 },
    ],
  },
};

// Ennen: 2 hinnatonta, alustava 880 €.
let logs = annotateExpensePriceConfirmed([log]);
assert.deepEqual(logs[0].expense_lines.map((l) => l.id), ['a', 'km', 'b']);
assert.equal(countUnpricedExpenseLines(logs), 2);
assert.deepEqual(unpricedQuoteRowTotals(collectUnpricedQuoteRows(logs, settings)), { supplies: 880, expenses: 0 });

// Taulukko: Majoitus 0 € → lippu indeksiin 1 (km ohitetaan), puuttuva lippu täydennetään.
const nextBilling = withSupplyLinePriceConfirmed(logs[0], 'b', true);
assert.equal(nextBilling.supply_line_flags.length, 2);
assert.equal(nextBilling.supply_line_flags[0].customer_margin_percent, 80);
assert.equal(nextBilling.supply_line_flags[1].price_confirmed, true);
// JSON kestää parse/serialize-kierroksen
const roundTrip = serializeDailyLogCustomerExtraBilling(parseDailyLogCustomerExtraBilling(nextBilling));
assert.equal(roundTrip.supply_line_flags[1].price_confirmed, true);
logs = annotateExpensePriceConfirmed([{ ...log, customer_extra_billing: nextBilling }]);
const majoitus = logs[0].expense_lines.find((l) => l.id === 'b');
assert.equal(majoitus.price_confirmed, true);
assert.equal(countUnpricedExpenseLines(logs), 1);
const left = collectUnpricedQuoteRows(logs, settings);
assert.deepEqual(left.map((r) => r.description), ['Kupariputki']);
assert.deepEqual(unpricedQuoteRowTotals(left), { supplies: 580, expenses: 0 });

// Synkka: vahvistettu rivi ei ole "koskematon" → ei poisteta tarjouksen vaihtuessa; nimi täsmää → ei luoda uudelleen.
assert.equal(isUntouchedSeededLine(majoitus, settings.quote_seeded_rows.lines[1]), false);
assert.equal(isUntouchedSeededLine(logs[0].expense_lines[0], settings.quote_seeded_rows.lines[0]), true);

// Asiakastuloste: vahvistettu 0 € ei näy.
assert.deepEqual(expenseLinesForCustomerPrint(logs[0].expense_lines).map((l) => l.id), ['km']);

// Tiili: luonnos ↔ tallennus säilyttää lipun samassa indeksissä.
const flags = parseDailyLogCustomerExtraBilling(nextBilling).supply_line_flags;
const drafts = expensesToDrafts(logs[0].expense_lines, flags);
assert.equal(drafts.find((d) => d.key === 'b').price_confirmed, true);
assert.equal(drafts.find((d) => d.key === 'a').price_confirmed, undefined);
const rebuilt = buildSupplyLineFlagsFromExpenseDrafts(drafts);
assert.equal(rebuilt.length, 2);
assert.equal(rebuilt[1].price_confirmed, true);
assert.equal(rebuilt[0].price_confirmed, undefined);
// Tiilessä hinta > 0 → lippu ei tallennu
const priced = drafts.map((d) => (d.key === 'b' ? { ...d, unit_price: '90' } : d));
assert.equal(buildSupplyLineFlagsFromExpenseDrafts(priced)[1].price_confirmed, undefined);
// Lipun poisto (taulukossa hinta > 0 vahvistetulle riville)
assert.equal(withSupplyLinePriceConfirmed(logs[0], 'b', false).supply_line_flags[1].price_confirmed, undefined);

// Laskenta (Wärtsilä-luvut): Freddox 580 € vahvistetaan 0 €:ksi → tarvikkeet 2160 → 1580, tuomio 1662 → 2242.
const comparison = {
  rows: [
    { key: 'labor', label: 'Työt', quoteNet: 2900, actualNet: 1750 },
    { key: 'supplies', label: 'Tarvikkeet', quoteNet: 2160, actualNet: 0 },
    { key: 'expenses', label: 'Kulut', quoteNet: 1578.6, actualNet: 240.6 },
    { key: 'device', label: 'Laite', quoteNet: 4174, actualNet: 5000 },
  ],
  quoteTotalNet: 10812.6,
  actualTotalNet: 6990.6,
};
const partnerMargin = {
  quoteSaleNet: 16069.2, customerExtrasNet: 0, grossMarginNet: 9078.6, netMarginNet: 9078.6,
  commissionNet: 0, commissionPercent: 0, commissionSource: 'percent',
  deductionRows: [
    { key: 'labor_expenses', label: 'Työ ja kulut', amount: 1990.6 },
    { key: 'device', label: 'Laite', amount: 5000 },
  ],
};
const s = buildQuoteOutcomeSummary({ partnerMargin, comparison, formatEuro: (v) => v.toFixed(2), provisionalCosts: { supplies: 1580, expenses: 0 } });
assert.equal(s.rows.find((r) => r.key === 'supplies').actualNet, 1580);
assert.equal(s.costs.actualNet, 8570.6);
assert.equal(s.grossMargin.actualNet, 7498.6);
assert.equal(s.verdict.amountNet, 2242);
console.log('test-expense-price-confirmed: OK');
