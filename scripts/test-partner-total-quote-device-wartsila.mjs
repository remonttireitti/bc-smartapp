/**
 * Regressio: "Wärtsilä – 3 kpl muuntamon jäähdytys" (kumppani Lämpökatsastus Oy).
 *
 * Oire: lista näytti "Avoinna 14 851,26 € · Laskutettu 3 131,50 €", raportti taas
 * "Kumppanille laskutettava 3 131,50 € · Laskuttamatta 0,00 €".
 *
 * Juurisyyt:
 *  1. Kumppanilaskelman tallennuspolku (refreshAndPersistPartnerBillable) laski
 *     provision ilman linkitetyn tarjouspyynnön dataa. Tallennetussa billing_quotessa
 *     oli vain vanha "Tarvikkeet (päiväkirja)" -rivi → tarjottu laite 22 896 € putosi
 *     katteesta ja provisio paisui (14 851,26 € vanhalla koodilla, 15 022,57 € #82:n jälkeen).
 *     Paneeli latasi tarjouspyynnön ja näytti eri katteen.
 *  2. Ennen #83:a provisio lisättiin vain partner_total:iin (17 982,76 €), mutta tila
 *     laskettiin calculation.grandTotalista (3 131,50 €) → partner_invoice_status = 'paid'.
 *     Sen jälkeen "Päivitä laskelma" (ensurePartnerBillableCalculated) ohitti raportin
 *     täysin laskutettuna → summa jäätyi.
 *
 * Oikea laskelma:
 *   työ 53 h × 50 € = 2 650,00 · km 240,90 + 240,60 = 481,50 → kumppanin kulut 3 131,50
 *   tarjous 34 590,00 − 3 131,50 − laite 22 896,00 − tarvikkeet 1 413,36 = kate 7 149,14
 *   provisio 50 % = 3 574,57 → kumppanille 3 131,50 + 3 574,57 = 6 706,07
 *   laskutettu 3 131,50 → laskuttamatta 3 574,57
 */
import assert from 'node:assert/strict';
import {
  BILLABLE_CALCULATION_VERSION,
  breakdownFromBillableCalculation,
  calculateWorkReportBillable,
} from '../src/lib/workReportBilling.ts';
import {
  applyQuoteCommissionToPartnerCalculation,
  partnerBillableStoredTotalMismatch,
  shouldSkipPaidPartnerRecalc,
} from '../src/lib/workReportPartnerTotal.ts';
import { refreshAndPersistPartnerBillable } from '../src/lib/workReportPartnerBillingPersist.ts';
import { billingRowPartnerAmounts } from '../src/lib/workReportBillingCopy.ts';
import { createEmptyQuoteRequestData } from '../src/lib/quoteRequest/defaults.ts';
import { dailyLogExpensesTotal } from '../src/lib/workReportTripLegs.ts';

const KM_RATE = 0.59;
const users = [{ id: 'u1', display_name: 'Enn', bill_hours_enabled: true, bill_expenses_enabled: true }];
const rates = { hourly_regular: 50, hourly_overtime: 75, hourly_on_call: 100 };

const tarvike = (id, description, unitPrice, extra = {}) => ({
  id,
  daily_log_id: 'log-10',
  expense_type: 'material',
  description,
  qty: 1,
  unit_price: unitPrice,
  // "Kumppanin tilillä hankittu" — ei laskuteta kumppanilta, vähennetään katteesta
  bill_to_partner: false,
  bill_to_customer: true,
  sort_order: 0,
  ...extra,
});

const leg = (id, logId, km) => ({ id, daily_log_id: logId, from_label: 'Vaasa', to_label: 'Kohde', distance_km: km, sort_order: 0 });

const workLog = (id, date, hours, more = {}) => ({
  id,
  log_date: date,
  created_at: `${date}T16:00:00Z`,
  entry_type: 'regular',
  hours_regular: hours,
  hours_overtime: 0,
  hours_on_call: 0,
  created_by: 'u1',
  work_done: 'Muuntamon jäähdytys',
  expense_lines: [],
  trip_legs: [],
  refrigerant_lines: [],
  ...more,
});

const logs = [
  workLog('log-10', '2026-09-10', 15, {
    trip_legs: [leg('t1', 'log-10', 203.9), leg('t2', 'log-10', 203.9)],
    expense_lines: [
      // "Kuuluu urakkaan" — vanha koodi vähensi tämän kahdesti (tarvikkeet + katetta syövä kulu)
      tarvike('e1', 'Onninen kuparit', 342.62, { bill_to_customer: false }),
      tarvike('e2', 'Dahl nielusaha', 22.37),
      tarvike('e3', 'Armaflex', 310.0),
      tarvike('e4', 'Uponor', 420.0),
      tarvike('e5', 'Silkkarit', 118.37),
      tarvike('e6', 'Onninen liittimet', 150.0),
      tarvike('e7', 'Kiinnikkeet', 50.0),
    ],
  }),
  workLog('log-9', '2026-09-09', 10),
  workLog('log-8', '2026-09-08', 11),
  workLog('log-7', '2026-09-07', 12),
  workLog('log-6', '2026-09-06', 5, { trip_legs: [leg('t3', 'log-6', 204.15), leg('t4', 'log-6', 204.15)] }),
];

