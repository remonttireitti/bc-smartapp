import assert from 'node:assert/strict';
import { calculateWorkReportBillable, extraBillingTotal } from '../src/lib/workReportBilling.ts';
import { calculateWorkReportCustomerBillable } from '../src/lib/workReportCustomerBilling.ts';

const rates = { hourly_regular: 55, hourly_overtime: 82.5, hourly_on_call: 110 };
const user = { id: 'u1', display_name: 'Enn', bill_hours_enabled: true, bill_expenses_enabled: true };
const exp = (id, logId, price, extra = {}) => ({ id, daily_log_id: logId, expense_type: 'material', description: `Tarvike ${id}`, qty: 1, unit_price: price, customer_unit_price: price, bill_to_partner: true, bill_to_customer: true, sort_order: 0, ...extra });
function log(id, date, extra) {
  return {
    id, work_report_id: 'r1', log_date: date, log_start_time: '08:00', entry_type: 'regular',
    hours_regular: 8, hours_overtime: 0, hours_on_call: 0, hours_agreed_regular: 0,
    created_by: 'u1', created_at: `${date}T08:00:00Z`, fixed_price_amount: null,
    customer_fixed_price_amount: null, partner_urakka_margin_percent: null,
    commission_amount: 0, commission_note: null, work_done: 'Työ', partner_billing: null,
    customer_extra_billing: {}, expense_lines: [], trip_legs: [], refrigerant_lines: [], author: null, ...extra,
  };
}
const partner = (logs) => calculateWorkReportBillable({ logs, users: [user], rates, ratesSource: 'partnership', billToCompanyId: 'c2', billToCompanyName: 'X' });
const customer = (logs) => calculateWorkReportCustomerBillable({ logs, rates, ratesSource: 'company', customerName: 'Asiakas' });

// Vanha urakkakirjaus (ei urakka_all_in-lippua): kulut laskutetaan kuten ennen.
const legacy = log('d1', '2026-10-19', { entry_type: 'fixed_price', fixed_price_amount: 2500, customer_fixed_price_amount: 2500, expense_lines: [exp('a', 'd1', 100)] });
assert.equal(partner([legacy]).grandTotal, 2600);
assert.equal(customer([legacy]).grandTotal, 2600);

// Urakka-kytkin: kulut kuuluvat urakkaan (0 €), urakkahinta on laskutettava.
const allIn = log('d1', '2026-10-19', { entry_type: 'fixed_price', fixed_price_amount: 2500, customer_fixed_price_amount: 2500, partner_billing: { urakka_all_in: true }, expense_lines: [exp('a', 'd1', 100)] });
const p = partner([allIn]);
assert.equal(p.grandTotal, 2500);
assert.equal(p.byUser[0].expensesTotal, 0);
assert.equal(p.byUser[0].lines.find((l) => l.kind === 'expense').notBilledReason, 'urakka');
assert.equal(customer([allIn]).grandTotal, 2500);

// Rivikohtainen Laskutettava: laskutetaan erikseen (Lisälaskutus-osio), urakkahinta ennallaan.
const billedRow = log('d1', '2026-10-19', { entry_type: 'fixed_price', fixed_price_amount: 2500, customer_fixed_price_amount: 2500, partner_billing: { urakka_all_in: true }, expense_lines: [exp('a', 'd1', 100), exp('b', 'd1', 40, { urakka_billed: true })] });
const pb = partner([billedRow]);
assert.equal(pb.grandTotal, 2540);
assert.equal(extraBillingTotal(pb), 40);
assert.equal(pb.byUser[0].lines.filter((l) => l.kind === 'expense' && l.included && l.extraBilling).length, 1);
const cb = customer([billedRow]);
assert.equal(cb.grandTotal, 2540);
assert.equal(extraBillingTotal(cb), 40);

// Termatek/Hämeentie: urakka 2500 + erillinen Lisälaskutus 2 h (55 €/h) → 2610; urakkapäivän kulut kuuluvat urakkaan.
const urakka = log('d19', '2026-10-19', { entry_type: 'fixed_price', fixed_price_amount: 2500, partner_billing: { urakka_all_in: true }, expense_lines: [exp('a', 'd19', 100)] });
const lisa = log('d20', '2026-10-20', { hours_regular: 2, partner_billing: { extra_billing: true } });
const t = partner([urakka, lisa]);
assert.equal(t.grandTotal, 2610);
assert.equal(extraBillingTotal(t), 110);
// Ilman Lisälaskutus-merkintää tunnit kuuluvat urakkaan.
assert.equal(partner([urakka, log('d20', '2026-10-20', { hours_regular: 2 })]).grandTotal, 2500);

// Työtuntirivin Laskutettava (urakka): tunnit laskutetaan normaalihinnalla Lisälaskutus-osiossa urakan päälle.
const hoursBilled = log('d19', '2026-10-19', { entry_type: 'fixed_price', fixed_price_amount: 2500, customer_fixed_price_amount: 2500, hours_regular: 2, partner_billing: { urakka_all_in: true, hours_row_billed: true } });
const hb = partner([hoursBilled]);
assert.equal(hb.grandTotal, 2610); // 2500 + 2 h × 55
assert.equal(extraBillingTotal(hb), 110);
assert.equal(hb.byUser[0].fixedTotal, 2500);
assert.equal(customer([hoursBilled]).grandTotal, 2610);
assert.equal(extraBillingTotal(customer([hoursBilled])), 110);
// Ilman kytkintä tunnit kuuluvat urakkaan (vanha käytös).
const hoursOff = log('d19', '2026-10-19', { entry_type: 'fixed_price', fixed_price_amount: 2500, customer_fixed_price_amount: 2500, hours_regular: 2, partner_billing: { urakka_all_in: true } });
assert.equal(partner([hoursOff]).grandTotal, 2500);
assert.equal(customer([hoursOff]).grandTotal, 2500);
// Lippu ei vaikuta tavalliseen kirjaukseen (ei urakka).
assert.equal(partner([log('d1', '2026-10-19', { partner_billing: { hours_row_billed: true } })]).grandTotal, 440);
// Takuu: tunnit 0 €; Laskutettava päällä → takuun ulkopuoliset tunnit laskutetaan.
assert.equal(partner([log('d1', '2026-10-19', { partner_billing: { warranty: true } })]).grandTotal, 0);
assert.equal(partner([log('d1', '2026-10-19', { partner_billing: { warranty: true, hours_row_billed: true } })]).grandTotal, 440);
assert.equal(customer([log('d1', '2026-10-19', { partner_billing: { warranty: true, hours_row_billed: true } })]).grandTotal, 440);
// Termatek/Hämeentie yhdistelmä: urakka + laskutettava tunnit samalla päivällä + erillinen Lisälaskutus 2 h.
const tm = partner([hoursBilled, log('d20', '2026-10-20', { hours_regular: 2, partner_billing: { extra_billing: true } })]);
assert.equal(tm.grandTotal, 2720);
assert.equal(extraBillingTotal(tm), 220);
console.log('urakka-all-in ok');
