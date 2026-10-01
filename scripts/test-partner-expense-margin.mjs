/**
 * Regressio: "Kumppanin kate (%)" (Laskutetaan kumppanilta) pomppasi takaisin 80 %:iin.
 * Syy: tallennus kirjoitti DB-sarakkeeseen customer_margin_percent tarvikkeiden oletuksen 80 %,
 * ja lataus luki kumppanin katteen samasta sarakkeesta.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
import {
  emptyExpense,
  expenseMarginPercentForSave,
  expensesToDrafts,
  normalizeExpenseDraftsForSave,
  partnerExpenseMarginFromLine,
  patchExpenseDraft,
  resolvePartnerExpenseMarginPercent,
} from '../src/lib/dailyLogExpenseDraft.ts';
import { applyExpenseBillingMode } from '../src/lib/workReportExpenseBilling.ts';
import { calculateWorkReportBillable } from '../src/lib/workReportBilling.ts';

/** Sama tallennusmuoto kuin WorkReportDetailPage.saveExpenseLines (olennaiset kentät). */
function saveRow(row, id) {
  const [normalized] = normalizeExpenseDraftsForSave([row]);
  const customer = String(normalized.customer_unit_price ?? '').trim();
  return {
    id,
    expense_type: normalized.expense_type,
    description: normalized.description,
    qty: Number(normalized.qty || 1),
    unit_price: Number(normalized.unit_price || 0),
    bill_to_partner: normalized.bill_to_partner,
    bill_to_customer: normalized.bill_to_customer,
    customer_unit_price: customer && Number(customer) > 0 ? Number(customer) : null,
    customer_margin_percent: expenseMarginPercentForSave(normalized),
    extra_billable: false,
    extra_billing_allowed: false,
  };
}
const roundTrip = (row, id = 'e1') => expensesToDrafts([saveRow(row, id)])[0];

// Uusi rivi: oletukset 10 % (kumppani) ja 80 % (tarvike)
const fresh = emptyExpense();
assert.equal(fresh.partner_expense_margin_percent, '10');
assert.equal(fresh.customer_margin_percent, '80');

for (const type of ['other', 'material', 'part', 'parking', 'device']) {
  // Laskutetaan kumppanilta, kirjoitetaan kate merkki kerrallaan: arvo säilyy
  let row = { ...emptyExpense(), expense_type: type, description: `Rivi ${type}`, unit_price: '100' };
  row = patchExpenseDraft(row, {}); // asiakashinta oletuskatteella
  assert.equal(row.customer_unit_price, '111.11', `${type}: oletus 10 %`);
  for (const typed of ['', '3', '35']) {
    row = patchExpenseDraft(row, { partner_expense_margin_percent: typed });
    assert.equal(row.partner_expense_margin_percent, typed, `${type}: kirjoitettu arvo pysyy (${typed})`);
  }
  assert.equal(row.customer_unit_price, '153.85', `${type}: asiakashinta 35 %:lla`);
  // Tallennus + lataus: 35 % säilyy (ei 80 %)
  const loaded = roundTrip(row);
  assert.equal(loaded.partner_expense_margin_percent, '35', `${type}: lataus säilyttää 35 %`);
  assert.equal(loaded.customer_unit_price, '153.85');
  // Uudelleenmuokkaus (esim. hinta) käyttää tallennettua katetta, ei 80 %
  const repriced = patchExpenseDraft(loaded, { unit_price: '200' });
  assert.equal(repriced.customer_unit_price, '307.69', `${type}: uusi hinta 35 %:lla`);
  // Tyypin vaihto ei nollaa käyttäjän katetta
  const retyped = patchExpenseDraft(loaded, { expense_type: type === 'other' ? 'parking' : 'other' });
  assert.equal(retyped.partner_expense_margin_percent, '35');
}

// 0 % on sallittu (ei oletusta): asiakashinta = kumppanihinta
let zero = patchExpenseDraft({ ...emptyExpense(), expense_type: 'other', description: 'Nolla', unit_price: '50' }, { partner_expense_margin_percent: '0' });
assert.equal(resolvePartnerExpenseMarginPercent(zero), 0);
assert.equal(zero.customer_unit_price, '50');
assert.equal(roundTrip(zero).partner_expense_margin_percent, '0');
// Tyhjä → oletus 10 % laskennassa ja tallennuksessa
const empty = patchExpenseDraft({ ...emptyExpense(), expense_type: 'other', description: 'Tyhjä', unit_price: '100' }, { partner_expense_margin_percent: '' });
assert.equal(empty.customer_unit_price, '111.11');
assert.equal(expenseMarginPercentForSave(empty), 10);
assert.equal(roundTrip(empty).partner_expense_margin_percent, '10');
// Ilman kumppanihintaa kate säilyy silti
const noPrice = { ...emptyExpense(), expense_type: 'other', description: 'Ei hintaa', partner_expense_margin_percent: '25' };
assert.equal(roundTrip(noPrice).partner_expense_margin_percent, '25');

