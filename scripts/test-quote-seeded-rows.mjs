/**
 * Tarjouksen tarvike-/kulurivit valmiiksi työraporttiin (0 €, kuuluu urakkaan):
 * idempotentti luonti, uudelleenkohdistus, "ilman hintaa" -laskuri, asiakastulosteet ja kate.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  countUnpricedExpenseLines,
  expenseLinePriceMissing,
  isUntouchedSeededLine,
  mergeSeededRows,
  planQuoteRowSync,
  quoteRowCandidates,
  quoteRowMatchesLine,
  seededRowInsertPayload,
  unpricedRowsLabel,
} from '../src/lib/quoteSeededRows.ts';
import { createEmptyQuoteRequestData } from '../src/lib/quoteRequest/defaults.ts';
import {
  billingQuoteFromQuoteRow,
  computePartnerNetMargin,
  parseBillingQuoteSettings,
} from '../src/lib/workReportBillingQuote.ts';
import { billingQuoteAfterUnlink, billingQuoteForLinkedQuote } from '../src/lib/quoteWorkReportLinkLogic.ts';
import { calculateWorkReportBillable, formatEuro } from '../src/lib/workReportBilling.ts';
import { mergeActualPurchaseFromWorkReportLogs } from '../src/lib/quoteRequestActualPurchaseSync.ts';
import { extractQuotePurchaseLines } from '../src/lib/quotePurchaseLines.ts';
import { compareQuoteCategories } from '../src/lib/quoteCategoryComparison.ts';
import { buildQuoteOutcomeSummary } from '../src/lib/quoteOutcomeSummary.ts';
import { buildDailyLogEntryTiles } from '../src/components/DailyLogEntryTile.tsx';

const round = (v) => Math.round(v * 100) / 100;

const quoteA = {
  ...createEmptyQuoteRequestData('huolto'),
  workItems: [{ id: 'w1', description: 'Huolto / korjaus', hours: 8, pricePerHour: 65, materials: [] }],
  installationLaborPurchaseRate: 50,
  installationVehicleAllowance: 50,
  installationVehicleHoursPerBlock: 8,
  installationSupplies: [
    { id: 'dev-1', name: 'Laite', quantity: 1, purchasePrice: 1260, marginPercent: 30, sellPrice: 1638, rowKind: 'device' },
    { id: 'sup-1', name: 'Asennustarvikkeet', quantity: 2, purchasePrice: 125, marginPercent: 30, sellPrice: 162.5, rowKind: 'supply' },
    { id: 'exp-1', name: 'Nosturi', quantity: 1, purchasePrice: 250, marginPercent: 20, sellPrice: 300, rowKind: 'expense' },
    { id: 'exp-2', name: 'Pysäköinti', quantity: 1, purchasePrice: 20, marginPercent: 0, sellPrice: 20, rowKind: 'expense' },
    { id: 'km-1', name: 'Km-korvaus', quantity: 120, purchasePrice: 0.5, marginPercent: 0, sellPrice: 0.5, rowKind: 'expense' },
  ],
};

// --- Ehdokkaat: tarvikkeet ja kulut, ei työtä, ajoja/km:iä, huoltoautoa eikä laitetta
const candidates = quoteRowCandidates(quoteA);
assert.deepEqual(
  candidates.map((row) => [row.description, row.expense_type, row.qty]),
  [
    ['Asennustarvikkeet', 'material', 2],
    ['Nosturi', 'other', 1],
    ['Pysäköinti', 'parking', 1],
  ],
);
assert.deepEqual(quoteRowCandidates(null), []);

// Tallennusmuoto: 0 €, kuuluu urakkaan
assert.deepEqual(seededRowInsertPayload(candidates[0], 'log-1', 3), {
  daily_log_id: 'log-1',
  expense_type: 'material',
  description: 'Asennustarvikkeet',
  qty: 2,
  unit_price: 0,
  customer_unit_price: null,
  bill_to_partner: false,
  bill_to_customer: false,
  sort_order: 3,
});

const seededLine = (row, id, overrides = {}) => ({
  id,
  ...seededRowInsertPayload(row, 'log-1', 0),
  ...overrides,
});
const workLog = (lines, id = 'log-1', date = '2026-09-22') => ({
  id,
  log_date: date,
  created_at: `${date}T08:00:00Z`,
  entry_type: 'regular',
  hours_regular: 8,
  created_by: 'u1',
  work_done: 'Asennus',
  expense_lines: lines,
});

// --- 1) Ei kirjauksia: rivit odottavat ensimmäistä kirjausta
let plan = planQuoteRowSync({ quoteId: 'qA', quoteData: quoteA, seeded: null, logs: [] });
assert.equal(plan.targetLogId, null);
assert.equal(plan.insertRows.length, 0);
assert.equal(plan.pendingRows.length, 3);
assert.deepEqual(plan.nextSeeded, { quote_request_id: 'qA', lines: [] });

// --- 2) Kirjauksia on: rivit viimeisimpään kirjaukseen
const logs2 = [workLog([], 'log-old', '2026-09-20'), workLog([], 'log-new', '2026-09-22')];
plan = planQuoteRowSync({ quoteId: 'qA', quoteData: quoteA, seeded: null, logs: logs2 });
assert.equal(plan.targetLogId, 'log-new');
assert.equal(plan.insertRows.length, 3);
assert.equal(plan.nextSeeded.lines.length, 3);
assert.equal(plan.changed, true);

// Idempotentti: toinen ajo (rivit luotu + kirjanpito tallennettu) ei tee mitään
const afterSeed = [
  workLog([], 'log-old', '2026-09-20'),
  workLog(plan.insertRows.map((row, i) => seededLine(row, `x${i}`)), 'log-new', '2026-09-22'),
];
let again = planQuoteRowSync({ quoteId: 'qA', quoteData: quoteA, seeded: plan.nextSeeded, logs: afterSeed });
assert.equal(again.changed, false);
assert.equal(again.insertRows.length, 0);
assert.equal(again.deleteLineIds.length, 0);
// Kirjanpidon tallennus epäonnistui: rivit tunnistetaan nimestä, ei tuplata
again = planQuoteRowSync({ quoteId: 'qA', quoteData: quoteA, seeded: null, logs: afterSeed });
assert.equal(again.insertRows.length, 0);
assert.equal(again.nextSeeded.lines.length, 3);
// Käyttäjä poisti rivin → ei luoda uudelleen
const afterDelete = [workLog(afterSeed[1].expense_lines.slice(1), 'log-new')];
again = planQuoteRowSync({ quoteId: 'qA', quoteData: quoteA, seeded: plan.nextSeeded, logs: afterDelete });
assert.equal(again.insertRows.length, 0);
assert.equal(again.changed, false);

// --- 3) Vanha kohdistettu raportti (backfill): jo kirjatut rivit täsmätään tyypin + nimen perusteella
const legacyLogs = [
  workLog([
    { id: 'm1', expense_type: 'material', description: 'Tarvikkeet (asennustarvikkeet)', qty: 1, unit_price: 245, bill_to_partner: false, bill_to_customer: false },
    { id: 'n1', expense_type: 'other', description: 'nosturi', qty: 1, unit_price: 230, bill_to_partner: false, bill_to_customer: false },
  ]),
];
plan = planQuoteRowSync({ quoteId: 'qA', quoteData: quoteA, seeded: null, logs: legacyLogs });
assert.deepEqual(plan.insertRows.map((row) => row.description), ['Pysäköinti']);
assert.equal(plan.nextSeeded.lines.length, 3);
// Tyyppi ratkaisee: "Nosturi" tarvikkeena ei täsmää kuluriviin
assert.equal(quoteRowMatchesLine({ description: 'Nosturi', expense_type: 'other' }, { expense_type: 'material', description: 'Nosturi', qty: 1, unit_price: 1 }), false);
assert.equal(quoteRowMatchesLine({ description: 'Putki', expense_type: 'material' }, { expense_type: 'part', description: 'putki 5m', qty: 1, unit_price: 1 }), true);

// --- 4) Uudelleenkohdistus toiseen tarjoukseen
const quoteB = {
  ...quoteA,
  installationSupplies: [
    { id: 'sup-b', name: 'Kupariputki', quantity: 5, purchasePrice: 12, marginPercent: 30, sellPrice: 15.6, rowKind: 'supply' },
    { id: 'exp-2b', name: 'Pysäköinti', quantity: 1, purchasePrice: 20, marginPercent: 0, sellPrice: 20, rowKind: 'expense' },
  ],
};
const seededA = { quote_request_id: 'qA', lines: candidates };
const relinkLogs = [
  workLog([
    seededLine(candidates[0], 'a-sup', { unit_price: 180 }), // käyttäjä hinnoitteli → säilyy
    seededLine(candidates[1], 'a-nost'), // koskematon 0 € → poistetaan
    seededLine(candidates[2], 'a-park'), // koskematon, sama rivi uudessa tarjouksessa → säilyy
    { id: 'own', expense_type: 'material', description: 'Oma rivi', qty: 1, unit_price: 0, bill_to_partner: false, bill_to_customer: false },
  ]),
];
plan = planQuoteRowSync({ quoteId: 'qB', quoteData: quoteB, seeded: seededA, logs: relinkLogs });
assert.deepEqual(plan.deleteLineIds, ['a-nost']);
assert.deepEqual(plan.insertRows.map((row) => row.description), ['Kupariputki']);
assert.equal(plan.nextSeeded.quote_request_id, 'qB');
assert.deepEqual(plan.nextSeeded.lines.map((row) => row.description).sort(), ['Kupariputki', 'Pysäköinti']);
// Muokattu (nimi, määrä tai laskutustapa) ei ole koskematon
assert.equal(isUntouchedSeededLine(seededLine(candidates[1], 'e', { qty: 2 }), candidates[1]), false);
assert.equal(isUntouchedSeededLine(seededLine(candidates[1], 'e', { description: 'Nosturi 2h' }), candidates[1]), false);
assert.equal(isUntouchedSeededLine(seededLine(candidates[1], 'e', { bill_to_customer: true }), candidates[1]), false);
assert.equal(isUntouchedSeededLine(seededLine(candidates[1], 'e', { customer_unit_price: 50 }), candidates[1]), false);
assert.equal(isUntouchedSeededLine(seededLine(candidates[1], 'e'), candidates[1]), true);
// Takaisin samaan tarjoukseen (qB → qB) ei poista mitään
again = planQuoteRowSync({ quoteId: 'qB', quoteData: quoteB, seeded: plan.nextSeeded, logs: relinkLogs });
assert.deepEqual(again.deleteLineIds, []);

// Kirjanpito kulkee kohdistuksessa (billingQuoteForLinkedQuote) ja säilyy irrotuksessa
const prevSettings = parseBillingQuoteSettings({ quote_request_id: 'qA', quote_sale_net: 100, quote_seeded_rows: seededA });
assert.deepEqual(prevSettings.quote_seeded_rows, seededA);
const linkedB = billingQuoteForLinkedQuote({
  quote: { id: 'qB', title: 'B', data: quoteB },
  previous: prevSettings,
  customerAlreadyBilled: false,
});
assert.equal(linkedB.quote_request_id, 'qB');
assert.deepEqual(linkedB.quote_seeded_rows, seededA, 'vanhan tarjouksen kirjanpito siivousta varten');
const linkedSame = billingQuoteForLinkedQuote({ quote: { id: 'qA', title: 'A', data: quoteA }, previous: prevSettings, customerAlreadyBilled: false });
assert.deepEqual(linkedSame.quote_seeded_rows, seededA);
assert.deepEqual(billingQuoteAfterUnlink(prevSettings, 'qA'), { quote_seeded_rows: seededA });
assert.deepEqual(billingQuoteAfterUnlink({ quote_request_id: 'q-old', quote_sale_net: 1 }, 'q-old'), {});
assert.equal(billingQuoteFromQuoteRow('qA', 'A', quoteA).quote_seeded_rows, undefined);
// Ensimmäinen kirjaus tallennettu esitäytetyillä riveillä → merkitään luoduiksi
const merged = mergeSeededRows({ quote_request_id: 'qA' }, 'qA', candidates.slice(0, 2));
assert.equal(merged.quote_seeded_rows.lines.length, 2);
assert.equal(mergeSeededRows(merged, 'qA', candidates).quote_seeded_rows.lines.length, 3);

// --- 5) Ilman hintaa
assert.equal(expenseLinePriceMissing(seededLine(candidates[0], 'p')), true);
assert.equal(expenseLinePriceMissing(seededLine(candidates[0], 'p', { unit_price: 10 })), false);
assert.equal(expenseLinePriceMissing(seededLine(candidates[0], 'p', { customer_unit_price: 10 })), false);
assert.equal(expenseLinePriceMissing({ expense_type: 'km', description: 'Ajomatkat', qty: 10, unit_price: 0 }), false);
assert.equal(expenseLinePriceMissing({ expense_type: 'device', description: 'Laite', qty: 1, unit_price: 0 }), false);
const countLogs = [workLog([seededLine(candidates[0], 'a'), seededLine(candidates[1], 'b'), seededLine(candidates[2], 'c', { unit_price: 20 })])];
assert.equal(countUnpricedExpenseLines(countLogs), 2);
assert.equal(unpricedRowsLabel(2), '2 riviä ilman hintaa');
assert.equal(unpricedRowsLabel(1), '1 rivi ilman hintaa');
// Ruudut: TARVIKKEET / KULUT "hinta puuttuu"
const tiles = buildDailyLogEntryTiles(countLogs[0], {
  formatDate: (d) => d,
  logExpensesTotal: () => 20,
  showMoney: true,
  formatEuro,
});
assert.equal(tiles.find((t) => t.kind === 'materials').marker, 'hinta puuttuu');
assert.equal(tiles.find((t) => t.kind === 'expenses').marker, 'hinta puuttuu');
const pricedTiles = buildDailyLogEntryTiles(workLog([seededLine(candidates[0], 'a', { unit_price: 5 })]), {
  formatDate: (d) => d,
  logExpensesTotal: () => 10,
  showMoney: true,
  formatEuro,
});
assert.equal(pricedTiles.find((t) => t.kind === 'materials').marker, undefined);

// --- 6) Kate: 0 € ei muuta mitään; hinnoiteltuna sama kuin itse kirjattuna, kukin kerran
const SALE = 3982.4;
const users = [{ id: 'u1', display_name: 'A', bill_hours_enabled: true, bill_expenses_enabled: true }];
const rates = { hourly_regular: 50, hourly_overtime: 75, hourly_on_call: 100 };
const baseSettings = {
  quote_request_id: 'qA',
  quote_sale_net: SALE,
  customer_invoice_total: SALE,
  customer_mode: 'quote_fixed',
  partner_commission_percent: 50,
  purchase_lines: extractQuotePurchaseLines(quoteA),
};
function outcome(expenseLines) {
  const logs = [{ ...workLog(expenseLines), trip_legs: [{ distance_km: 68.3 }] }];
  const calc = calculateWorkReportBillable({
    logs,
    users,
    rates,
    ratesSource: 'partnership',
    tripKmRate: 0.59,
    billToCompanyId: 'owner',
    billToCompanyName: 'Owner Oy',
  });
  const settings = mergeActualPurchaseFromWorkReportLogs(baseSettings, logs, quoteA);
  const margin = computePartnerNetMargin(settings, calc.grandTotal, { logs, partnerRates: rates, partnerCalculation: calc });
  const cmp = compareQuoteCategories({ quoteData: quoteA, partnerCalculation: calc, logs, partnerRates: rates, tripKmRate: 0.59, billingSettings: settings });
  const summary = buildQuoteOutcomeSummary({ partnerMargin: margin, comparison: cmp, formatEuro });
  return { calc, margin, cmp, summary };
}
const none = outcome([]);
const unpriced = outcome(candidates.map((row, i) => seededLine(row, `u${i}`)));
assert.equal(unpriced.calc.grandTotal, none.calc.grandTotal, '0 € rivit eivät muuta kumppanilaskua');
assert.equal(unpriced.margin.commissionNet, none.margin.commissionNet, 'eivätkä provisiota');
assert.equal(unpriced.margin.grossMarginNet, none.margin.grossMarginNet);

const priced = outcome([
  seededLine(candidates[0], 'p0', { unit_price: 122.5 }), // 2 × 122,50 = 245
  seededLine(candidates[1], 'p1', { unit_price: 230 }),
  seededLine(candidates[2], 'p2', { unit_price: 15 }),
]);
const manual = outcome([
  { id: 'm0', expense_type: 'material', description: 'Tarvikkeet', qty: 1, unit_price: 245, bill_to_partner: false, bill_to_customer: false },
  { id: 'm1', expense_type: 'other', description: 'Nosturi', qty: 1, unit_price: 230, bill_to_partner: false, bill_to_customer: false },
  { id: 'm2', expense_type: 'parking', description: 'P', qty: 1, unit_price: 15, bill_to_partner: false, bill_to_customer: false },
]);
assert.equal(priced.margin.grossMarginNet, manual.margin.grossMarginNet, 'sama kate kuin itse kirjattuna');
assert.equal(priced.calc.grandTotal, manual.calc.grandTotal);
const byKey = (o) => Object.fromEntries(o.cmp.rows.map((r) => [r.key, r.actualNet]));
assert.equal(byKey(priced).supplies, 245);
assert.equal(byKey(priced).expenses, round(40.3 + 230 + 15));
assert.equal(byKey(priced).labor, 400);
assert.equal(byKey(priced).device, 1260);
// kate = tarjoushinta − työt − kulut − laite − tarvikkeet (kukin kerran)
const deductions = round(priced.margin.deductionRows.reduce((sum, row) => sum + row.amount, 0));
assert.equal(deductions, round(400 + 245 + 40.3 + 230 + 15 + 1260));
assert.equal(priced.margin.grossMarginNet, round(SALE - deductions));

// --- 7) Asiakastuloste ei näytä rivejä ilman hintaa; tarjouksen lista poistettu
const printSrc = readFileSync(new URL('../src/lib/workReportPrintHtml.ts', import.meta.url), 'utf8');
assert.match(printSrc, /printMode === 'customer' && linkedQuoteRequest && expenseLinePriceMissing\(line\)/);
const panel = readFileSync(new URL('../src/components/WorkReportBillingQuotePanel.tsx', import.meta.url), 'utf8');
assert.ok(!panel.includes('Tarjouspyynnön rivit'));
assert.ok(!panel.includes('onRecordQuoteLine'));
assert.ok(panel.includes('unpricedRowCount'));

console.log('quote seeded rows OK');
