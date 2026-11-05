/**
 * Majoitus ja km-korvaus: tarjouksen kulu, laskutetaan kumppanilta, syö katetta.
 * Ei Supabasea, ei kirjoituksia (Wärtsilä-raportin tiedot kovakoodattu).
 */
import assert from 'node:assert/strict';
import { planQuoteRowSync, seededRowBillingMode, seededRowInsertPayload, isUntouchedSeededLine, mergeSeededRows } from '../src/lib/quoteSeededRows.ts';
import { calculateWorkReportBillable } from '../src/lib/workReportBilling.ts';
import { computePartnerNetMargin, parseBillingQuoteSettings } from '../src/lib/workReportBillingQuote.ts';
import { mergeActualPurchaseFromWorkReportLogs } from '../src/lib/quoteRequestActualPurchaseSync.ts';
import { extractQuotePurchaseLines } from '../src/lib/quotePurchaseLines.ts';
import { compareQuoteCategories } from '../src/lib/quoteCategoryComparison.ts';
import { buildQuoteOutcomeSummary, buildAccountingStatement } from '../src/lib/quoteOutcomeSummary.ts';
import { formatEuro } from '../src/lib/workReportBilling.ts';

const partnerRates = { hourly_regular: 50, hourly_overtime: 75, hourly_on_call: 100 };
const quoteData = {
  type: 'huolto', workItems: [{ id: 'a', hours: 10, materials: [], description: 'Ajoaika', pricePerHour: 65 }, { id: 'b', hours: 40, materials: [], description: 'Huolto', pricePerHour: 65 }],
  laborHours: 2, travelKmRate: 0.53, installationLaborHours: 50, installationLaborPurchaseRate: 50,
  installationVehicleAllowance: 50, installationVehicleHoursPerBlock: 8,
  installationSupplies: [
    { id: '1', name: 'Huoltotarvikkeet', rowKind: 'supply', quantity: 30, sellPrice: 45, marginPercent: 80, purchasePrice: 25 },
    { id: '2', name: 'Majoitus', rowKind: 'expense', quantity: 5, sellPrice: 200, marginPercent: 100, purchasePrice: 100 },
    { id: '3', name: 'Km korvaus', unit: 'km', rowKind: 'expense', quantity: 800, sellPrice: 1.2, marginPercent: 20, purchasePrice: 1 },
  ],
};
const mk = (id, date, h, legs, exp) => ({ id, work_report_id: 'wr', log_date: date, entry_type: 'regular', hours_regular: h, hours_overtime: 0, hours_on_call: 0, trip_legs: legs, expense_lines: exp, created_by: 'u1', created_at: date + 'T10:00:00Z', customer_extra_billing: {} });
const km = (d) => ({ expense_type: 'km', description: `Ajomatkat (${d} km)`, qty: d, unit_price: 0.9, customer_unit_price: 1, bill_to_partner: true, bill_to_customer: true });
const users = [{ id: 'u1', display_name: 'T', bill_hours_enabled: true, bill_expenses_enabled: true }];
const logsWith = (flags) => [
  mk('l1', '2026-11-01', 5, [{ distance_km: 408.3 }], [km(408.3)]),
  mk('l2', '2026-11-03', 10, [], [
    { id: 'e-sup', expense_type: 'material', description: 'Huoltotarvikkeet', qty: 30, unit_price: 0, bill_to_partner: false, bill_to_customer: false },
    { id: 'e-maj', expense_type: 'other', description: 'Majoitus', qty: 5, unit_price: 56, ...flags },
  ]),
  mk('l3', '2026-11-04', 5, [], []),
  mk('l4', '2026-11-05', 5, [{ distance_km: 406.9 }], [km(406.9)]),
];
const run = (logs) => {
  const calc = calculateWorkReportBillable({ logs, users, rates: partnerRates, ratesSource: 'company_default', tripKmRate: 0.53 });
  const settings = {
    ...mergeActualPurchaseFromWorkReportLogs({ purchase_lines: extractQuotePurchaseLines(quoteData) }, logs, quoteData),
    quote_sale_net: 6560, quote_vat_rate: 0, customer_mode: 'quote_fixed', partner_commission_percent: 0,
  };
  const margin = computePartnerNetMargin(settings, 0, { logs, partnerRates, partnerCalculation: calc, quoteData });
  const cmp = compareQuoteCategories({ quoteData, partnerCalculation: calc, logs, partnerRates, tripKmRate: 0.53, billingSettings: settings });
  return { calc, margin, cmp };
};