// Vanhat rivit (tallennettu 80 % tarvikeoletus): kate päätellään hinnoista
assert.equal(partnerExpenseMarginFromLine({ unit_price: 100, customer_unit_price: 111.11, customer_margin_percent: 80 }), 10);
assert.equal(partnerExpenseMarginFromLine({ unit_price: 100, customer_unit_price: 153.85, customer_margin_percent: 80 }), 35);
assert.equal(partnerExpenseMarginFromLine({ unit_price: 0, customer_unit_price: null, customer_margin_percent: 80 }), 10);
assert.equal(partnerExpenseMarginFromLine({ unit_price: 100, customer_unit_price: 500, customer_margin_percent: 80 }), 80, 'tarkoituksella 80 %');
assert.equal(partnerExpenseMarginFromLine({ unit_price: 7, customer_unit_price: 10.45, customer_margin_percent: 33 }), 33, 'pyöristys ei muuta tallennettua');
assert.equal(
  expensesToDrafts([{ id: 'old', expense_type: 'other', description: 'Vanha', qty: 1, unit_price: 100, bill_to_partner: true, bill_to_customer: true, customer_unit_price: 111.11, customer_margin_percent: 80 }])[0].partner_expense_margin_percent,
  '10',
);

// Muut laskutustavat: tarvikkeen kate-% säilyy kuten ennen
let supply = applyExpenseBillingMode({ ...emptyExpense(), expense_type: 'material', description: 'Tarvike', unit_price: '100' }, 'customer_only');
supply = patchExpenseDraft(supply, { customer_margin_percent: '40' });
assert.equal(expenseMarginPercentForSave(supply), 40);
const supplyLoaded = roundTrip(supply);
assert.equal(supplyLoaded.customer_margin_percent, '40');
assert.equal(supplyLoaded.partner_expense_margin_percent, '10');
const supplyZero = roundTrip(patchExpenseDraft(supply, { customer_margin_percent: '0' }));
assert.equal(supplyZero.customer_margin_percent, '0');
const included = applyExpenseBillingMode({ ...emptyExpense(), expense_type: 'other', description: 'Urakka', unit_price: '20', customer_margin_percent: '55' }, 'included_in_contract');
assert.equal(roundTrip(included).customer_margin_percent, '55');
assert.equal(roundTrip(included).partner_expense_margin_percent, '10', 'ei 80 % kun vaihdetaan kumppanilta laskutettavaksi');
// Kumppanilta laskutettavaksi vaihdettu rivi saa oletuksen 10 %, ei tarvikkeen 80 %
const switched = patchExpenseDraft(applyExpenseBillingMode(roundTrip(included), 'partner_and_customer'), {});
assert.equal(switched.partner_expense_margin_percent, '10');
assert.equal(switched.customer_unit_price, '22.22');

// Laskenta: kumppanilasku = kumppanihinta, asiakashinta tallennetusta katteesta
const calcRow = saveRow(patchExpenseDraft({ ...emptyExpense(), expense_type: 'other', description: 'Nosturi', unit_price: '230' }, { partner_expense_margin_percent: '20' }), 'c1');
assert.equal(calcRow.customer_unit_price, 287.5);
assert.equal(calcRow.customer_margin_percent, 20);
const calc = calculateWorkReportBillable({
  logs: [{ id: 'l1', log_date: '2026-10-01', entry_type: 'regular', hours_regular: 0, created_by: 'u1', expense_lines: [calcRow] }],
  users: [{ id: 'u1', display_name: 'A', bill_hours_enabled: true, bill_expenses_enabled: true }],
  rates: { hourly_regular: 50 },
  ratesSource: 'partnership',
  billToCompanyId: 'o',
  billToCompanyName: 'O',
});
assert.equal(calc.grandTotal, 230);

// Tallennus käyttää uutta apufunktiota
const page = readFileSync(new URL('../src/pages/WorkReportDetailPage.tsx', import.meta.url), 'utf8');
assert.match(page, /const saveMargin = expenseMarginPercentForSave\(row\);/);

console.log('partner expense margin OK');
