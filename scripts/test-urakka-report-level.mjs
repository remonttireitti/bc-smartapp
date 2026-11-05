import assert from 'node:assert/strict';
import {
  buildUrakkaReportPatch,
  summarizeReportUrakka,
  computePartnerBillFromCustomerPrice,
  urakkaLogsToClear,
  urakkaPricePatchFromLog,
} from '../src/lib/workReportUrakkaReport.ts';
import { calculateWorkReportBillable } from '../src/lib/workReportBilling.ts';

const rates = { hourly_regular: 55, hourly_overtime: 82.5, hourly_on_call: 110 };
const user = { id: 'u1', display_name: 'Enn', bill_hours_enabled: true, bill_expenses_enabled: true };
const log = (id, date, extra) => ({
  id, work_report_id: 'r1', log_date: date, log_start_time: '08:00', entry_type: 'fixed_price',
  hours_regular: 5, hours_overtime: 0, hours_on_call: 0, hours_agreed_regular: 0, created_by: 'u1',
  created_at: `${date}T08:00:00Z`, fixed_price_amount: null, customer_fixed_price_amount: null,
  partner_urakka_margin_percent: null, commission_amount: 0, commission_note: null, work_done: 'Ajo',
  partner_billing: { urakka_all_in: true }, customer_extra_billing: {}, expense_lines: [], trip_legs: [],
  refrigerant_lines: [], author: null, ...extra,
});
const partner = (logs) => calculateWorkReportBillable({ logs, users: [user], rates, ratesSource: 'partnership', billToCompanyId: 'c2', billToCompanyName: 'X' });

// Suora hinta: kumppanille 4 000 €
assert.deepEqual(buildUrakkaReportPatch({ mode: 'direct', customer: '', partnerPercent: '90', partner: '4000' }), {
  fixed_price_amount: 4000, customer_fixed_price_amount: null, partner_urakka_margin_percent: null,
});
// Asiakashinnasta: 5 000 € × 90 % = 4 500 €, 500 € jää kumppanille
const calc = buildUrakkaReportPatch({ mode: 'from_customer', customer: '5000', partnerPercent: '90', partner: '' });
assert.deepEqual(calc, { fixed_price_amount: 4500, customer_fixed_price_amount: 5000, partner_urakka_margin_percent: 10 });
assert.deepEqual(computePartnerBillFromCustomerPrice(5000, 90), { partnerBill: 4500, partnerKeeps: 500 });
assert.deepEqual(computePartnerBillFromCustomerPrice(1234.56, 85), { partnerBill: 1049.38, partnerKeeps: 185.18 });
// Tyhjä asiakashinta → ei hintaa
assert.equal(buildUrakkaReportPatch({ mode: 'from_customer', customer: '', partnerPercent: '90', partner: '' }).fixed_price_amount, null);

// Yhteenveto: kaksi urakkakirjausta, hinta ensimmäisellä (kantaja)
const logs = [log('a', '2026-11-01', {}), log('b', '2026-11-05', { ...calc })];
const sum = summarizeReportUrakka(logs);
assert.equal(sum.carrierId, 'b');
assert.equal(sum.mode, 'from_customer');
assert.equal(sum.partnerPercent, 90);
assert.equal(sum.partnerTotal, 4500);
assert.equal(sum.customerTotal, 5000);
// Vanha: hinta kahdella päivällä → summa, tallennus yhdistää yhdelle ja tyhjentää muut
const legacy = [log('a', '2026-11-01', { fixed_price_amount: 1000 }), log('b', '2026-11-05', { fixed_price_amount: 3000 })];
const ls = summarizeReportUrakka(legacy);
assert.equal(ls.partnerTotal, 4000); assert.equal(ls.carrierId, 'a'); assert.equal(ls.mode, 'direct');
assert.deepEqual(urakkaLogsToClear(legacy, 'a'), ['b']);
assert.equal(urakkaPricePatchFromLog(log('z', '2026-11-01', {})), null);
// Ei urakkaa
assert.equal(summarizeReportUrakka([log('x', '2026-11-01', { entry_type: 'regular' })]).hasUrakka, false);
// Hinta ilman asiakashintaa urakkapäivillä: laskutus lasketaan kerran koko raportista
const merged = [log('a', '2026-11-01', {}), log('b', '2026-11-05', { fixed_price_amount: 4000 })];
assert.equal(partner(merged).grandTotal, 4000);
assert.equal(partner([log('a', '2026-11-01', { ...calc }), log('b', '2026-11-05', {})]).grandTotal, 4500);
import { buildUrakkaToggleUpdates, buildWarrantyToggleUpdates, reportWarrantyOn } from '../src/lib/workReportReportFlags.ts';
// Takuu koko raportille: tunnit, matkat, kulurivit, kylmäaine
const exp = (id, i, type = 'material') => ({ id, daily_log_id: 'a', expense_type: type, description: `Rivi ${i}`, qty: 1, unit_price: 10, sort_order: i });
const wlogs = [
  log('a', '2026-11-01', { entry_type: 'regular', partner_billing: null, expense_lines: [exp('e1', 0), exp('e2', 1)], refrigerant_lines: [{ id: 'r1', created_at: '2026-11-01T08:00:00Z' }] }),
  log('b', '2026-11-02', { entry_type: 'regular', partner_billing: null }),
];
assert.equal(reportWarrantyOn(wlogs), false);
const won = buildWarrantyToggleUpdates(wlogs, true);
assert.equal(won.length, 2);
assert.equal(won[0].patch.partner_billing.warranty, true);
assert.equal(won[0].patch.partner_billing.trips_warranty, true);
assert.equal(won[0].patch.partner_billing.refrigerant_flags[0].warranty, true);
assert.deepEqual(won[0].patch.customer_extra_billing.supply_line_flags.map((f) => f.warranty), [true, true]);
assert.equal(won[1].patch.customer_extra_billing, undefined);
// Takuu pois palauttaa kaiken (partner_billing → null)
const afterOn = wlogs.map((l, i) => ({ ...l, ...won[i].patch }));
assert.equal(reportWarrantyOn(afterOn), true);
const woff = buildWarrantyToggleUpdates(afterOn, false);
assert.equal(woff[0].patch.partner_billing, null);
assert.equal(woff[0].patch.customer_extra_billing.supply_line_flags[0].warranty, undefined);
// Urakka koko raportille: kaikki paitsi Lisälaskutus urakkapäiviksi, tunnit kalenteriin
const ulogs = [
  log('a', '2026-11-01', { entry_type: 'regular', hours_regular: 3, hours_overtime: 2 }),
  log('x', '2026-11-02', { entry_type: 'regular', partner_billing: { extra_billing: true } }),
  log('f', '2026-11-03', {}),
];
const uon = buildUrakkaToggleUpdates(ulogs, true);
assert.deepEqual(uon.map((u) => u.id), ['a']);
assert.equal(uon[0].patch.entry_type, 'fixed_price');
assert.equal(uon[0].patch.hours_regular, 5);
assert.equal(uon[0].patch.partner_billing.urakka_all_in, true);
const uoff = buildUrakkaToggleUpdates(ulogs, false);
assert.deepEqual(uoff.map((u) => u.id), ['f']);
assert.equal(uoff[0].patch.entry_type, 'regular');
assert.equal(uoff[0].patch.fixed_price_amount, null);
console.log('urakka report-level: OK');
