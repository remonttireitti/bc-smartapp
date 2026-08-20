import assert from 'node:assert/strict';
import {
  applyDeviceTypeSelection,
  buildDeviceDialogApplyResult,
  mergeRaportointiDialogClose,
} from '../src/lib/huoltoRaportti/maintenanceDeviceDraft.ts';
import { createEmptyHuoltoReportData } from '../src/lib/huoltoRaportti/defaults.ts';

function test(name, fn) {
  try {
    fn();
    console.log(`OK ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const empty = createEmptyHuoltoReportData();

test('applyDeviceTypeSelection sets laiteTyyppi immediately', () => {
  const next = applyDeviceTypeSelection(empty, 'pakastin');
  assert.equal(next.laiteTyyppi, 'pakastin');
  assert.notEqual(next.selectedModules.kylmaainePiiri, undefined);
});

test('buildDeviceDialogApplyResult persists full device basics', () => {
  const draft = {
    ...empty,
    laiteTyyppi: 'pakastin',
    laiteValmistaja: 'Testi Oy',
    laiteMalli: 'PK-1',
    laiteTunnus: 'PK1',
    laiteSarjanumero: '123',
    laiteSijainti: 'Kellarissa',
    laiteKayttotarkoitus: '',
  };
  const result = buildDeviceDialogApplyResult(empty, draft);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.next.laiteTyyppi, 'pakastin');
  assert.equal(result.next.laiteValmistaja, 'Testi Oy');
});

test('mergeRaportointiDialogClose keeps live device when draft is stale', () => {
  const live = {
    ...empty,
    asiakas: 'Helvis',
    osoite: 'Kutomotie 16',
    laiteTyyppi: 'pakastin',
    laiteValmistaja: 'Testi Oy',
    laiteMalli: 'PK-1',
    laiteTunnus: 'PK1',
    laiteSarjanumero: '123',
    laiteSijainti: 'Kellarissa',
  };
  const staleDraft = {
    ...empty,
    asiakas: 'Helvis Oy',
    osoite: 'Kutomotie 16, Helsinki',
    laiteTyyppi: '',
  };
  const merged = mergeRaportointiDialogClose(live, staleDraft);
  assert.equal(merged.asiakas, 'Helvis Oy');
  assert.equal(merged.osoite, 'Kutomotie 16, Helsinki');
  assert.equal(merged.laiteTyyppi, 'pakastin');
  assert.equal(merged.laiteMalli, 'PK-1');
});

test('mergeRaportointiDialogClose does not wipe type saved after dialog opened', () => {
  const staleDraft = { ...empty, asiakas: 'A', osoite: 'B' };
  const live = {
    ...staleDraft,
    laiteTyyppi: 'kylmäkoneikko',
    laiteValmistaja: 'V',
    laiteMalli: 'M',
    laiteTunnus: 'T',
    laiteSarjanumero: 'S',
    laiteSijainti: 'L',
  };
  const merged = mergeRaportointiDialogClose(live, staleDraft);
  assert.equal(merged.laiteTyyppi, 'kylmäkoneikko');
});

console.log('All device draft tests passed.');
