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

console.log('quote-aligned entries OK');
