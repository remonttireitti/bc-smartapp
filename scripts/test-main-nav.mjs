import assert from 'node:assert/strict';
import { activeMainNavChild, buildMainNav, isMainNavItemActive, routeHidesSidebar } from '../src/lib/mainNav.ts';

const base = { license: null, billingModuleEnabled: true, partnershipsEnabled: true, role: 'admin', isGlobalAdmin: false, globalAdminMode: false };
const labels = (ctx) => buildMainNav({ ...base, ...ctx }).map((i) => i.label);

assert.deepEqual(labels({}), ['Työraportti', 'Laskutus', 'Huoltoraportti', 'Asiakkaat', 'Tarjouspyyntö', 'Varasto', 'Etäohjaus ja seuranta', 'Työkalut', 'Hallinta']);
// Billing module off/unknown => no Laskutus, no Kumppanilaskutus under Hallinta.
for (const v of [false, null, undefined]) {
  const nav = buildMainNav({ ...base, billingModuleEnabled: v });
  assert.ok(!nav.some((i) => i.key === 'billing'));
  assert.ok(!nav.find((i) => i.key === 'admin').children.some((c) => c.href.includes('kumppanilaskutus')));
}
// Non-admin: only Omat tiedot; manager also Yritystiedot.
assert.deepEqual(buildMainNav({ ...base, role: 'technician' }).find((i) => i.key === 'admin').children.map((c) => c.label), ['Omat tiedot']);
assert.deepEqual(buildMainNav({ ...base, role: 'manager' }).find((i) => i.key === 'admin').children.map((c) => c.label), ['Omat tiedot', 'Yritystiedot']);
// Global admin tab only when GBA mode on.
assert.ok(buildMainNav({ ...base, isGlobalAdmin: true, globalAdminMode: true }).find((i) => i.key === 'admin').children.some((c) => c.label === 'Globaali admin'));
assert.ok(!buildMainNav({ ...base, isGlobalAdmin: true }).find((i) => i.key === 'admin').children.some((c) => c.label === 'Globaali admin'));
// Partnerships off => no Kumppanuudet, billing has no sub-modes.
const np = buildMainNav({ ...base, partnershipsEnabled: false });
assert.equal(np.find((i) => i.key === 'billing').children.length, 0);
assert.ok(!np.find((i) => i.key === 'admin').children.some((c) => c.label === 'Kumppanuudet'));
// License gating (subscription without quotes).
const lic = { enrollment: 'subscription', effective_status: 'active', status: 'active', modules: {} };
const gated = buildMainNav({ ...base, license: lic }).map((i) => i.key);
assert.ok(gated.includes('admin'));

// Active detection.
const nav = buildMainNav(base);
const q = nav.find((i) => i.key === 'quotes');
assert.ok(isMainNavItemActive(q, '/asennus-suunnittelu/lista'));
assert.equal(activeMainNavChild(q, '/asennus-suunnittelu/abc', '').label, 'Asennus suunnittelu');
assert.equal(activeMainNavChild(q, '/tarjouspyynnot', ''), null);
const w = nav.find((i) => i.key === 'work');
assert.equal(activeMainNavChild(w, '/tyoraportit/uusi', '').label, 'Uusi työraportti');
assert.equal(activeMainNavChild(w, '/tyoraportit/123', '').label, 'Työraportit');
const v = nav.find((i) => i.key === 'inventory');
assert.equal(activeMainNavChild(v, '/varasto', '?tab=materials').label, 'Materiaalit');
assert.ok(!isMainNavItemActive(w, '/tyoraportitx'));

// Routes without sidebar.
for (const p of ['/tyoraportit/1/tuloste', '/tyoraportit/1/laskutus/tuloste', '/etaseuranta/luku', '/etaseuranta/luku/vrf/x', '/seuranta/luku/t', '/j/t', '/tyoraportti/jako/t', '/tyokalut/varaus/tok', '/etaseuranta/lampotila/raportit/r/tuloste']) {
  assert.ok(routeHidesSidebar(p), p);
}
for (const p of ['/', '/tyoraportit', '/tyokalut/varaus', '/etaseuranta/vrf/1', '/hallinta/omat']) {
  assert.ok(!routeHidesSidebar(p), p);
}
console.log('test-main-nav: ok');
