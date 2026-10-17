import assert from 'node:assert/strict';
import { buildHallintaGroups, hallintaNavChildren, hallintaPageTitle, isGbaSectionId } from '../src/lib/hallintaNav.ts';

const base = { role: 'admin', isGlobalAdmin: false, globalAdminMode: false, billingModuleEnabled: true, partnershipsEnabled: true };
const titles = (ctx) => buildHallintaGroups({ ...base, ...ctx }).map((g) => [g.key, g.tiles.map((t) => t.title)]);

assert.deepEqual(titles({}), [
  ['oma', ['Omat tiedot']],
  ['yritys', ['Oma yritys', 'Käyttäjät', 'Tilaajat', 'Kumppanuudet', 'Kumppanilaskutus']],
]);
assert.deepEqual(titles({ role: 'technician' }), [['oma', ['Omat tiedot']]]);
assert.deepEqual(titles({ role: 'manager' }), [['oma', ['Omat tiedot']], ['yritys', ['Oma yritys']]]);
assert.deepEqual(titles({ partnershipsEnabled: false, billingModuleEnabled: false })[1][1], ['Oma yritys', 'Käyttäjät', 'Tilaajat']);
// GBA vain tilan ollessa päällä.
assert.equal(titles({ isGlobalAdmin: true }).length, 2);
const gba = buildHallintaGroups({ ...base, isGlobalAdmin: true, globalAdminMode: true }).find((g) => g.key === 'gba');
assert.deepEqual(gba.tiles.map((t) => t.href), [
  '/hallinta/yritykset',
  '/hallinta/global-admin/tilaukset',
  '/hallinta/global-admin/hinnasto',
  '/hallinta/global-admin?osio=rekisteri',
  '/hallinta/global-admin?osio=loki',
]);
// Kaikilla ruuduilla lyhyet rivit (1–3) ja väri.
for (const t of buildHallintaGroups({ ...base, isGlobalAdmin: true, globalAdminMode: true }).flatMap((g) => g.tiles)) {
  assert.ok(t.lines.length >= 1 && t.lines.length <= 3, t.title);
  assert.match(t.color, /^#[0-9a-f]{6}$/);
}
// Sivuvalikko: GBA-osioista vain Yritykset.
assert.deepEqual(
  hallintaNavChildren({ ...base, isGlobalAdmin: true, globalAdminMode: true }).map((c) => c.label),
  ['Omat tiedot', 'Oma yritys', 'Käyttäjät', 'Tilaajat', 'Kumppanuudet', 'Kumppanilaskutus', 'Yritykset'],
);
assert.equal(hallintaPageTitle('/hallinta/yritys'), 'Oma yritys');
assert.equal(hallintaPageTitle('/hallinta/yritykset/abc'), 'Yritykset');
assert.equal(hallintaPageTitle('/hallinta/global-admin', '?osio=loki'), 'Loki ja varmuuskopiot');
assert.equal(hallintaPageTitle('/hallinta'), null);
assert.equal(isGbaSectionId('rekisteri'), true);
assert.equal(isGbaSectionId('companies'), false);
console.log('hallinta-nav: ok');
