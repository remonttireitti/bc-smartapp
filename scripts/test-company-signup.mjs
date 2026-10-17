import assert from 'node:assert/strict';
import {
  cleanSignup,
  estimateMonthly,
  isValidBusinessId,
  normalizeBusinessId,
  parsePriceList,
  primaryRole,
  signupSelection,
  userMonthlyPrice,
  validateSignup,
  VAT_RATE,
} from '../supabase/functions/_shared/companySignupCore.ts';
import { companyPricedSelection } from '../src/lib/companyMonthlyPrice.ts';
import { chunkStoragePaths, parseDemoStatus } from '../src/lib/onboardingDemoData.ts';
import { partnershipsFeatureEnabled, partnershipsModuleLicensed } from '../src/lib/partnershipsModule.ts';
import { companyPartnershipsEnabled } from '../src/lib/management.ts';
import { buildMainNav } from '../src/lib/mainNav.ts';
import { buildHallintaGroups, hallintaPageTitle } from '../src/lib/hallintaNav.ts';

// --- Y-tunnus ---
for (const ok of ['0112038-9', '2908079-6', '2801074-5', '1572860-0', '0737546-2']) {
  assert.equal(isValidBusinessId(ok), true, ok);
}
assert.equal(isValidBusinessId('0112038-8'), false, 'väärä tarkiste');
assert.equal(isValidBusinessId('2908079-5'), false);
assert.equal(isValidBusinessId('290807-96'), false, 'väärä muoto');
assert.equal(isValidBusinessId('abc'), false);
assert.equal(isValidBusinessId(''), false);
assert.equal(normalizeBusinessId(' 29080796 '), '2908079-6');
assert.equal(normalizeBusinessId('737546-2'), '0737546-2', 'vanha 6-numeroinen täydennetään');
assert.equal(isValidBusinessId('737546-2'), true);
// jakojäännös 1 → ei kelvollista tarkistetta: 0000001 → 2*1=2 ... etsitään sellainen
{
  const weights = [7, 9, 10, 5, 8, 4, 2];
  let found = null;
  for (let n = 1; n < 2000 && !found; n++) {
    const d = String(n).padStart(7, '0');
    const sum = d.split('').reduce((s, c, i) => s + Number(c) * weights[i], 0);
    if (sum % 11 === 1) found = d;
  }
  for (let c = 0; c <= 9; c++) assert.equal(isValidBusinessId(`${found}-${c}`), false, `rem 1: ${found}-${c}`);
}

// --- Hinnasto ---
const prices = parsePriceList({
  base_monthly_eur: '49.00',
  module_prices: { quotes: 10, billing: 10, remote_monitoring: 30, tools: 10, partners: 12.5 },
  huolto_prices: { kylma: 10, lvi: 8, iv: 8, sahko: 9.9 },
  role_prices: { admin: 0, manager: 15, technician: 10 },
});
assert.equal(prices.base_monthly_eur, 49);
assert.equal(prices.module_prices.partners, 12.5);
const defaults = parsePriceList({ base_monthly_eur: 49, module_prices: { quotes: 10 } });
assert.deepEqual(defaults.role_prices, { admin: 0, manager: 15, technician: 10 }, 'oletukset ennen SQL:ää');
assert.equal(defaults.module_prices.partners, 10);

// Monirooli: kerran, kalleimman roolin hinta
assert.equal(userMonthlyPrice(['admin'], prices), 0);
assert.equal(userMonthlyPrice(['admin', 'technician'], prices), 10);
assert.equal(userMonthlyPrice(['admin', 'manager'], prices), 15);
assert.equal(userMonthlyPrice(['admin', 'manager', 'technician'], prices), 15);
assert.equal(userMonthlyPrice([], prices), 0);
assert.equal(primaryRole(['technician', 'admin']), 'admin');
assert.equal(primaryRole(['technician', 'manager']), 'manager');
assert.equal(primaryRole(['technician']), 'technician');