// 1) Kate ei muutu kun majoitus siirtyy "kuuluu urakkaan" → "laskutetaan kumppanilta"; kumppanilasku kasvaa 280 €.
const before = run(logsWith({ bill_to_partner: false, bill_to_customer: false }));
const after = run(logsWith({ bill_to_partner: true, bill_to_customer: true }));
assert.equal(before.margin.grossMarginNet, 4296.32);
assert.equal(after.margin.grossMarginNet, 4296.32, 'majoitus syö katetta edelleen, ei vapaa');
assert.equal(Math.round((after.calc.grandTotal - before.calc.grandTotal) * 100) / 100, 280, 'majoitus laskutetaan kumppanilta');
const ded = (m) => Math.round(m.deductionRows.reduce((s, r) => s + r.amount, 0) * 100) / 100;
assert.equal(ded(after.margin), ded(before.margin));
const sumAfter = buildQuoteOutcomeSummary({ partnerMargin: after.margin, comparison: after.cmp, quoteSaleNet: 6560, formatEuro });
assert.equal(sumAfter.costs.actualNet, 2263.68, 'kulut yhteensä pysyy samana');
const stmt = buildAccountingStatement(sumAfter);
const travel = stmt.costs.find((l) => l.label === 'Ajokilometrit');
const lodging = stmt.costs.find((l) => l.label === 'Majoitus');
assert.match(lodging.sub, /oma kulu · laskutetaan kumppanilta/);
assert.match(travel.sub, /oma kulu · laskutetaan kumppanilta/);
assert.equal(lodging.actualNet, 280);

// 2) Uusi majoitusrivi tarjouksesta syntyy laskutettavana kumppanilta, muut kuuluvat urakkaan.
const rowMaj = { id: 'material:2', description: 'Majoitus', expense_type: 'other', qty: 5 };
const rowSup = { id: 'material:1', description: 'Huoltotarvikkeet', expense_type: 'material', qty: 30 };
assert.equal(seededRowBillingMode(rowMaj), 'partner_and_customer');
assert.equal(seededRowBillingMode(rowSup), 'included_in_contract');
const pMaj = seededRowInsertPayload(rowMaj, 'log', 0);
assert.deepEqual([pMaj.bill_to_partner, pMaj.bill_to_customer], [true, true]);
assert.deepEqual([seededRowInsertPayload(rowSup, 'log', 0).bill_to_partner, seededRowInsertPayload(rowSup, 'log', 0).bill_to_customer], [false, false]);
assert.equal(isUntouchedSeededLine({ ...pMaj, id: 'x' }, rowMaj), true);
assert.equal(isUntouchedSeededLine({ ...pMaj, id: 'x', bill_to_partner: false, bill_to_customer: false }, rowMaj), false);