// Työkirjaukset-otsikon luvut: 53 h · kulut 1 894,86 € (km 481,50 + tarvikkeet 1 413,36) · 816,1 km
assert.equal(logs.reduce((s, l) => s + l.hours_regular, 0), 53);
assert.equal(dailyLogExpensesTotal(logs[0], KM_RATE), 1653.96);
assert.equal(dailyLogExpensesTotal(logs[4], KM_RATE), 240.9);
assert.equal(
  Math.round(logs.reduce((s, l) => s + dailyLogExpensesTotal(l, KM_RATE), 0) * 100) / 100,
  1894.86,
);

const quoteData = {
  ...createEmptyQuoteRequestData('huolto'),
  installationSupplies: [
    { id: 'dev-1', name: '3 kpl jäähdytyskone', quantity: 1, purchasePrice: 22896, marginPercent: 25, sellPrice: 28620, rowKind: 'device' },
    { id: 'sup-1', name: 'LVI-tarvikkeet', quantity: 1, purchasePrice: 753, marginPercent: 20, sellPrice: 941.25, rowKind: 'supply' },
  ],
};

/** Tallennettu (vanha) billing_quote: vain päiväkirjan tarvikerivi, laite puuttuu. */
const storedBillingQuote = {
  quote_request_id: 'q-wartsila',
  quote_title: 'Wärtsilä – Kylmälaitehuolto',
  quote_sale_net: 34590,
  customer_invoice_total: 34590,
  customer_mode: 'quote_fixed',
  quote_vat_rate: 0,
  quote_purchase_net: 23649,
  partner_commission_percent: 50,
  purchase_lines: [
    { id: 'group:diary-supplies', label: 'Tarvikkeet (päiväkirja)', source: 'group', quote_purchase_net: 24309.36, actual_purchase_net: 1413.36 },
  ],
};

const base = calculateWorkReportBillable({
  logs,
  users,
  rates,
  ratesSource: 'partnership',
  billToCompanyId: 'owner-lk',
  billToCompanyName: 'Lämpökatsastus Oy',
  tripKmRate: KM_RATE,
});
const baseBreakdown = breakdownFromBillableCalculation(base);
assert.equal(baseBreakdown.work, 2650);
assert.equal(baseBreakdown.materials, 481.5, 'kulut = vain km (240,90 + 240,60); tarvikkeet ovat kumppanin tilillä');
assert.equal(base.grandTotal, 3131.5);
assert.equal(base.version, BILLABLE_CALCULATION_VERSION);

// --- 1. Ilman tarjouspyynnön dataa laite putoaa (vanha tallennuspolku) — dokumentoi bugin
{
  const { partnerMargin } = applyQuoteCommissionToPartnerCalculation({
    billingQuote: storedBillingQuote,
    logs,
    calculation: base,
  });
  assert.equal(partnerMargin.deviceActualNet, 0);
  assert.equal(partnerMargin.commissionNet, 15022.57);
}

// --- 2. Tarjouspyynnön datalla: laite mukana, provisio 3 574,57, kumppanille 6 706,07
{
  const { calculation, partnerMargin } = applyQuoteCommissionToPartnerCalculation({
    billingQuote: storedBillingQuote,
    logs,
    calculation: base,
    quoteData,
  });
  assert.deepEqual(
    partnerMargin.deductionRows.map((row) => [row.key, row.amount]),
    [['labor_expenses', 3131.5], ['device', 22896], ['supplies', 1413.36]],
  );
  assert.equal(partnerMargin.grossMarginNet, 7149.14);
  assert.equal(partnerMargin.commissionNet, 3574.57);
  assert.equal(partnerMargin.netMarginNet, 3574.57);
  assert.equal(calculation.grandTotal, 6706.07);
  const breakdown = breakdownFromBillableCalculation(calculation);
  assert.deepEqual(breakdown, { work: 2650, materials: 481.5, commission: 3574.57, total: 6706.07 });
  const commissionLines = calculation.byUser.flatMap((u) => u.lines).filter((l) => l.kind === 'commission');
  assert.equal(commissionLines.length, 1);
  assert.equal(commissionLines[0].description, 'Provisio 50 % puhtaasta katteesta');
}

