import assert from 'node:assert/strict';
import { calculateWorkReportBillable, extraBillingTotal } from '../src/lib/workReportBilling.ts';

import { calculateWorkReportCustomerBillable } from '../src/lib/workReportCustomerBilling.ts';
import {
  previewPartnerUrakkaAmount,
  resolveUrakkaCustomerAmount,
  resolveUrakkaPartnerAmount,
} from '../src/lib/workReportUrakkaBilling.ts';

const rates = { hourly_regular: 55, hourly_overtime: 82.5, hourly_on_call: 110 };
const user = { id: 'u1', display_name: 'Enn', bill_hours_enabled: true, bill_expenses_enabled: true };

function log(id, date, extra) {
  return {
    id, work_report_id: 'r1', log_date: date, log_start_time: '08:00', entry_type: 'regular',
    hours_regular: 8, hours_overtime: 0, hours_on_call: 0, hours_agreed_regular: 0,
    created_by: 'u1', created_at: `${date}T08:00:00Z`, fixed_price_amount: null,
    customer_fixed_price_amount: null, partner_urakka_margin_percent: null,
    commission_amount: 0, commission_note: null, work_done: 'Työ', partner_billing: null,
    customer_extra_billing: {}, expense_lines: [], trip_legs: [], refrigerant_lines: [], author: null,
    ...extra,
  };
}
const partner = (logs) =>
  calculateWorkReportBillable({ logs, users: [user], rates, ratesSource: 'partnership', billToCompanyId: 'c2', billToCompanyName: 'X' });
const customer = (logs) =>
  calculateWorkReportCustomerBillable({ logs, rates, ratesSource: 'company', customerName: 'Asiakas' });

// Hämeentie 31: 19.10 urakka (vanha yksi hinta 2500), 20.10 tavalliset 8 h.
const urakka = log('d19', '2026-10-19', { entry_type: 'fixed_price', fixed_price_amount: 2500 });
const before = partner([urakka, log('d20', '2026-10-20', {})]);
assert.equal(before.grandTotal, 2940); // 2500 + 8 h × 55 = tunnit urakan päälle (käyttäjän tekemä tavallinen kirjaus)

// 20.10 urakkapäivänä 0 €: lasketaan vain kerran.
for (const zero of [{ customer_fixed_price_amount: 0, fixed_price_amount: 0 }, { customer_fixed_price_amount: null, fixed_price_amount: null }, { customer_fixed_price_amount: 0, fixed_price_amount: null }]) {
  const day = log('d20', '2026-10-20', { entry_type: 'fixed_price', ...zero });
  const p = partner([urakka, day]);
  assert.equal(p.grandTotal, 2500);
  assert.equal(p.byUser[0].hoursTotal, 0);
  assert.equal(p.byUser[0].fixedTotal, 2500);
  assert.equal(p.byUser[0].lines.filter((l) => l.kind === 'fixed_price').length, 1);
  const c = customer([urakka, day]);
  assert.equal(c.grandTotal, 2500);
  assert.equal(c.byUser[0].hoursTotal, 0);
  assert.equal(resolveUrakkaCustomerAmount(day), null);
  assert.equal(resolveUrakkaPartnerAmount(day), null);
}

// Asiakashinta 2500, provisio 10 % → kumppani 2250, asiakas 2500; 0 €-päivä ei lisää mitään.
const split = log('d19', '2026-10-19', { entry_type: 'fixed_price', customer_fixed_price_amount: 2500, fixed_price_amount: 2250, partner_urakka_margin_percent: 10 });
const zeroDay = log('d20', '2026-10-20', { entry_type: 'fixed_price', customer_fixed_price_amount: 0, fixed_price_amount: 0, partner_urakka_margin_percent: 10 });
assert.equal(partner([split, zeroDay]).grandTotal, 2250);
assert.equal(customer([split, zeroDay]).grandTotal, 2500);
// Vanha rivi: asiakashinta ilman kumppanihintaa → lasketaan provisiolla.
assert.equal(resolveUrakkaPartnerAmount({ entry_type: 'fixed_price', customer_fixed_price_amount: 1000, fixed_price_amount: null, partner_urakka_margin_percent: null }), 900);

// Dialogin esikatselu: vain tämä kirjaus.
const f = (o) => ({ partner_urakka_manual: false, fixed_price_amount: '', customer_fixed_price_amount: '', partner_urakka_margin_percent: '10', ...o });
assert.equal(previewPartnerUrakkaAmount(f({})), 0);
assert.equal(previewPartnerUrakkaAmount(f({ customer_fixed_price_amount: '0', fixed_price_amount: '2500' })), 0);
assert.equal(previewPartnerUrakkaAmount(f({ customer_fixed_price_amount: '2500' })), 2250);
assert.equal(previewPartnerUrakkaAmount(f({ customer_fixed_price_amount: '2500', partner_urakka_margin_percent: '0' })), 2500);
assert.equal(previewPartnerUrakkaAmount(f({ partner_urakka_manual: true, fixed_price_amount: '0' })), 0);

// Lisälaskutus: urakka 2500 + 2 h × 55 + materiaali 100 = 2710; provisio 10 € erikseen päälle.
const extra = log('x1', '2026-10-21', {
  hours_regular: 2, partner_billing: { extra_billing: true },
  expense_lines: [{ id: 'm1', description: 'Materiaali', expense_type: 'material', qty: 1, unit_price: 100 }],
});
const withExtra = partner([urakka, log('d20', '2026-10-20', { entry_type: 'fixed_price', hours_regular: 8, fixed_price_amount: 0, customer_fixed_price_amount: 0 }), extra]);
assert.equal(withExtra.grandTotal, 2710);
assert.equal(extraBillingTotal(withExtra), 210);
assert.equal(withExtra.byUser[0].lines.filter((l) => l.extraBilling).length, 2);
const withCommission = partner([urakka, { ...extra, commission_amount: 10 }]);
assert.equal(withCommission.grandTotal, 2720);
assert.equal(extraBillingTotal(withCommission), 210);
assert.equal(withCommission.byUser[0].lines.find((l) => l.kind === 'commission').extraBilling, undefined);

console.log('urakka zero-day billing OK');
