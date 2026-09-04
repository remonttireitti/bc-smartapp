import assert from 'node:assert/strict';
import { diffInspectionDraftPatch } from '../src/components/huoltoRaportti/HuoltoInspectionDialogShell.tsx';
import { mergeRaportointiDialogClose } from '../src/lib/huoltoRaportti/maintenanceDeviceDraft.ts';
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

test('diffInspectionDraftPatch returns only changed top-level keys', () => {
  const base = { a: 1, b: 'x', rows: [{ id: '1', virtausLs: '' }] };
  const draft = {
    a: 1,
    b: 'y',
    rows: [{ id: '1', virtausLs: '0,8' }],
  };
  const patch = diffInspectionDraftPatch(base, draft);
  assert.deepEqual(patch, {
    b: 'y',
    rows: [{ id: '1', virtausLs: '0,8' }],
  });
});

test('document module patch merges konvektori rows into live form without stale fields', () => {
  const live = {
    ...createEmptyHuoltoReportData(),
    asiakas: 'Asiakas Oy',
    konvektoriRows: [{ id: 'k1', tunnus: 'K1', virtausLs: '', valmistaja: '', malli: '', sarjanumero: '', huomio: '' }],
  };
  const staleDialog = {
    ...createEmptyHuoltoReportData(),
    asiakas: 'Vanha nimi',
    konvektoriRows: [{ id: 'k1', tunnus: 'K1', virtausLs: '1,2', valmistaja: '', malli: '', sarjanumero: '', huomio: '' }],
  };
  const patch = diffInspectionDraftPatch(live, staleDialog);
  const merged = { ...live, ...patch };
  assert.equal(merged.asiakas, 'Vanha nimi');
  assert.equal(merged.konvektoriRows[0].virtausLs, '1,2');
  assert.equal(merged.laiteTyyppi, live.laiteTyyppi);
});

test('raportointi patch keeps live device fields when customer draft changes', () => {
  const live = {
    ...createEmptyHuoltoReportData(),
    asiakas: 'Helvis',
    laiteTyyppi: 'konvektorit',
    laiteKayttotarkoitus: 'Verkosto A',
  };
  const patch = { asiakas: 'Helvis Oy', osoite: 'Katu 1' };
  const merged = mergeRaportointiDialogClose(live, { ...live, ...patch });
  assert.equal(merged.asiakas, 'Helvis Oy');
  assert.equal(merged.osoite, 'Katu 1');
  assert.equal(merged.laiteKayttotarkoitus, 'Verkosto A');
});

console.log('All konvektori document patch tests passed.');