const sel = {
  base: true,
  modules: { billing: true, partners: true },
  huolto: { kylma: true, sahko: true },
  users: [
    { roles: ['admin'] }, // 0
    { roles: ['admin', 'technician'] }, // 10
    { roles: ['technician'] }, // 10
    { roles: ['manager', 'admin'] }, // 15
  ],
};
const est = estimateMonthly(sel, prices);
// 49 + 10 + 12.5 + 10 + 9.9 + 0 + 10 + 10 + 15 = 126.40
assert.equal(est.net, 126.4);
assert.equal(est.vat, 32.23, '126,40 × 25,5 % = 32,232 → 32,23');
assert.equal(est.gross, 158.63);
assert.equal(VAT_RATE, 0.255);
const tech = est.lines.find((l) => l.key === 'role:technician');
assert.deepEqual([tech.qty, tech.unit, tech.total], [2, 10, 20], 'admin+asentaja laskutetaan asentajana');
assert.equal(est.lines.find((l) => l.key === 'role:manager').total, 15);
assert.equal(est.lines.find((l) => l.key === 'role:admin').total, 0);
// summarivi = rivien summa
assert.equal(Math.round(est.lines.reduce((s, l) => s + l.total, 0) * 100) / 100, est.net);
// Ylläpitäjärivi 0 € ei vaikuta, mutta näkyy (qty>0, total 0)
assert.ok(est.lines.some((l) => l.key === 'role:admin'));

// Pyöristys: 3 × 9,99 → 29,97; alv 7,64235 → 7,64
const p2 = parsePriceList({ base_monthly_eur: 0, role_prices: { admin: 9.99, manager: 9.99, technician: 9.99 } });
const e2 = estimateMonthly({ base: false, modules: {}, huolto: {}, users: [{ roles: ['admin'] }, { roles: ['manager'] }, { roles: ['technician'] }] }, p2);
assert.equal(e2.net, 29.97);
assert.equal(e2.vat, 7.64);
assert.equal(e2.gross, 37.61);

// --- Lomakkeen validointi ---
const good = {
  company_name: 'Testi Oy',
  business_id: '2908079-6',
  address: 'Katu 1',
  postal_code: '00100',
  city: 'Helsinki',
  contact_name: 'Matti',
  email: 'matti@example.com',
  phone: '040 123 4567',
  modules: { quotes: false, billing: true, remote_monitoring: false, tools: false, partners: false },
  huolto: { kylma: true, lvi: false, iv: false, sahko: false },
  users: [
    { name: 'Matti', email: 'matti@example.com', phone: '', roles: ['admin', 'technician'] },
    { name: 'Liisa', email: 'liisa@example.com', phone: '0401234567', roles: ['technician'] },
  ],
  message: '',
};
assert.deepEqual(validateSignup(good), {});
assert.ok(validateSignup({ ...good, business_id: '2908079-5' }).business_id);
assert.ok(validateSignup({ ...good, postal_code: '0010' }).postal_code);
assert.ok(validateSignup({ ...good, email: 'x@y' }).email);
assert.ok(validateSignup({ ...good, users: [] }).users);
assert.match(
  validateSignup({ ...good, users: good.users.map((u) => ({ ...u, roles: ['technician'] })) }).users,
  /Ylläpitäjä/,
  'vähintään yksi ylläpitäjä',
);
assert.ok(validateSignup({ ...good, users: [good.users[0], { ...good.users[1], email: 'MATTI@example.com' }] })['users.1.email'], 'duplikaatti');
assert.ok(validateSignup({ ...good, users: [good.users[0], { ...good.users[1], roles: [] }] })['users.1.roles']);
const cleaned = cleanSignup({ ...good, business_id: '29080796', email: ' Matti@Example.com ', users: [{ ...good.users[0], roles: ['technician', 'bogus', 'admin'] }] });
assert.equal(cleaned.business_id, '2908079-6');
assert.equal(cleaned.email, 'matti@example.com');
assert.deepEqual(cleaned.users[0].roles, ['admin', 'technician']);
assert.equal(estimateMonthly(signupSelection(cleaned), prices).net, 49 + 10 + 10 + 10);

