import assert from 'node:assert/strict';
import {
  buildHallintaGroups,
  buildServiceTiles,
  hallintaNavChildren,
  hallintaPageTitle,
  isGbaSectionId,
  legacyServicePath,
  managementScope,
  serviceNavChildren,
} from '../src/lib/hallintaNav.ts';

const base = { role: 'admin', isGlobalAdmin: false, billingModuleEnabled: true, partnershipsEnabled: true };
const titles = (ctx) => buildHallintaGroups({ ...base, ...ctx }).map((g) => [g.key, g.tiles.map((t) => t.title)]);

assert.deepEqual(titles({}), [
  ['oma', ['Omat tiedot']],
  ['yritys', ['Oma yritys', 'Käyttäjät', 'Tilaajaportaali', 'Asiakasportaali', 'Kumppanuudet', 'Kumppanilaskutus']],
]);
assert.deepEqual(titles({ role: 'technician' }), [['oma', ['Omat tiedot']]]);
assert.deepEqual(titles({ role: 'manager' }), [['oma', ['Omat tiedot']], ['yritys', ['Oma yritys']]]);
assert.deepEqual(titles({ partnershipsEnabled: false, billingModuleEnabled: false })[1][1], ['Oma yritys', 'Käyttäjät', 'Tilaajaportaali', 'Asiakasportaali']);
// Yrityksen hallinnassa ei koskaan globaaleja ruutuja, myöskään GBA:lle.
const companyHrefs = buildHallintaGroups({ ...base, isGlobalAdmin: true }).flatMap((g) => g.tiles).map((t) => t.href);
assert.deepEqual(titles({ isGlobalAdmin: true }), titles({}));
assert.ok(companyHrefs.every((h) => h.startsWith('/hallinta/')));
// Palvelun hallinta: vain GBA, vain globaalit ruudut.
assert.deepEqual(buildServiceTiles({ isGlobalAdmin: false }), []);
assert.deepEqual(buildServiceTiles({ isGlobalAdmin: true }).map((t) => t.href), [
  '/palvelu/yritykset',
  '/palvelu/tilaukset',
  '/palvelu/hinnasto',
  '/palvelu/rekisteri',
  '/palvelu/loki',
]);
for (const t of [...buildServiceTiles({ isGlobalAdmin: true }), ...buildHallintaGroups({ ...base, isGlobalAdmin: true }).flatMap((g) => g.tiles)]) {
  assert.ok(t.lines.length >= 1 && t.lines.length <= 3, t.title);
  assert.match(t.color, /^#[0-9a-f]{6}$/);
}
assert.deepEqual(
  hallintaNavChildren({ ...base, isGlobalAdmin: true }).map((c) => c.label),
  ['Omat tiedot', 'Oma yritys', 'Käyttäjät', 'Tilaajaportaali', 'Asiakasportaali', 'Kumppanuudet', 'Kumppanilaskutus'],
);
assert.deepEqual(serviceNavChildren({ isGlobalAdmin: true }).map((c) => c.label), ['Yritykset', 'Tilaukset', 'Hinnasto', 'Rekisterikorjaukset', 'Loki ja varmuuskopiot']);
assert.equal(hallintaPageTitle('/hallinta/yritys'), 'Oma yritys');
assert.equal(hallintaPageTitle('/palvelu/yritykset/abc'), 'Yritykset');
assert.equal(hallintaPageTitle('/palvelu/tilaukset/abc'), 'Tilaukset');
assert.equal(hallintaPageTitle('/palvelu/loki'), 'Loki ja varmuuskopiot');
assert.equal(hallintaPageTitle('/hallinta'), null);
assert.equal(hallintaPageTitle('/palvelu'), null);
assert.equal(isGbaSectionId('rekisteri'), true);
assert.equal(isGbaSectionId('companies'), false);
assert.equal(managementScope('/palvelu/hinnasto'), 'service');
assert.equal(managementScope('/palvelu'), 'service');
assert.equal(managementScope('/palveluX'), 'company');
assert.equal(managementScope('/hallinta/kayttajat'), 'company');
// Vanhat osoitteet → /palvelu.
const legacy = [
  ['/global-admin', '', '/palvelu'],
  ['/hallinta/global-admin', '', '/palvelu'],
  ['/hallinta/global-admin', '?osio=loki', '/palvelu/loki'],
  ['/hallinta/global-admin', '?osio=rekisteri', '/palvelu/rekisteri'],
  ['/hallinta/global-admin', '?osio=hinnoittelu', '/palvelu/hinnasto'],
  ['/hallinta/global-admin', '?osio=companies', '/palvelu/yritykset'],
  ['/global-admin', '?osio=yritykset', '/palvelu/yritykset'],
  ['/hallinta/global-admin/hinnasto', '', '/palvelu/hinnasto'],
  ['/hallinta/global-admin/tilaukset', '', '/palvelu/tilaukset'],
  ['/hallinta/global-admin/tilaukset/abc', '', '/palvelu/tilaukset/abc'],
  ['/hallinta/yritykset', '', '/palvelu/yritykset'],
  ['/hallinta/yritykset/c1', '?tab=kayttajat', '/palvelu/yritykset/c1?tab=kayttajat'],
];
for (const [p, q, want] of legacy) assert.equal(legacyServicePath(p, q), want, p + q);
for (const p of ['/hallinta', '/hallinta/yritys', '/hallinta/kayttajat', '/hallinta/omat', '/hallinta/yritysx']) assert.equal(legacyServicePath(p), null, p);
// Portaalit: yrityksen ylläpitäjä ja GBA (oma yritys), ei Palvelun hallinnassa.
assert.deepEqual(titles({ role: 'technician', isGlobalAdmin: true }).find((g) => g[0] === 'yritys')[1], ['Tilaajaportaali', 'Asiakasportaali']);
assert.ok(!buildServiceTiles({ isGlobalAdmin: true }).some((t) => /portaali/i.test(t.title)));
assert.equal(hallintaPageTitle('/hallinta/asiakasportaali'), 'Asiakasportaali');
console.log('hallinta-nav: ok');
