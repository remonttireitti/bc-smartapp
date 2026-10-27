import assert from 'node:assert/strict';
import { applyEquipmentSnapshotToForm, buildHuoltoEquipmentTechnicalSnapshot } from '../src/lib/huoltoRaportti/equipmentSnapshot';
import { createEmptyHuoltoReportData, createEmptyEvaporatorData, mergeHuoltoReportData } from '../src/lib/huoltoRaportti/defaults';

// Raportti 1: kylmiö, kiinteät + mitatut arvot.
const r1: any = createEmptyHuoltoReportData();
r1.laiteTyyppi = 'pakastin';
r1.kylmaaineTyyppi = 'R-448A';
r1.laiteKokoonpano = { ...(r1.laiteKokoonpano ?? {}), kylmaainepiiri: true };
r1.kenttaModuulit = { ohjaukset: { saadin: 'Danfoss AK-CC 550', hoyrystinOhjaus: 'Jokaisella oma', ohjausTyyppi: 'Elektroninen säädin', asetusarvo: '-20', halytykset: 'Kunnossa' } };
r1.evaporatorData = [{
  ...createEmptyEvaporatorData('pakastin'), tyyppi: 'staatinen', valmistaja: 'Lu-Ve', malli: 'S1', puhaltimienMaara: 0,
  magneettiventtiiliKaytossa: false, paisuntaventtiiliTyyppi: 'TXV', paisuntaventtiiliMalli: 'TE2', ohjausMalli: 'EKC 202',
  kennoPituusMm: '1000', kennoKorkeusMm: '300', kennoSyvyysMm: '100', ripavaliMm: '10',
  // mittaukset / tulokset:
  kylmioLampotila: '-18', kennoLampotila: '-24', ilmaTuloRh: '90', ilmavirtaM3h: '3600', tarkastusTila: 'ok', lampotilaMitattu: '-19', tulistus: '6',
}];
r1.kylmaainePiiri1 = { ...r1.kylmaainePiiri1, imupaine: '2.6', imuLampotila: '2', korkeapaine: '15', nestePutkiLampotila: '31',
  nestelasiKaytossa: true, nestelasiKuplat: 'kupliton', nestelasiKosteus: 'kuiva', kuivainKaytossa: true, kuivainVaihdettu: true,
  koneikkoKuivainMalli: 'DML 083', imusuodatinKaytossa: true, imusuodatinVaihdettu: true };

const snap = buildHuoltoEquipmentTechnicalSnapshot(r1);
const json = JSON.stringify(snap);
for (const bad of ['"imupaine":"2.6"', 'kupliton', '"kuivainVaihdettu"', '"imusuodatinVaihdettu"', '"kylmioLampotila"', '"ilmavirtaM3h"', '"asetusarvo"', '"halytykset"', '"lampotilaMitattu"']) {
  assert.ok(!json.includes(bad), `mittaus/tulos ei laitekortille: ${bad}`);
}

// Raportti 2: uusi raportti samalle laitteelle.
const blank: any = createEmptyHuoltoReportData();
const r2: any = mergeHuoltoReportData(blank, applyEquipmentSnapshotToForm(blank, snap));
assert.equal(r2.laiteTyyppi, 'pakastin');
assert.equal(r2.kylmaaineTyyppi, 'R-448A');
assert.equal(r2.laiteKokoonpano.kylmaainepiiri, true);
assert.deepEqual(r2.kenttaModuulit.ohjaukset, { saadin: 'Danfoss AK-CC 550', hoyrystinOhjaus: 'Jokaisella oma', ohjausTyyppi: 'Elektroninen säädin' });
const e = r2.evaporatorData[0];
assert.equal(e.tyyppi, 'staatinen'); assert.equal(e.malli, 'S1');
assert.equal(e.magneettiventtiiliKaytossa, false); assert.equal(e.paisuntaventtiiliMalli, 'TE2'); assert.equal(e.ohjausMalli, 'EKC 202');
assert.equal(e.kennoPituusMm, '1000'); assert.equal(e.ripavaliMm, '10');
for (const k of ['kylmioLampotila', 'kennoLampotila', 'ilmaTuloRh', 'ilmavirtaM3h', 'lampotilaMitattu']) assert.ok(!e[k], `tyhjä ${k}`);
assert.ok(e.tarkastusTila == null || e.tarkastusTila === '', 'tarkastuksen tulos tyhjä');
const c = r2.kylmaainePiiri1;
assert.equal(c.koneikkoKuivainMalli, 'DML 083'); assert.equal(c.imusuodatinKaytossa, true); assert.equal(c.nestelasiKaytossa, true);
for (const k of ['imupaine', 'imuLampotila', 'korkeapaine', 'nestePutkiLampotila', 'nestelasiKuplat', 'nestelasiKosteus']) assert.ok(!c[k], `tyhjä ${k}`);
assert.ok(!c.kuivainVaihdettu && !c.imusuodatinVaihdettu, 'toimenpiteet tyhjät');

// Muutos raportissa päivittää laitteen: raportin 2 uusi säädin → snapshot.
r2.kenttaModuulit.ohjaukset.saadin = 'Carel IR33';
assert.equal((buildHuoltoEquipmentTechnicalSnapshot(r2) as any).ohjauksetKiinteat.saadin, 'Carel IR33');
// Esitäyttö ei korvaa raportin omaa arvoa.
const own: any = { ...blank, kenttaModuulit: { ohjaukset: { saadin: 'Oma' } } };
assert.equal((applyEquipmentSnapshotToForm(own, snap) as any).kenttaModuulit.ohjaukset.saadin, 'Oma');
console.log('equipment-fixed-fields ok');
