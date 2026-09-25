/**
 * Työraportin kirjaukset tarjouspyynnön kategorioissa (Työt / Tarvikkeet / Kulut / Laite):
 * - kulurivin tyyppi ratkaisee Tarvikkeet vs Kulut (vanhat tyypittömät rivit: laskutustapa)
 * - tarjouspyynnön rivit ryhmiteltynä samoin kuin vertailu ("Kirjaa toteutunut")
 * - laitteen toteutunut esitäytetty tarjouspyynnöstä, "Oikaise" säilyy päivityksessä ja uudelleenkohdistuksessa
 * - kate ei laske laitetta kahdesti
 */
import assert from 'node:assert/strict';
import { calculateWorkReportBillable } from '../src/lib/workReportBilling.ts';
import {
  applyDeviceActualCorrections,
  computePartnerNetMargin,
} from '../src/lib/workReportBillingQuote.ts';
import { mergeActualPurchaseFromWorkReportLogs } from '../src/lib/quoteRequestActualPurchaseSync.ts';
import { extractQuotePurchaseLines } from '../src/lib/quotePurchaseLines.ts';
import { compareQuoteCategories } from '../src/lib/quoteCategoryComparison.ts';
import { createEmptyQuoteRequestData } from '../src/lib/quoteRequest/defaults.ts';
import {
  categoryReclassification,
  classifyExpenseLineCategory,
  expenseTypeCategory,
} from '../src/lib/workReportEntryCategories.ts';
import {
  expenseTypeForQuoteExpense,
  quoteLinesByCategory,
  showQuoteLineAmounts,
} from '../src/lib/quoteLineEntries.ts';
import { billingQuoteForLinkedQuote } from '../src/lib/quoteWorkReportLinkLogic.ts';
import { buildQuoteOutcomeSummary } from '../src/lib/quoteOutcomeSummary.ts';
import { formatEuro } from '../src/lib/workReportBilling.ts';
import { expenseDraftCategoryOrNull } from '../src/lib/workReportEntryCategories.ts';
import {
  collectDeviceEntries,
  deviceEntriesReplaceQuoteDevice,
  deviceEntryCostSplit,
  deviceTileSubtitle,
  latestDailyLog,
  quoteDeviceSuggestions,
} from '../src/lib/workReportDeviceEntries.ts';

const round = (v) => Math.round(v * 100) / 100;

// --- Tyyppi → kategoria
assert.equal(expenseTypeCategory('material'), 'supplies');
assert.equal(expenseTypeCategory('part'), 'supplies');
assert.equal(expenseTypeCategory('parking'), 'expenses');
assert.equal(expenseTypeCategory('km'), 'expenses');
assert.equal(expenseTypeCategory('other'), 'expenses');
assert.equal(expenseTypeCategory(''), null);
assert.equal(expenseTypeCategory('supplies'), null, 'tuntematon tyyppi → vanha sääntö');
// Tyyppi voittaa laskutustavan
assert.equal(classifyExpenseLineCategory({ expense_type: 'other', bill_to_partner: false, bill_to_customer: false }), 'expenses');
assert.equal(classifyExpenseLineCategory({ expense_type: 'material', bill_to_partner: true, bill_to_customer: true }), 'supplies');
// Vanha tyypitön rivi: laskutustapa ratkaisee kuten ennen
assert.equal(classifyExpenseLineCategory({ expense_type: '', qty: 1, unit_price: 10, bill_to_partner: false, bill_to_customer: false }), 'supplies');
assert.equal(classifyExpenseLineCategory({ expense_type: '', qty: 1, unit_price: 10, bill_to_partner: true, bill_to_customer: true }), 'expenses');

