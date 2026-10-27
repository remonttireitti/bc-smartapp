import assert from 'node:assert/strict';
import { evaporatorWithLegacyOhjaus, fieldModuleCompletion, fieldModuleFieldArchived, fieldModuleFieldVisible, findFieldModule, kylmioEvaporatorOhjausShared } from '../src/lib/huoltoRaportti/fieldModules';

const def = findFieldModule('ohjaukset')!;
const vis = (form: any) => def.fields.filter((f) => fieldModuleFieldVisible(f, form.kenttaModuulit?.ohjaukset ?? {}, form)).map((f) => f.id);
// Yksi höyrystin: ei Yhteinen/oma-kysymystä, ei yhteisiä kenttiä vaiheessa 5, ei keskeneräisyyttä valinnasta.
const old = { laiteTyyppi: 'pakastin', evaporatorData: [{}], kenttaModuulit: { ohjaukset: { saadin: 'Danfoss', asetusarvo: '-20', halytysYla: '-15', halytykset: 'Kunnossa', ovi: 'Ovikytkin', hoyrystinOhjaus: 'Jokaisella oma' } } };
assert.ok(!kylmioEvaporatorOhjausShared(old));
assert.ok(!vis(old).includes('hoyrystinOhjaus') && !vis(old).includes('asetusarvo') && !vis(old).includes('ovi'));
assert.ok(vis(old).includes('saadin') && vis(old).includes('koneikkoOhjaustapa'));
assert.equal(def.fields.filter((f) => fieldModuleFieldArchived(f, old.kenttaModuulit.ohjaukset, old)).length, 0, 'ei arkistoa vaiheessa 5');
assert.equal(fieldModuleCompletion(old, 'ohjaukset'), 'ok');
assert.equal(fieldModuleCompletion({ ...old, kenttaModuulit: { ohjaukset: { halytykset: 'Kunnossa' } } }, 'ohjaukset'), 'ok');
// Vanhat arvot siirtyvät höyrystimen kortille (vain tyhjiin).
const ev = evaporatorWithLegacyOhjaus({ lampotilaAsetus: '', halytysAla: '-30' } as any, old, 0) as any;
assert.equal(ev.lampotilaAsetus, '-20'); assert.equal(ev.halytysYla, '-15'); assert.equal(ev.halytysAla, '-30'); assert.equal(ev.ovikytkin, 'ovikytkin');
assert.equal((evaporatorWithLegacyOhjaus({} as any, { ...old, kylmaainePiireja: '2', evaporatorData: [{}, {}] }, 0) as any).lampotilaAsetus, undefined);
// Kaksi höyrystintä: valinta pakollinen.
const two = { laiteTyyppi: 'pakastin', kylmaainePiireja: '2', evaporatorData: [{}, {}], kenttaModuulit: { ohjaukset: { halytykset: 'Kunnossa', asetusarvo: '-20' } } };
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

// Explicit counts
{
  const { getEvaporatorCircuitCount, getCondenserCount } = await import('../src/lib/huoltoRaportti/evaporatorHelpers');
  const { createEmptyHuoltoReportData } = await import('../src/lib/huoltoRaportti/defaults');
  const { buildHuoltoEquipmentTechnicalSnapshot, applyEquipmentSnapshotToForm } = await import('../src/lib/huoltoRaportti/equipmentSnapshot');
  const base = { ...createEmptyHuoltoReportData(), laiteTyyppi: 'pakastin', kylmaainePiireja: '1' } as any;
  if (getEvaporatorCircuitCount(base) !== 1) throw new Error('legacy derive');
  if (getEvaporatorCircuitCount({ ...base, hoyrystimienMaara: '2' }) !== 2) throw new Error('explicit evap');
  if (getCondenserCount({ ...base, lauhduttimienMaara: '2' }) !== 1) throw new Error('cond count needs erillinen');
  if (getCondenserCount({ ...base, lauhduttimienMaara: '2', lauhdutinTyyppiLaite: 'erillinen_ilma' }) !== 2) throw new Error('cond explicit');
  const snap = buildHuoltoEquipmentTechnicalSnapshot({ ...base, hoyrystimienMaara: '2', lauhduttimienMaara: '2', lauhdutinTyyppiLaite: 'erillinen_ilma' } as any) as any;
  const patch = applyEquipmentSnapshotToForm(base, snap) as any;
  const p2 = patch?.patch ?? patch;
  if (p2.hoyrystimienMaara !== '2' || p2.lauhduttimienMaara !== '2') throw new Error('snapshot prefill ' + JSON.stringify({ h: p2.hoyrystimienMaara }));
  console.log('counts ok');
}
