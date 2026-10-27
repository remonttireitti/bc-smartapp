import assert from 'node:assert/strict';
import { fieldModuleCompletion, fieldModuleFieldArchived, fieldModuleFieldVisible, findFieldModule, kylmioEvaporatorOhjausShared } from '../src/lib/huoltoRaportti/fieldModules';

const def = findFieldModule('ohjaukset')!;
const vis = (form: any) => def.fields.filter((f) => fieldModuleFieldVisible(f, form.kenttaModuulit?.ohjaukset ?? {}, form)).map((f) => f.id);
// Vanha raportti: yksi säädin + arvot → näkyvät (yhteinen ohjaus), valmis.
const old = { laiteTyyppi: 'pakastin', evaporatorData: [{}], kenttaModuulit: { ohjaukset: { saadin: 'Danfoss', asetusarvo: '-20', halytysYla: '-15', halytykset: 'Kunnossa', ovi: 'Kunnossa' } } };
assert.ok(kylmioEvaporatorOhjausShared(old));
assert.deepEqual(vis(old).filter((id) => ['saadin', 'asetusarvo', 'halytysYla', 'ovi'].includes(id)).length, 4);
assert.ok(vis(old).includes('hoyrystinOhjaus'));
assert.equal(fieldModuleCompletion(old, 'ohjaukset'), 'ok');
// Kaksi höyrystintä: valinta pakollinen.
const two = { laiteTyyppi: 'pakastin', evaporatorData: [{}, {}], kenttaModuulit: { ohjaukset: { halytykset: 'Kunnossa', asetusarvo: '-20' } } };
assert.ok(vis(two).includes('hoyrystinOhjaus'));
assert.equal(fieldModuleCompletion(two, 'ohjaukset'), 'incomplete');
const own = { ...two, kenttaModuulit: { ohjaukset: { halytykset: 'Kunnossa', hoyrystinOhjaus: 'Jokaisella oma' } } };
assert.ok(!kylmioEvaporatorOhjausShared(own));
assert.ok(!vis(own).includes('asetusarvo') && !vis(own).includes('ohjausTyyppi'));
assert.equal(fieldModuleCompletion(own, 'ohjaukset'), 'ok');
// Mittaukset: vanhat höyrystin/lauhdutin-arvot näkyvät vain jos täytetty.
const m = findFieldModule('kylmioMittaukset')!;
const mv = (vals: any) => m.fields.filter((f) => fieldModuleFieldVisible(f, vals, { laiteTyyppi: 'pakastin' })).map((f) => f.id);
assert.ok(!mv({}).includes('hoyrystinIlmaSisaan'));
assert.ok(mv({ hoyrystinIlmaSisaan: '-25' }).includes('hoyrystinIlmaSisaan'));
// Enn: 'Jokaisella oma' + vanha asetus -13 ja ovi → ei muokattavana, vain "Aiemmin kirjattu".
const ennVals = { halytykset: 'Kunnossa', hoyrystinOhjaus: 'Jokaisella oma', asetusarvo: '-13', ovi: 'Ovikytkin' };
const enn = { ...two, kenttaModuulit: { ohjaukset: ennVals } };
assert.ok(!vis(enn).includes('asetusarvo') && !vis(enn).includes('ovi'));
assert.deepEqual(def.fields.filter((f) => fieldModuleFieldArchived(f, ennVals, enn)).map((f) => f.id), ['asetusarvo', 'ovi']);
assert.equal(fieldModuleCompletion(enn, 'ohjaukset'), 'ok');
// Koneikko: ohjaustapa → imupaineen asetus.
assert.ok(!vis(enn).includes('imupaineAsetus'));
const imu = { ...two, kenttaModuulit: { ohjaukset: { ...ennVals, koneikkoOhjaustapa: 'Imupaine' } } };
assert.ok(vis(imu).includes('imupaineAsetus') && vis(imu).includes('koneikkoOhjaustapa'));
// Tilan lämpötila: piilossa kun oma ohjaus, vanha arvo arkistoon.
const tila = m.fields.find((f) => f.id === 'tilaLampo')!;
assert.ok(!fieldModuleFieldVisible(tila, {}, own));
assert.ok(fieldModuleFieldArchived(tila, { tilaLampo: '-18' }, own));
assert.ok(fieldModuleFieldVisible(tila, {}, two));
assert.equal(fieldModuleCompletion({ ...own, kenttaModuulit: { ...own.kenttaModuulit, kylmioMittaukset: {} } }, 'kylmioMittaukset'), 'ok');
// P-T: -13 °C ↔ bar(g)
import('../src/lib/huoltoRaportti/refrigerantPt').then(({ getPressureFromSaturationTemp, getSaturationTempFromPressure }) => {
  for (const [r, exp] of [['R-404A', 2.88], ['R-448A', 2.20]] as const) {
    const p = getPressureFromSaturationTemp(-13, r);
    assert.ok(Math.abs(p - exp) < 0.05, `${r} ${p}`);
    assert.ok(Math.abs(getSaturationTempFromPressure(p, r) + 13) < 0.05);
  }
  console.log('kylmio-ohjaus ok');
});
