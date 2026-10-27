import assert from 'node:assert/strict';
import { koneikkoLegacyReadOnly, koneikkoStatuses, koneikkoView } from '../src/lib/huoltoRaportti/koneikkoComponents';
import { refrigerantCircuitComponentsTitle } from '../src/lib/huoltoRaportti/refrigerantCircuitHelpers';
import { createEmptyRefrigerantCircuitData } from '../src/lib/huoltoRaportti/defaults';
const base = createEmptyRefrigerantCircuitData();
// Uusi: nestelasi + kuivain päällä, nestelasi tarkastamatta → Kesken.
const v = koneikkoView(base);
assert.ok(v.nestelasiOn && v.kuivainOn && !v.imusuodatinOn && !v.tarinaOn);
assert.deepEqual(koneikkoStatuses(base), [null]);
assert.deepEqual(koneikkoStatuses({ ...base, nestelasiKuplat: 'kupliton', nestelasiKosteus: 'kuiva' }), ['ok']);
assert.deepEqual(koneikkoStatuses({ ...base, nestelasiKuplat: 'kuplii', nestelasiKosteus: 'kuiva' }), ['faulty']);
assert.deepEqual(koneikkoStatuses({ ...base, nestelasiKaytossa: false }), []);
// Vanha: piirin kuivain + nestelasi kuiva + paisuntaventtiili → koneikolle, venttiili vain luku.
const old = { ...base, kompponentit: [
  { id: 'a', type: 'kuivain', valmistaja: 'Danfoss', malli: 'DML 083', kommentti: '', tila: 'ok' },
  { id: 'b', type: 'nestelasi', valmistaja: '', malli: '', kommentti: 'Nestelasi kuiva', tila: 'ok', nestelasiKuiva: true },
  { id: 'c', type: 'paisuntaventtiili', valmistaja: 'Danfoss', malli: 'TE2', kommentti: '', tila: 'ok' },
  { id: 'd', type: 'imusuodatin', valmistaja: '', malli: '', kommentti: '', tila: null },
] } as any;
const ov = koneikkoView(old);
assert.equal(ov.kuivainMalli, 'Danfoss DML 083');
assert.equal(ov.nestelasiKosteus, 'kuiva');
assert.equal(ov.imusuodatinOn, false, 'tyhjä vanha imusuodatin ei kytke päälle');
assert.deepEqual(koneikkoLegacyReadOnly(old).map((c) => c.type).sort(), ['paisuntaventtiili']);
assert.equal(refrigerantCircuitComponentsTitle(1, 'pakastin'), 'Koneikon komponentit');
assert.equal(refrigerantCircuitComponentsTitle(2, 'pakastin'), 'Koneikon komponentit — piiri 2');
assert.equal(refrigerantCircuitComponentsTitle(1, 'mlp'), 'Piiri 1 — ohjaus ja komponentit');
console.log('koneikko-components ok');