// --- Yrityksen kuukausihinta ---
const companySettings = {
  partnerships_enabled: true,
  license: { enrollment: 'subscription', base_active: true, modules: { quotes: true, billing: false, partners: false } },
  huolto: { enabled: true, types: { lvi: { enabled: true }, 'lämpöpumppu': { enabled: true } } },
};
const cs = companyPricedSelection(companySettings, [
  { role: 'admin', staff_roles: ['technician'] },
  { role: 'technician', staff_roles: null },
  { role: 'customer' },
]);
assert.equal(cs.base, true);
assert.equal(cs.modules.quotes, true);
assert.equal(cs.modules.partners, false, 'moduuli pois vaikka asetus päällä');
assert.equal(cs.huolto.kylma, true);
assert.equal(cs.huolto.lvi, true);
assert.equal(cs.huolto.iv, false);
assert.equal(cs.users.length, 2, 'asiakaskäyttäjä ei maksa');
assert.equal(estimateMonthly(cs, prices).net, 49 + 10 + 10 + 8 + 10 + 10);

// --- Kumppanuudet-moduuli ---
assert.equal(partnershipsModuleLicensed({}), true, 'vanha yritys ilman avainta');
assert.equal(partnershipsModuleLicensed({ license: { modules: { partners: false } } }), false);
assert.equal(partnershipsFeatureEnabled({ partnerships_enabled: true }), true);
assert.equal(partnershipsFeatureEnabled({ partnerships_enabled: true, license: { modules: { partners: false } } }), false);
assert.equal(partnershipsFeatureEnabled({ partnerships_enabled: false, license: { modules: { partners: true } } }), false);
assert.equal(companyPartnershipsEnabled({ partnerships_enabled: true, license: { modules: { partners: false } } }), false);

const navCtx = {
  license: null,
  billingModuleEnabled: true,
  role: 'admin',
  isGlobalAdmin: true,
  globalAdminMode: true,
};
const hallinta = (ctx) => buildMainNav(ctx).find((i) => i.key === 'admin').children.map((c) => c.href);
assert.ok(hallinta({ ...navCtx, partnershipsEnabled: true }).includes('/hallinta/kumppanilaskutus'));
assert.ok(!hallinta({ ...navCtx, partnershipsEnabled: false }).includes('/hallinta/kumppanilaskutus'));
assert.ok(!hallinta({ ...navCtx, partnershipsEnabled: false }).includes('/hallinta/kumppanuudet'));
const gbaTiles = (ctx) => buildHallintaGroups(ctx).flatMap((g) => g.tiles).map((t) => t.href);
assert.ok(gbaTiles({ ...navCtx, partnershipsEnabled: true }).includes('/hallinta/global-admin/tilaukset'));
assert.ok(!gbaTiles({ ...navCtx, partnershipsEnabled: true, isGlobalAdmin: false }).includes('/hallinta/global-admin/tilaukset'));
assert.ok(!gbaTiles({ ...navCtx, partnershipsEnabled: false }).includes('/hallinta/kumppanilaskutus'));
assert.equal(hallintaPageTitle('/hallinta/global-admin/tilaukset/abc'), 'Tilaukset');

// --- Esimerkkitiedot ---
assert.deepEqual(
  chunkStoragePaths(
    [
      { bucket: 'a', path: '1' },
      { bucket: 'a', path: '1' },
      { bucket: 'b', path: '2' },
      { bucket: 'a', path: '3' },
      { bucket: '', path: 'x' },
    ],
    1,
  ),
  [
    { bucket: 'a', paths: ['1'] },
    { bucket: 'a', paths: ['3'] },
    { bucket: 'b', paths: ['2'] },
  ],
);
assert.equal(chunkStoragePaths(Array.from({ length: 250 }, (_, i) => ({ bucket: 'a', path: String(i) }))).length, 3);
assert.deepEqual(parseDemoStatus({ has_demo: true, customers: 1, reports: 1, equipment: 1, maintenance_reports: 3 }), {
  hasDemo: true,
  customerCount: 1,
  reportCount: 1,
  equipmentCount: 1,
  maintenanceReportCount: 3,
});

console.log('test-company-signup OK');
