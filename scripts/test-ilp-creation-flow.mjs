import assert from 'node:assert/strict';
import { register } from 'node:module';

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('.') && /(^|\\/)supabase(\\.ts)?$/.test(spec) && ctx.parentURL && ctx.parentURL.includes('/src/')) {
    return { url: 'data:text/javascript,export const supabase = {};', shortCircuit: true };
  }
  return next(spec, ctx);
}`));


const { createEmptyHuoltoReportData, normalizeHuoltoReportData } = await import('../src/lib/huoltoRaportti/defaults.ts');
const { generateMaintenanceReportHtml } = await import('../src/lib/huoltoRaportti/printHtml.ts');
const { ulkoyksikkoInspectionStatus } = await import('../src/lib/huoltoRaportti/huoltoInspectionStatus.ts');
const { sisayksikkoTarkastusSummary } = await import('../src/lib/huoltoRaportti/sisayksikkoTarkastus.ts');
const { syncIlpOutdoorIdentity, ilpDeviceSerial } = await import('../src/lib/huoltoRaportti/ilpIdentity.ts');
const { buildDeviceDialogApplyResult } = await import('../src/lib/huoltoRaportti/maintenanceDeviceDraft.ts');
const { cloneHuoltoReportForSiblingEquipment } = await import('../src/lib/huoltoRaportti/cloneReportForSiblingEquipment.ts');
const { applySiblingEquipmentCopyFields } = await import('../src/lib/huoltoRaportti/siblingEquipmentCopy.ts');
const { buildHuoltoEquipmentTechnicalSnapshot, applyEquipmentSnapshotToForm } = await import('../src/lib/huoltoRaportti/equipmentSnapshot.ts');

function test(name, fn) {
  try { fn(); console.log(`OK ${name}`); } catch (e) { console.error(`FAIL ${name}`); throw e; }
}

const empty = createEmptyHuoltoReportData();
const blankUnit = { tyyppi: 'seina', malli: 'MSZ', sarjanumero: '', kondenssivesi: '', pumppuMalli: '', asennettu: null, kennoPuhdas: null, eiAania: null, kondenssiTestattu: null };
function ilp(over = {}) {
  return normalizeHuoltoReportData({
    ...empty, laiteTyyppi: 'lämpöpumppu', asiakas: 'Asiakas', huoltoPaivamaara: '2026-10-10',
    laiteValmistaja: 'Mitsubishi', laiteTunnus: 'Katto ILP 2', laiteSijainti: 'Katto',
    ulkoyksikkoMalli: 'FDC200', ulkoyksikkoSarjanumero: 'AY123', laiteMalli: 'FDC200', laiteSarjanumero: 'AY123',
    sisayksikkoMaara: 1, sisayksikkoData: [blankUnit], ...over,
  });
}

test('new report: no check is preselected', () => {
  const f = ilp({ sisayksikkoData: undefined });
  for (const u of f.sisayksikkoData) for (const k of ['asennettu', 'kennoPuhdas', 'eiAania', 'kondenssiTestattu']) assert.ok(u[k] == null, k);
  assert.equal(f.ulkoyksikkoTarkastusTila ?? null, null);
  assert.equal(ulkoyksikkoInspectionStatus(f), null);
});

test('unselected checks = ei kuulu: complete, neither fault nor OK, omitted in print', () => {
  const f = ilp();
  const s = sisayksikkoTarkastusSummary(f.sisayksikkoData[0]);
  assert.equal(s.complete, true);
  assert.equal(s.anyFaulty, false);
  assert.equal(s.allOk, false);
  const html = generateMaintenanceReportHtml(f, { companyName: 'Firma' });
  for (const label of ['Asennettu vaatimusten mukaisesti', 'Kenno ja siipipyörä', 'Ei kuulu sivuääniä', 'Kondenssiveden poisto testattu']) {
    assert.ok(!html.includes(label), `${label} should be omitted`);
  }
  assert.ok(html.includes('Ei vikaa havaittu'));
  assert.ok(!/Tarkastus:?\s*<[^>]*>?\s*Vika/.test(html));
});

test('existing saved values keep their meaning', () => {
  const f = ilp({ sisayksikkoData: [{ ...blankUnit, asennettu: 'ok', kennoPuhdas: 'faulty', eiAania: 'na' }], ulkoyksikkoTarkastusTila: 'ok' });
  const s = sisayksikkoTarkastusSummary(f.sisayksikkoData[0]);
  assert.equal(s.anyFaulty, true);
  assert.equal(ulkoyksikkoInspectionStatus(f), 'ok');
  const html = generateMaintenanceReportHtml(f, { companyName: 'Firma' });
  assert.ok(html.includes('Ei kuulu'));
  // imported legacy unticked outdoor box still derives fault
  assert.equal(ulkoyksikkoInspectionStatus({ ulkoyksikkoKennosPuhdas: false, ulkoyksikkoTurvakytkin: true, legacyCompanyInfo: { a: 1 } }), 'faulty');
});

test('ILP equipment serial = outdoor unit serial (one field, synced)', () => {
  assert.deepEqual(syncIlpOutdoorIdentity({ laiteTyyppi: 'lämpöpumppu', laiteSarjanumero: 'ei tiedossa', ulkoyksikkoSarjanumero: 'AY0800924EF', laiteMalli: '—', ulkoyksikkoMalli: 'FDC200VSA-W' }),
    { laiteSarjanumero: 'AY0800924EF', laiteMalli: 'FDC200VSA-W' });
  assert.deepEqual(syncIlpOutdoorIdentity({ laiteTyyppi: 'lämpöpumppu', laiteSarjanumero: 'SN9', ulkoyksikkoSarjanumero: '', laiteMalli: '', ulkoyksikkoMalli: '' }),
    { ulkoyksikkoSarjanumero: 'SN9' });
  assert.deepEqual(syncIlpOutdoorIdentity({ laiteTyyppi: 'chiller', laiteSarjanumero: 'X', ulkoyksikkoSarjanumero: 'Y' }), {});
  assert.equal(ilpDeviceSerial({ laiteSarjanumero: 'ei tiedossa', ulkoyksikkoSarjanumero: '' }), '');
  const base = ilp({ ulkoyksikkoSarjanumero: '', laiteSarjanumero: '', ulkoyksikkoMalli: '', laiteMalli: '' });
  const r = buildDeviceDialogApplyResult(base, { ...base, laiteSarjanumero: 'NEW1', ulkoyksikkoSarjanumero: 'NEW1', laiteMalli: 'M2', ulkoyksikkoMalli: 'M2' });
  assert.ok(r.ok);
  assert.equal(r.next.ulkoyksikkoSarjanumero, 'NEW1');
  assert.equal(r.next.laiteSarjanumero, 'NEW1');
  assert.equal(r.next.ulkoyksikkoMalli, 'M2');
});

test('copy to a sibling ILP: no inspection results carried over, serial synced', () => {
  const src = ilp({ ulkoyksikkoTarkastusTila: 'ok', ulkoyksikkoKennosPuhdas: true, sisayksikkoData: [{ ...blankUnit, asennettu: 'ok', kennoPuhdas: 'ok', eiAania: 'ok', kondenssiTestattu: 'ok' }] });
  const c = cloneHuoltoReportForSiblingEquipment(src, { keepModel: true });
  assert.equal(c.ulkoyksikkoTarkastusTila, null);
  assert.equal(c.ulkoyksikkoKennosPuhdas, false);
  for (const k of ['asennettu', 'kennoPuhdas', 'eiAania', 'kondenssiTestattu']) assert.equal(c.sisayksikkoData[0][k], null);
  const s = applySiblingEquipmentCopyFields(src, { tunnus: 'Katto ILP 3', sarjanumero: 'AY999', sameModel: true });
  assert.equal(s.ulkoyksikkoSarjanumero, 'AY999');
});

test('equipment snapshot does not preselect indoor checks on the next visit', () => {
  const prev = ilp({ sisayksikkoData: [{ ...blankUnit, asennettu: 'ok', kennoPuhdas: 'ok' }] });
  const snap = buildHuoltoEquipmentTechnicalSnapshot(prev);
  const patch = applyEquipmentSnapshotToForm(normalizeHuoltoReportData({ ...empty, laiteTyyppi: 'lämpöpumppu' }), snap);
  assert.equal(patch.sisayksikkoData[0].asennettu ?? null, null);
  assert.equal(patch.sisayksikkoData[0].malli, 'MSZ');
});

console.log('test-ilp-creation-flow: ok');