// 3) Vanha "kuuluu urakkaan" -majoitus korjataan kerran; sama tarvikerivi ei muutu; toinen ajo ei tee mitään.
const logs = logsWith({ bill_to_partner: false, bill_to_customer: false });
const seeded = { quote_request_id: 'q1', lines: [{ id: 'material:1', description: 'Huoltotarvikkeet', expense_type: 'material', qty: 30 }, rowMaj] };
const plan = planQuoteRowSync({ quoteId: 'q1', quoteData, seeded, logs });
assert.deepEqual(plan.accommodationFixLineIds, ['e-maj']);
assert.equal(plan.nextSeeded.accommodation_partner_billed, true);
assert.equal(plan.changed, true);
const fixedLogs = logsWith({ bill_to_partner: true, bill_to_customer: true });
const plan2 = planQuoteRowSync({ quoteId: 'q1', quoteData, seeded: plan.nextSeeded, logs: fixedLogs });
assert.deepEqual(plan2.accommodationFixLineIds, []);
assert.equal(plan2.changed, false, 'idempotentti');
// Tietoinen paluu "kuuluu urakkaan" -tilaan säilyy kun korjaus on jo tehty.
const plan3 = planQuoteRowSync({ quoteId: 'q1', quoteData, seeded: plan.nextSeeded, logs });
assert.deepEqual(plan3.accommodationFixLineIds, []);
// Tarjous ilman majoitusta: ei korjausta eikä merkintää.
const noMaj = { ...quoteData, installationSupplies: quoteData.installationSupplies.filter((r) => r.id !== '2') };
const plan4 = planQuoteRowSync({ quoteId: 'q1', quoteData: noMaj, seeded: null, logs });
assert.deepEqual(plan4.accommodationFixLineIds, []);
assert.equal(plan4.nextSeeded.accommodation_partner_billed, undefined);
// Merkintä säilyy mergeSeededRows-kutsussa ja parsessa.
const merged = mergeSeededRows({ quote_seeded_rows: plan.nextSeeded }, 'q1', []);
assert.equal(merged.quote_seeded_rows.accommodation_partner_billed, true);
assert.equal(parseBillingQuoteSettings({ quote_seeded_rows: plan.nextSeeded }).quote_seeded_rows.accommodation_partner_billed, true);

console.log('accommodation-partner-billing: ok');

// 4) syncQuoteRowsToWorkReport mock-Supabasella: vain majoitusrivi päivitetään, ei muita kirjoituksia.
import { syncQuoteRowsToWorkReport } from '../src/lib/quoteSeededRows.ts';
const writes = [];
const tables = {
  work_report_billable: { billing_quote: { quote_request_id: 'q1', quote_sale_net: 6560, quote_seeded_rows: seeded } },
  quote_requests: { data: quoteData },
};
const fake = {
  from(table) {
    const state = { table, op: 'select' };
    const chain = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'then') {
          return (resolve) => {
            let data = null;
            if (state.op === 'select') {
              if (table === 'work_report_daily_logs') data = logs;
              else if (table === 'work_report_daily_expense_lines') data = logs.flatMap((l) => (l.expense_lines ?? []).map((e) => ({ ...e, daily_log_id: l.id })));
              else if (tables[table]) data = tables[table];
              else data = [];
            }
            resolve({ data, error: null });
          };
        }
        if (prop === 'update' || prop === 'insert' || prop === 'delete' || prop === 'upsert') {
          return (payload) => { state.op = prop; state.payload = payload; writes.push(state); return chain; };
        }
        if (prop === 'in') return (col, vals) => { state.in = [col, vals]; return chain; };
        if (prop === 'maybeSingle' || prop === 'single') return () => { state.single = true; return { then: (resolve) => resolve({ data: tables[table] ?? null, error: null }) }; };
        return () => chain;
      },
    });
    return chain;
  },
};
try {
  const result = await syncQuoteRowsToWorkReport(fake, 'wr');
  const upd = writes.filter((w) => w.table === 'work_report_daily_expense_lines' && w.op === 'update');
  assert.equal(upd.length, 1, 'yksi rivipäivitys');
  assert.deepEqual(upd[0].payload, { bill_to_partner: true, bill_to_customer: true });
  assert.deepEqual(upd[0].in, ['id', ['e-maj']]);
  assert.equal(writes.filter((w) => w.op === 'delete' || (w.op === 'insert' && w.table === 'work_report_daily_expense_lines')).length, 0);
  assert.equal(result.changed, true);
  const saved = writes.find((w) => w.table === 'work_report_billable');
  assert.ok(saved, 'merkintä tallennetaan');
  console.log('sync-mock: ok');
} catch (e) {
  console.log('sync-mock FAILED:', e.message);
  console.log(writes.map((w) => `${w.table}:${w.op}`));
  process.exit(1);
}
