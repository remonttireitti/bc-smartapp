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
const { generateMaintenanceReportHtml, lampopumppuHasDeviceFault } = await import('../src/lib/huoltoRaportti/printHtml.ts');
const { ulkoyksikkoInspectionStatus } = await import('../src/lib/huoltoRaportti/huoltoInspectionStatus.ts');
const { sisayksikkoTarkastusSummary } = await import('../src/lib/huoltoRaportti/sisayksikkoTarkastus.ts');

function test(name, fn) {
  try { fn(); console.log(`OK ${name}`); } catch (e) { console.error(`FAIL ${name}`); throw e; }
}

const unit = { tyyppi: 'seina', malli: 'MSZ', sarjanumero: '', kondenssivesi: '', pumppuMalli: '', asennettu: 'ok', kennoPuhdas: 'ok', eiAania: 'ok', kondenssiTestattu: 'ok' };
function ilp(over = {}) {
  return normalizeHuoltoReportData({
    ...createEmptyHuoltoReportData(), laiteTyyppi: 'lämpöpumppu', asiakas: 'Asiakas', huoltoPaivamaara: '2026-10-10',
    laiteTunnus: 'ILP 1', ulkoyksikkoTarkastusTila: 'ok', huoltoSuoritettu: true, huoltoLaiteessaVika: false,
    sisayksikkoMaara: 1, sisayksikkoData: [unit], ...over,
  });
}

test('suojakotelo missing is not an outdoor-unit fault', () => {
  assert.equal(ulkoyksikkoInspectionStatus({ ulkoyksikkoKennosPuhdas: true, ulkoyksikkoTurvakytkin: true, ulkoyksikkoSuojakotelo: false }), 'ok');
  assert.equal(ulkoyksikkoInspectionStatus({ ulkoyksikkoKennosPuhdas: false, ulkoyksikkoTurvakytkin: true }), 'faulty');
});

test('imported unticked condensate = ei tarkastettu, not a fault', () => {
  const raw = { ...unit, kondenssiTestattu: false };
  const f = ilp({ legacyCompanyInfo: { name: 'Vanha' }, sisayksikkoData: [raw] });
  assert.equal(f.sisayksikkoData[0].kondenssiEiTarkastettu, true);
  const s = sisayksikkoTarkastusSummary(f.sisayksikkoData[0]);
  assert.equal(s.complete, true);
  assert.equal(s.anyFaulty, false);
  assert.equal(lampopumppuHasDeviceFault(f), false);
  const html = generateMaintenanceReportHtml(f, { companyName: 'Firma' });
  assert.ok(html.includes('ei tarkastettu') && html.includes('Ei vikaa havaittu'));
  const native = ilp({ sisayksikkoData: [raw] });
  assert.equal(native.sisayksikkoData[0].kondenssiTestattu, 'faulty');
});

test('single-device verdict never contradicts the device checks', () => {
  let html = generateMaintenanceReportHtml(ilp(), { companyName: 'Firma' });
  assert.ok(html.includes('Ei vikaa havaittu'));
  for (const over of [
    { ulkoyksikkoTarkastusTila: 'faulty' },
    { sisayksikkoData: [{ ...unit, kennoPuhdas: 'faulty' }] },
    { selectedModules: { ...createEmptyHuoltoReportData().selectedModules, tiiveyskoe: true }, tiiveyskoeData: { ...createEmptyHuoltoReportData().tiiveyskoeData, tulos: 'hylatty' } },
  ]) {
    const f = ilp(over);
    assert.equal(lampopumppuHasDeviceFault(f), true);
    html = generateMaintenanceReportHtml(f, { companyName: 'Firma' });
    assert.ok(html.includes('vika havaittu') && !html.includes('Ei vikaa havaittu'));
  }
  // other device types: manual flag only
  const other = normalizeHuoltoReportData({ ...createEmptyHuoltoReportData(), laiteTyyppi: 'vesiilmalampopumppu', huoltoLaiteessaVika: false });
  assert.equal(lampopumppuHasDeviceFault(other), false);
});

test('one protocol per device: no multi-device fields in print', () => {
  const html = generateMaintenanceReportHtml(ilp(), { companyName: 'Firma' });
  assert.ok(!html.includes('ILMALÄMPÖPUMPUT'));
  assert.ok(html.includes('Sisäyksikkö 1'));
});

console.log('test-ilp-single-device-fixes: ok');