// --- Messukeskus-tarjous
const quoteData = {
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

// --- Tarjouspyynnön rivit samoissa kategorioissa kuin vertailu
const groups = quoteLinesByCategory(quoteData);
assert.deepEqual(groups.map((g) => g.category), ['labor', 'supplies', 'expenses', 'device']);
const g = Object.fromEntries(groups.map((group) => [group.category, group]));
assert.deepEqual(g.labor.lines.map((l) => [l.label, l.qty, l.unit, l.action]), [['Huolto / korjaus', 8, 'h', 'labor']]);
assert.deepEqual(g.supplies.lines.map((l) => [l.label, l.quoteNet, l.action, l.expenseType]), [['Tarvikkeet', 250, 'expense', 'material']]);
assert.deepEqual(g.expenses.lines.map((l) => [l.label, l.quoteNet, l.action]), [['Nosturi', 250, 'expense'], ['Huoltoautokorvaus', 50, 'trip']]);
assert.equal(g.expenses.lines[0].expenseType, 'other');
assert.deepEqual(g.device.lines.map((l) => [l.label, l.quoteNet, l.action, l.purchaseLineId]), [['Laite', 1260, 'device', 'device:dev-1']]);
assert.ok(!groups.some((group) => group.lines.some((l) => l.id === 'group:installation-internal')), 'sisäinen työ ei ole tarvike');
// Summa riveittäin vain kun kategoriassa on useampi summallinen rivi (muuten luku on jo taulukossa)
assert.equal(showQuoteLineAmounts(g.supplies), false);
assert.equal(showQuoteLineAmounts(g.expenses), true);
assert.equal(showQuoteLineAmounts(g.device), false);
assert.equal(expenseTypeForQuoteExpense('Pysäköinti'), 'parking');
assert.equal(expenseTypeForQuoteExpense('Nosturi'), 'other');
assert.deepEqual(quoteLinesByCategory(null), []);
// Km-korvaus-kulurivi → kirjataan ajona, ei erillistä Ajokilometrit-riviä
const kmGroups = quoteLinesByCategory({
  ...quoteData,
  installationSupplies: [
    { id: 'km-1', name: 'Km-korvaus', quantity: 120, purchasePrice: 0.5, marginPercent: 0, sellPrice: 0.5, rowKind: 'expense' },
  ],
});
const kmLines = kmGroups.find((group) => group.category === 'expenses').lines;
assert.equal(kmLines.filter((l) => l.unit === 'km').length, 1);
assert.equal(kmLines[0].action, 'trip');

// Rivien summat = vertailun tarjouspyyntö-sarake
const quoteLines = extractQuotePurchaseLines(quoteData);
const logs = [
  {
    id: 'log-1',
    log_date: '2026-09-20',
    entry_type: 'regular',
    hours_regular: 8,
    created_by: 'u1',
    trip_legs: [{ distance_km: 68.3 }],
    expense_lines: [
      // Tarvike ostettu itse (ei kumppanin laskulla) → Tarvikkeet
      { id: 'e1', expense_type: 'material', description: 'Asennustarvikkeet', qty: 1, unit_price: 245, bill_to_partner: false, bill_to_customer: false },
      // Nosturi (kulu), ostettu itse → nyt Kulut (ennen laskutustavan takia Tarvikkeet)
      { id: 'e2', expense_type: 'other', description: 'Nosturi', qty: 1, unit_price: 230, bill_to_partner: false, bill_to_customer: false },
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
const baseSettings = {
  quote_request_id: 'q-1',
  quote_title: 'Messukeskus',
  quote_sale_net: 3982.4,
  customer_invoice_total: 3982.4,
  customer_mode: 'quote_fixed',
  partner_commission_percent: 50,
  purchase_lines: quoteLines,
};
const settings = mergeActualPurchaseFromWorkReportLogs(baseSettings, logs, quoteData);
const shift = categoryReclassification(logs, partnerCalculation);
assert.equal(shift.suppliesToExpenses, 230);
assert.equal(shift.expensesToSupplies, 0);

const comparison = compareQuoteCategories({
  quoteData,
  partnerCalculation,
  logs,
  partnerRates: rates,
  tripKmRate: 0.59,
  billingSettings: settings,
});
const byKey = Object.fromEntries(comparison.rows.map((row) => [row.key, row]));
assert.equal(byKey.supplies.quoteNet, round(g.supplies.lines.reduce((s, l) => s + (l.quoteNet ?? 0), 0)));
assert.equal(byKey.expenses.quoteNet, round(g.expenses.lines.reduce((s, l) => s + (l.quoteNet ?? 0), 0)));
assert.equal(byKey.device.quoteNet, round(g.device.lines.reduce((s, l) => s + (l.quoteNet ?? 0), 0)));
assert.equal(byKey.supplies.actualNet, 245, 'vain tarvike');
assert.equal(byKey.expenses.actualNet, 270.3, 'ajot 40,30 + nosturi 230');
assert.equal(byKey.device.actualNet, 1260, 'laite esitäytetty tarjouspyynnöstä');
const actualTotal = comparison.actualTotalNet;
assert.equal(actualTotal, round(400 + 245 + 270.3 + 1260), 'siirto ei muuta yhteissummaa');

const marginBefore = computePartnerNetMargin(settings, partnerCalculation.grandTotal, {
  logs,
  partnerRates: rates,
  partnerCalculation,
});

// --- Laitteen oikaisu
const deviceLine = settings.purchase_lines.find((l) => l.source === 'device');
assert.equal(deviceLine.actual_purchase_net, 1260);
assert.ok(!deviceLine.actual_corrected);
const corrected = applyDeviceActualCorrections(settings, [{ line: deviceLine, actualNet: 480 }]);
const correctedLine = corrected.purchase_lines.find((l) => l.id === deviceLine.id);
assert.equal(correctedLine.actual_purchase_net, 480);
assert.equal(correctedLine.actual_corrected, true);
assert.equal(correctedLine.quote_purchase_net, 1260, 'tarjouspyynnön arvio ei muutu');
assert.equal(corrected.actual_purchase_net, round(settings.actual_purchase_net - 1260 + 480));

// Oikaisu (< 50 % tarjouksesta) säilyy päivityksessä — vanha suojaus ei palauta sitä
const refreshed = mergeActualPurchaseFromWorkReportLogs(corrected, logs, quoteData);
const refreshedLine = refreshed.purchase_lines.find((l) => l.id === deviceLine.id);
assert.equal(refreshedLine.actual_purchase_net, 480);
assert.equal(refreshedLine.actual_corrected, true);
// Ilman oikaisulippua sama arvo palautuisi tarjouksen hintaan (vanhan virheen suojaus)
const { actual_corrected: _flag, ...unflagged } = correctedLine;
const guard = mergeActualPurchaseFromWorkReportLogs(
  { ...corrected, purchase_lines: corrected.purchase_lines.map((l) => (l.id === deviceLine.id ? unflagged : l)) },
  logs,
  quoteData,
);
assert.equal(guard.purchase_lines.find((l) => l.id === deviceLine.id).actual_purchase_net, 1260);

// Uudelleenkohdistus samaan tarjoukseen säilyttää oikaisun
const relinked = billingQuoteForLinkedQuote({
  quote: { id: 'q-1', title: 'Messukeskus', data: quoteData },
  previous: refreshed,
  customerAlreadyBilled: false,
});
const relinkedMerged = mergeActualPurchaseFromWorkReportLogs(relinked, logs, quoteData);
assert.equal(relinkedMerged.purchase_lines.find((l) => l.id === deviceLine.id).actual_purchase_net, 480);
// Eri tarjous → ei peritä oikaisua
const otherQuote = billingQuoteForLinkedQuote({
  quote: { id: 'q-2', title: 'Toinen', data: quoteData },
  previous: refreshed,
  customerAlreadyBilled: false,
});
assert.equal(otherQuote.purchase_lines.find((l) => l.id === deviceLine.id).actual_purchase_net, 1260);

// Vertailu ja kate käyttävät oikaistua hintaa, laite lasketaan kerran
const comparisonCorrected = compareQuoteCategories({
  quoteData,
  partnerCalculation,
  logs,
  partnerRates: rates,
  tripKmRate: 0.59,
  billingSettings: refreshed,
});
assert.equal(comparisonCorrected.rows.find((r) => r.key === 'device').actualNet, 480);
assert.equal(comparisonCorrected.actualTotalNet, round(actualTotal - 780));
const marginAfter = computePartnerNetMargin(refreshed, partnerCalculation.grandTotal, {
  logs,
  partnerRates: rates,
  partnerCalculation,
});
assert.equal(round(marginAfter.grossMarginNet - marginBefore.grossMarginNet), 780, 'kate kasvaa täsmälleen oikaisun verran');

// Palauta tarjouspyynnön hinta → lippu pois, 1260
const reset = applyDeviceActualCorrections(refreshed, [{ line: refreshedLine, actualNet: null }]);
const resetLine = reset.purchase_lines.find((l) => l.id === deviceLine.id);
assert.equal(resetLine.actual_purchase_net, 1260);
assert.equal(resetLine.actual_corrected, undefined);
// Muut kuin laiterivit eivät muutu
const supplyLine = refreshed.purchase_lines.find((l) => l.source !== 'device');
const ignored = applyDeviceActualCorrections(refreshed, [{ line: supplyLine, actualNet: 1 }]);
assert.deepEqual(ignored.purchase_lines, refreshed.purchase_lines);


// =====================================================================
// Laite: vähennetään katteesta täsmälleen kerran kaikissa poluissa
// =====================================================================
assert.equal(expenseTypeCategory('device'), 'device');
assert.equal(classifyExpenseLineCategory({ expense_type: 'device', qty: 1, unit_price: 10, bill_to_partner: false, bill_to_customer: false }), 'device');
// Lomake: ei tyyppiä → ei arvata (neutraali "Valitse tyyppi"), vaikka laskutustapa olisi kumppanilta
assert.equal(expenseDraftCategoryOrNull({ expense_type: '', bill_to_partner: true, bill_to_customer: true }), null);
assert.equal(expenseDraftCategoryOrNull({ expense_type: '', bill_to_partner: false, bill_to_customer: false }), null);
assert.equal(expenseDraftCategoryOrNull({ expense_type: 'device' }), 'device');
assert.equal(expenseDraftCategoryOrNull({ expense_type: 'other' }), 'expenses');
assert.equal(expenseDraftCategoryOrNull({ expense_type: 'material' }), 'supplies');
assert.equal(expenseDraftCategoryOrNull({ expense_type: 'km', description: 'Ajomatkat (10 km)' }), 'expenses');

const SALE = 3982.4;
const baseLog = {
  id: 'log-d',
  log_date: '2026-09-21',
  entry_type: 'regular',
  hours_regular: 8,
  created_by: 'u1',
  trip_legs: [{ distance_km: 68.3 }],
};
const diarySupply = { id: 's1', expense_type: 'material', description: 'Asennustarvikkeet', qty: 1, unit_price: 245, bill_to_partner: false, bill_to_customer: false };
const NON_DEVICE_COSTS = round(400 + 40.3 + 245); // työ + ajot (68,3 km × 0,59) + tarvike

function scenario(name, { expenseLines, settingsOverride = null, extrasApproved = false }) {
  const scenarioLogs = [{ ...baseLog, expense_lines: expenseLines }];
  const calc = calculateWorkReportBillable({
    logs: scenarioLogs,
    users,
    rates,
    ratesSource: 'partnership',
    tripKmRate: 0.59,
    billToCompanyId: 'owner',
    billToCompanyName: 'Owner Oy',
  });
  const merged = mergeActualPurchaseFromWorkReportLogs(settingsOverride ?? baseSettings, scenarioLogs, quoteData);
  const margin = computePartnerNetMargin(merged, calc.grandTotal, {
    logs: scenarioLogs,
    partnerRates: rates,
    partnerCalculation: calc,
  });
  const cmp = compareQuoteCategories({
    quoteData,
    partnerCalculation: calc,
    logs: scenarioLogs,
    partnerRates: rates,
    tripKmRate: 0.59,
    billingSettings: merged,
  });
  const deductions = round(margin.deductionRows.reduce((sum, row) => sum + row.amount, 0));
  const deviceDeduction = margin.deductionRows.find((row) => row.key === 'device')?.amount ?? 0;
  const deviceCmp = cmp.rows.find((row) => row.key === 'device')?.actualNet ?? 0;
  // Laite näkyy samana katteessa ja vertailussa
  assert.equal(deviceDeduction, deviceCmp, `${name}: laite kate = vertailu`);
  // Vertailun toteutunut = katteen vähennykset (ei "Muut kate-erät" -riviä)
  // (Hyväksytyn lisätilauksen hankinta näkyy kuten ennenkin "Muut kate-erät" -rivillä.)
  const extrasCost = margin.deductionRows.find((row) => row.key === 'piikki_material')?.amount ?? 0;
  assert.equal(round(cmp.actualTotalNet + extrasCost), deductions, `${name}: vertailu summautuu katteeseen`);
  const summary = buildQuoteOutcomeSummary({ partnerMargin: margin, comparison: cmp, formatEuro });
  assert.equal(summary.rows.some((row) => row.key === 'other'), extrasApproved, `${name}: Muut kate-erät`);
  // Kate ennen provisiota = tarjoushinta (+ hyväksytyt lisät) − kaikki kulut kerran
  assert.equal(margin.grossMarginNet, round(SALE + margin.customerExtrasNet - deductions), `${name}: kate`);
  return { calc, merged, margin, cmp, deviceDeduction, logs: scenarioLogs };
}

// A) Tarjouspyynnöstä esitäytetty laite (1260)
const A = scenario('A esitäytetty', { expenseLines: [diarySupply] });
assert.equal(A.deviceDeduction, 1260);
assert.equal(A.margin.grossMarginNet, round(SALE - NON_DEVICE_COSTS - 1260)); // 2037,10
assert.equal(A.margin.grossMarginNet, 2037.1);

// B) Oikaistu laite (1100)
const deviceA = A.merged.purchase_lines.find((l) => l.source === 'device');
const correctedSettings = applyDeviceActualCorrections(A.merged, [{ line: deviceA, actualNet: 1100 }]);
const B = scenario('B oikaistu', { expenseLines: [diarySupply], settingsOverride: correctedSettings });
assert.equal(B.deviceDeduction, 1100);
assert.equal(B.margin.grossMarginNet, round(SALE - NON_DEVICE_COSTS - 1100)); // 2197,10

// C) Laite kirjattu työkirjaukseen (tyyppi Laite, oma hankinta 1180) → korvaa tarjouspyynnön hinnan
const ownDevice = { id: 'd1', expense_type: 'device', description: 'Mitsubishi MSZ-LN35', qty: 1, unit_price: 1180, bill_to_partner: false, bill_to_customer: false };
assert.equal(deviceEntriesReplaceQuoteDevice([{ ...baseLog, expense_lines: [ownDevice] }]), true);
const C = scenario('C kirjattu laite', { expenseLines: [diarySupply, ownDevice] });
assert.equal(C.deviceDeduction, 1180, 'vain kirjattu laite, ei tarjouspyynnön 1260');
assert.equal(C.margin.grossMarginNet, round(SALE - NON_DEVICE_COSTS - 1180)); // 2117,10
assert.equal(C.cmp.rows.find((r) => r.key === 'supplies').actualNet, 245, 'laite ei tarvikkeissa');
assert.equal(C.cmp.rows.find((r) => r.key === 'device').quoteNet, 1260, 'tarjouspyynnön arvio säilyy');
const cDeviceLine = C.merged.purchase_lines.find((l) => l.source === 'device');
assert.equal(cDeviceLine.actual_purchase_net, 0);
assert.equal(cDeviceLine.actual_from_entries, true);

// C2) Kirjattu laite + aiempi oikaisu → kirjaus voittaa, oikaisua ei lasketa lisäksi
const C2 = scenario('C2 kirjaus + oikaisu', { expenseLines: [diarySupply, ownDevice], settingsOverride: correctedSettings });
assert.equal(C2.deviceDeduction, 1180);
assert.equal(C2.margin.grossMarginNet, round(SALE - NON_DEVICE_COSTS - 1180));
// Oikaisu säilyy talteen: kun kirjaus poistetaan, oikaistu 1100 palaa (ei 0, ei 1260)
const c2Line = C2.merged.purchase_lines.find((l) => l.source === 'device');
assert.equal(c2Line.actual_corrected, true);
assert.equal(c2Line.corrected_actual_net, 1100);
const C2back = scenario('C2 kirjaus poistettu', { expenseLines: [diarySupply], settingsOverride: C2.merged });
assert.equal(C2back.deviceDeduction, 1100);
// Ilman oikaisua kirjauksen poisto palauttaa tarjouspyynnön hinnan
const Cback = scenario('C kirjaus poistettu', { expenseLines: [diarySupply], settingsOverride: C.merged });
assert.equal(Cback.deviceDeduction, 1260);
assert.equal(Cback.margin.grossMarginNet, 2037.1);

// D) Kumppanin laskuttama laite (tyyppi Laite, laskutetaan kumppanilta)
const partnerDevice = { id: 'd2', expense_type: 'device', description: 'Laite kumppanilta', qty: 1, unit_price: 1000, bill_to_partner: true, bill_to_customer: true, partner_expense_margin_percent: 0 };
const D = scenario('D kumppanin laite', { expenseLines: [diarySupply, partnerDevice] });
const split = deviceEntryCostSplit(D.logs, D.calc);
assert.ok(split.partnerNet > 0);
assert.equal(split.diaryNet, 0);
assert.equal(D.deviceDeduction, split.partnerNet, 'vain kumppanin lasku, ei tarjouspyynnön 1260');
assert.equal(D.margin.grossMarginNet, round(SALE - NON_DEVICE_COSTS - split.partnerNet));
assert.equal(D.margin.deductionRows.find((r) => r.key === 'labor_expenses').amount, 440.3, 'laite ei töissä ja kuluissa');
assert.equal(D.cmp.rows.find((r) => r.key === 'expenses').actualNet, 40.3, 'laite ei Kulut-rivillä');
// Kumppanin laskelma (kumppanille maksettava) sisältää laitteen kerran
const Dplain = calculateWorkReportBillable({
  logs: [{ ...baseLog, expense_lines: [diarySupply] }], users, rates, ratesSource: 'partnership', tripKmRate: 0.59, billToCompanyId: 'owner', billToCompanyName: 'Owner Oy',
});
assert.equal(round(D.calc.grandTotal - Dplain.grandTotal), split.partnerNet);

// E) Hyväksytty lisälaskutus (lisälaite) ei korvaa tarjouspyynnön laitetta
const extraDevice = { id: 'd3', expense_type: 'device', description: 'Lisälaite', qty: 1, unit_price: 300, customer_unit_price: 450, bill_to_partner: false, bill_to_customer: true, extra_billable: true, extra_billing_allowed: true };
assert.equal(deviceEntriesReplaceQuoteDevice([{ ...baseLog, expense_lines: [extraDevice] }]), false);
const E = scenario('E lisälaite', { expenseLines: [diarySupply, extraDevice], extrasApproved: true });
assert.equal(E.deviceDeduction, 1260, 'tarjouspyynnön laite säilyy; lisälaite lisälaskutuksena');
assert.equal(E.margin.deductionRows.find((r) => r.key === 'piikki_material').amount, 300, 'lisälaitteen hankinta kerran');
assert.ok(E.margin.customerExtrasNet > 0, 'lisälaite laskutetaan asiakkaalta');
assert.equal(
  E.margin.grossMarginNet,
  round(SALE + E.margin.customerExtrasNet - NON_DEVICE_COSTS - 1260 - 300),
  'kate = tarjous + lisät − kulut − laite − lisälaitteen hankinta',
);

// F) Ei tarjousta: myyty laite (oma hankinta, laskutetaan asiakkaalta) kirjautuu kerran
const soldDevice = { id: 'd4', expense_type: 'device', description: 'Ilmalämpöpumppu', qty: 1, unit_price: 800, customer_unit_price: 1200, bill_to_partner: false, bill_to_customer: true };
const noQuoteLogs = [{ ...baseLog, expense_lines: [soldDevice] }];
const noQuote = mergeActualPurchaseFromWorkReportLogs({}, noQuoteLogs, null);
assert.equal(noQuote.purchase_lines.filter((l) => l.source === 'device').length, 0);
assert.equal(noQuote.actual_purchase_net, 800, 'hankinta kerran');
assert.equal(computePartnerNetMargin(noQuote, 0, { logs: noQuoteLogs }), null, 'ilman tarjousta ei katevertailua');
const entriesF = collectDeviceEntries(noQuoteLogs);
assert.equal(entriesF.length, 1);
assert.equal(entriesF[0].purchaseNet, 800);
assert.equal(entriesF[0].customerNet, 1200);
// Kumppanin laskelmaan ei tule (ei laskuteta kumppanilta)
const noQuoteCalc = calculateWorkReportBillable({
  logs: noQuoteLogs, users, rates, ratesSource: 'partnership', tripKmRate: 0.59, billToCompanyId: 'owner', billToCompanyName: 'Owner Oy',
});
assert.equal(deviceEntryCostSplit(noQuoteLogs, noQuoteCalc).partnerNet, 0);

// G) Tallennetut (yhdistämättömät) asetukset, esim. kumppanilaskun tuloste: laite silti kerran
for (const [label, line] of [
  ['oma hankinta, kuuluu urakkaan', ownDevice],
  ['oma hankinta, laskutetaan asiakkaalta', { ...ownDevice, id: 'd5', bill_to_customer: true, customer_unit_price: 1500 }],
]) {
  const gLogs = [{ ...baseLog, expense_lines: [ { ...line } ] }];
  const gCalc = calculateWorkReportBillable({
    logs: gLogs, users, rates, ratesSource: 'partnership', tripKmRate: 0.59, billToCompanyId: 'owner', billToCompanyName: 'Owner Oy',
  });
  const raw = { ...baseSettings }; // purchase_lines: tarjouksen rivit, laite 1260, ei päiväkirjariviä
  const gMargin = computePartnerNetMargin(raw, gCalc.grandTotal, { logs: gLogs, partnerRates: rates, partnerCalculation: gCalc });
  const dev = gMargin.deductionRows.find((r) => r.key === 'device').amount;
  assert.equal(dev, 1180, `G ${label}: kirjattu laite kerran, ei tarjouspyynnön 1260`);
  const eating = gMargin.deductionRows.find((r) => r.key === 'margin_eating')?.amount ?? 0;
  assert.equal(eating, 0, `G ${label}: laite ei katetta syövissä`);
  const deductions = round(gMargin.deductionRows.reduce((sum, r) => sum + r.amount, 0));
  assert.equal(gMargin.grossMarginNet, round(SALE + gMargin.customerExtrasNet - deductions));
}

// H) LAITE-ruutu: esitäyttö tarjouspyynnöstä (tallennettu oikaisu näkyy), katoaa kun laite kirjataan
const quoteDeviceOnly = (settings) =>
  mergeActualPurchaseFromWorkReportLogs(settings, [], quoteData).purchase_lines.filter((l) => l.source === 'device');
const sugA = quoteDeviceSuggestions(quoteDeviceOnly(baseSettings), [{ ...baseLog, expense_lines: [diarySupply] }]);
assert.deepEqual(sugA.map((r) => [r.description, r.unitPrice, r.quoteNet, r.corrected]), [['Laite', 1260, 1260, false]]);
const sugB = quoteDeviceSuggestions(quoteDeviceOnly(correctedSettings), []);
assert.deepEqual(sugB.map((r) => [r.unitPrice, r.quoteNet, r.corrected]), [[1100, 1260, true]], 'oikaistu hinta esitäytetään');
// Oikaisu säilyy myös, kun tallennettu asetus on kulkenut laitekirjauksen kautta (C2)
assert.equal(quoteDeviceSuggestions(quoteDeviceOnly(C2.merged), [])[0].unitPrice, 1100);
assert.deepEqual(quoteDeviceSuggestions(quoteDeviceOnly(baseSettings), C.logs), [], 'kirjattu laite → ei esitäyttöä');
// Lisälaite (hyväksytty lisälaskutus) ei poista esitäyttöä
assert.equal(quoteDeviceSuggestions(quoteDeviceOnly(baseSettings), E.logs).length, 1);
// "Laite:"-etuliite pois nimestä
assert.equal(
  quoteDeviceSuggestions([{ id: 'device:main', label: 'Laite: Mitsubishi Heavy 7 kW', source: 'device', quote_purchase_net: 1260, actual_purchase_net: 1260 }], [])[0].description,
  'Mitsubishi Heavy 7 kW',
);
// Esitäytön tallennus kirjauksena (oma hankinta, kuuluu urakkaan, 1260) = sama kate kuin esitäytetty
const confirmed = { id: 'd6', expense_type: 'device', description: 'Laite', qty: 1, unit_price: 1260, bill_to_partner: false, bill_to_customer: false };
const H = scenario('H vahvistettu esitäyttö', { expenseLines: [diarySupply, confirmed] });
assert.equal(H.deviceDeduction, 1260);
assert.equal(H.margin.grossMarginNet, A.margin.grossMarginNet, 'vahvistus ei muuta katetta');

// Viimeisin työkirjaus (laite lisätään siihen)
assert.equal(latestDailyLog([]), null);
assert.equal(
  latestDailyLog([
    { id: 'a', log_date: '2026-09-22', created_at: '2026-09-22T08:00:00Z' },
    { id: 'b', log_date: '2026-09-23', created_at: '2026-09-23T07:00:00Z' },
    { id: 'c', log_date: '2026-09-23', created_at: '2026-09-23T09:00:00Z' },
    { id: 'd', log_date: '2026-09-21', created_at: '2026-09-25T09:00:00Z' },
  ]).id,
  'c',
);

// LAITE-ruudun teksti
const fmt = (v) => `${v.toFixed(2).replace('.', ',')} €`;
assert.equal(
  deviceTileSubtitle({ ...baseLog, expense_lines: [ownDevice] }, { showMoney: true, formatEuro: fmt }),
  'Mitsubishi MSZ-LN35 · hankinta 1180,00 €',
);
assert.equal(
  deviceTileSubtitle({ ...baseLog, expense_lines: [soldDevice] }, { showMoney: true, formatEuro: fmt }),
  'Ilmalämpöpumppu · hankinta 800,00 € · asiakas 1200,00 €',
);
assert.equal(
  deviceTileSubtitle({ ...baseLog, expense_lines: [soldDevice] }, { showMoney: false, formatEuro: fmt }),
  'Ilmalämpöpumppu',
);
assert.equal(deviceTileSubtitle({ ...baseLog, expense_lines: [diarySupply] }, { showMoney: true, formatEuro: fmt }), null);

// Tarjouspyynnön rivit: laiterivin ohje viittaa Laite-osioon
assert.match(g.device.lines[0].hint, /kunnes LAITE kirjataan/);

console.log('quote-aligned entries OK');
