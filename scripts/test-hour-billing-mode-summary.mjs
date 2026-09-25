/** Tuntien laskutustapa -rivin tiivis yhteenveto (oletuksena suljettu osio raportilla). */
import assert from 'node:assert/strict';
import { hourBillingModeSummary } from '../src/lib/workReportHourBilling.ts';

const manual = { partner_mode: 'manual', customer_mode: 'manual' };
assert.equal(hourBillingModeSummary(manual, { showPartner: true, showCustomer: false }), 'Manuaalinen (syötetyt tuntityypit)');
assert.equal(hourBillingModeSummary(manual, { showPartner: true, showCustomer: true }), 'Manuaalinen (syötetyt tuntityypit)');

const mixed = { partner_mode: 'daily_overtime', customer_mode: 'all_regular' };
assert.equal(
  hourBillingModeSummary(mixed, { showPartner: true, showCustomer: true }),
  'Kumppani: Päivittäinen ylityölaskenta (8 h + porrastus) · Asiakas: Kaikki normaalihintaisina',
);
assert.equal(hourBillingModeSummary(mixed, { showPartner: false, showCustomer: true }), 'Kaikki normaalihintaisina');
assert.equal(hourBillingModeSummary(mixed, { showPartner: true, showCustomer: false }), 'Päivittäinen ylityölaskenta (8 h + porrastus)');

console.log('test-hour-billing-mode-summary: OK');
