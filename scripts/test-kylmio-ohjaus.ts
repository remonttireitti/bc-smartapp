import assert from 'node:assert/strict';
import { fieldModuleCompletion, fieldModuleFieldVisible, findFieldModule, kylmioEvaporatorOhjausShared } from '../src/lib/huoltoRaportti/fieldModules';

const def = findFieldModule('ohjaukset')!;
const vis = (form: any) => def.fields.filter((f) => fieldModuleFieldVisible(f, form.kenttaModuulit?.ohjaukset ?? {}, form)).map((f) => f.id);
// Vanha raportti: yksi säädin + arvot → näkyvät (yhteinen ohjaus), valmis.
const old = { laiteTyyppi: 'pakastin', evaporatorData: [{}], kenttaModuulit: { ohjaukset: { saadin: 'Danfoss', asetusarvo: '-20', halytysYla: '-15', halytykset: 'Kunnossa', ovi: 'Kunnossa' } } };
assert.ok(kylmioEvaporatorOhjausShared(old));
assert.deepEqual(vis(old).filter((id) => ['saadin', 'asetusarvo', 'halytysYla', 'ovi'].includes(id)).length, 4);
assert.ok(!vis(old).includes('hoyrystinOhjaus'));
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
console.log('kylmio-ohjaus ok');