// --- 3. Tallennuspolku (fake Supabase): lataa tarjouspyynnön, laskutettu 3 131,50 säilyy
function createFakeSupabase(state) {
  const writes = [];
  function builder(table) {
    const q = { table, filters: {}, fields: '' };
    const resolveRows = () => {
      if (table === 'profiles') return { data: users, error: null };
      if (table === 'companies') return { data: { settings: { trip_km_rate: KM_RATE, billing: { partner_rates: rates } } }, error: null };
      if (table === 'company_partnerships') return { data: null, error: null };
      if (table === 'quote_requests') {
        return q.filters.id === 'q-wartsila' ? { data: { data: quoteData }, error: null } : { data: null, error: null };
      }
      if (table === 'work_report_billable') return { data: state.billable, error: null };
      if (table === 'work_report_billing') return { data: state.billing, error: null };
      return { data: [], error: null };
    };
    const api = {
      select(fields) { q.fields = fields; return api; },
      eq(key, value) { q.filters[key] = value; return api; },
      in() { return api; },
      or() { return api; },
      order() { return api; },
      gte() { return api; },
      lte() { return api; },
      neq() { return api; },
      maybeSingle() { return Promise.resolve(resolveRows()); },
      single() { return Promise.resolve(resolveRows()); },
      then(onFulfilled, onRejected) { return Promise.resolve(resolveRows()).then(onFulfilled, onRejected); },
      upsert(payload) {
        writes.push({ table, payload });
        if (table === 'work_report_billable') state.billable = { ...state.billable, ...payload };
        if (table === 'work_report_billing') state.billing = { ...state.billing, ...payload };
        return Promise.resolve({ error: null });
      },
    };
    return api;
  }
  return { client: { from: builder, rpc: async () => ({ error: null }) }, writes };
}

{
  // Tila ennen korjausta: 14.17 laskettu vanhalla koodilla
  const staleCalculation = { ...base, version: 5 };
  const state = {
    billable: {
      billing_quote: storedBillingQuote,
      billing_rates_override: null,
      use_custom_rates: false,
      partner_total: 17982.76,
      calculation: staleCalculation,
      partner_recalc_needed: false,
    },
    billing: { partner_invoice_status: 'paid', partner_billed_amount: 3131.5, partner_billed_at: '2026-09-24T12:00:00Z' },
  };

  // Lista: "Avoinna 14 851,26" = vanha provisio (tarjous − kulut − tarvikkeet − 342,62 tuplana, ilman laitetta)
  const staleRow = { billable: { partner_total: 17982.76, calculation: staleCalculation }, billing: state.billing };
  const staleAmounts = billingRowPartnerAmounts(staleRow);
  assert.equal(staleAmounts.open, 14851.26);
  assert.equal(Math.round((34590 - 3131.5 - 1413.36 - 342.62) * 0.5 * 100) / 100, 14851.26);

  // Jäätyminen: ennen korjausta "Päivitä laskelma" ohitti tämän raportin
  assert.equal(partnerBillableStoredTotalMismatch(17982.76, staleCalculation), true);
  const guardInput = {
    partnerInvoiceStatus: 'paid',
    partnerBilledAmount: 3131.5,
    partnerRecalcNeeded: false,
    partnerTotal: 17982.76,
    calculation: staleCalculation,
  };
  assert.equal(shouldSkipPaidPartnerRecalc(guardInput), false, 'ristiriitainen summa lasketaan uudelleen');
  assert.equal(
    shouldSkipPaidPartnerRecalc({ ...guardInput, partnerTotal: 3131.5 }),
    true,
    'aidosti täysin laskutettu raportti ohitetaan taustapäivityksessä',
  );
  assert.equal(shouldSkipPaidPartnerRecalc({ ...guardInput, partnerTotal: 3131.5, force: true }), false);

  const { client } = createFakeSupabase(state);
  const report = {
    id: 'wr-wartsila',
    owner_company_id: 'owner-lk',
    created_by_company_id: 'creator',
    delegate_company_id: null,
    partnership_id: null,
    owner_company: { name: 'Lämpökatsastus Oy' },
    delegate_company: null,
  };
  const calculation = await refreshAndPersistPartnerBillable(client, report, logs, { viewerCompanyId: 'creator' });
  assert.equal(calculation.grandTotal, 6706.07);
  assert.equal(state.billable.partner_total, 6706.07, 'partner_total = calculation.grandTotal');
  assert.equal(state.billable.calculation.grandTotal, 6706.07);
  assert.equal(state.billable.calculation.version, BILLABLE_CALCULATION_VERSION);
  assert.equal(state.billing.partner_invoice_amount, 6706.07);
  assert.equal(state.billing.partner_billed_amount, 3131.5, 'laskutettu summa ei muutu');
  assert.equal(state.billing.partner_invoice_status, 'partial');

  const amounts = billingRowPartnerAmounts({ billable: state.billable, billing: state.billing });
  assert.equal(amounts.total, 6706.07);
  assert.equal(amounts.billed, 3131.5);
  assert.equal(amounts.open, 3574.57);
  assert.equal(amounts.state, 'partial');
}

console.log('test-partner-total-quote-device-wartsila: ok');
