// Lauhdutustapa Lauhdutin-moduulissa + höyrystinmäärä kylmäainepiireittäin (ei Supabasea).
import assert from 'node:assert/strict';
import { applyDeviceTypeDefaults, createEmptyHuoltoReportData } from '../src/lib/huoltoRaportti/defaults';
import { buildMaintenanceReportTabs } from '../src/lib/huoltoRaportti/maintenanceReportTabs';
import { buildMaintenanceDocumentEntries, listIncompleteMaintenanceModules, documentEntryCompletion } from '../src/lib/huoltoRaportti/maintenanceDocumentUnitEntries';
import { buildMaintenanceSteps } from '../src/lib/huoltoRaportti/maintenanceSteps';
import { resolveAutoModules } from '../src/lib/huoltoRaportti/deviceModuleLogic';
import { kylmioEvaporatorCircuitCounts, kylmioEvaporatorPosition, splitEvaporatorTotal, getEvaporatorCircuitCount, kylmioEvaporatorTitle } from '../src/lib/huoltoRaportti/evaporatorHelpers';
import { evaporatorCircuitCountPatch } from '../src/components/huoltoRaportti/EvaporatorCircuitCount';
import { applyEquipmentSnapshotToForm, buildHuoltoEquipmentTechnicalSnapshot } from '../src/lib/huoltoRaportti/equipmentSnapshot';
import { usesKokoonpanoStep } from '../src/lib/huoltoRaportti/deviceKokoonpano';

function entriesFor(type: string, extra: Record<string, unknown> = {}) {
  const base: any = { ...applyDeviceTypeDefaults(createEmptyHuoltoReportData(), type), ...extra };
  base.selectedModules = resolveAutoModules({ laiteTyyppi: base.laiteTyyppi, lauhdutinTyyppiLaite: base.lauhdutinTyyppiLaite, vapaajahdytysKaytossa: base.vapaajahdytysKaytossa, laiteKokoonpano: base.laiteKokoonpano, manualModules: base.selectedModules });
  return { form: base, tabs: undefined as never };
}

// --- lauhdutustapa on Lauhdutin-vaiheen ensimmäinen moduuli, ei Kokoonpanossa
assert.equal(usesKokoonpanoStep('pakastin'), false);
assert.equal(usesKokoonpanoStep('kylmäkoneikko'), false);
for (const [type, tapa] of [['pakastin', 'erillinen_ilma'], ['kylmäkoneikko', 'koneseen_integroitu'], ['vedenjäähdytyskone', 'erillinen_ilma'], ['vakioilmastointtikone', 'koneseen_integroitu'], ['vedenjäähdytyskone', 'nestekiertoinen']] as const) {
  const { form } = entriesFor(type, { lauhdutinTyyppiLaite: tapa });
  const tabs = buildMaintenanceReportTabs({
    laiteTyyppi: form.laiteTyyppi, laiteKokoonpano: form.laiteKokoonpano, selectedModules: form.selectedModules, customModules: [],
    showEvaporatorSection: true, showCondenserSection: type === 'pakastin' || type === 'kylmäkoneikko', showLauhdutuspiiriSection: tapa === 'nestekiertoinen',
    showNestelauhduttimetSection: tapa === 'nestekiertoinen', showJaahdytysvesiSection: false, showVapaajahdytysSection: false, showKonvektoritSection: false,
    showLampopumppuSection: false, showMlpSection: false, showChillerKiinteistoSection: false, showChillerEnergySection: false, hiddenTabIds: [], moduleTabOrder: [],
  } as any);
  const entries = buildMaintenanceDocumentEntries(tabs, form);
  const steps = buildMaintenanceSteps(entries, form.laiteTyyppi);
  const cond = steps.find((s) => s.title === 'Lauhdutin');
  assert.ok(cond, `${type}/${tapa}: Lauhdutin-vaihe puuttuu`);
  assert.equal(entries[cond!.entryIndexes[0]].kind, 'condenserConfig', `${type}/${tapa}: lauhdutustapa ensin`);
  assert.equal(entries.filter((e) => e.kind === 'condenserConfig').length, 1);
  const perus = steps[0];
  assert.ok(!perus.entryIndexes.some((i) => entries[i].kind === 'condenserConfig'), `${type}: ei Perustiedoissa`);
  if (type === 'pakastin' || type === 'kylmäkoneikko') assert.ok(!entries.some((e) => e.tabId === 'kokoonpano'), `${type}: Kokoonpano poistettu`);
  assert.equal(documentEntryCompletion(entries[cond!.entryIndexes[0]], form), 'ok');
  assert.equal(documentEntryCompletion(entries[cond!.entryIndexes[0]], { ...form, lauhdutinTyyppiLaite: '' }), 'incomplete');
  listIncompleteMaintenanceModules(tabs, { ...form, lauhdutinTyyppiLaite: '' });
}

// --- höyrystimet piireittäin
const f = (o: Record<string, unknown>) => ({ ...(applyDeviceTypeDefaults(createEmptyHuoltoReportData(), 'pakastin') as any), ...o });
assert.deepEqual(splitEvaporatorTotal(5, 2), [4, 1]);
assert.deepEqual(splitEvaporatorTotal(3, 3), [1, 1, 1]);
assert.deepEqual(splitEvaporatorTotal(1, 2), [1, 0]);
assert.deepEqual(splitEvaporatorTotal(4, 1), [4]);
// vanha raportti: vain kokonaismäärä → summa säilyy, ylimäärä piirille 1
let old = f({ kylmaainePiireja: '2', hoyrystimienMaara: '3' });
assert.deepEqual(kylmioEvaporatorCircuitCounts(old), [2, 1]);
assert.equal(getEvaporatorCircuitCount(old), 3);
old = f({ kylmaainePiireja: '1', hoyrystimienMaara: '3' });
assert.deepEqual(kylmioEvaporatorCircuitCounts(old), [3]);
assert.equal(getEvaporatorCircuitCount(old), 3);
old = f({ kylmaainePiireja: '2', hoyrystimienMaara: '' });
assert.equal(getEvaporatorCircuitCount(old), 2); // vanha oletus: yksi / piiri
// piirikohtainen voittaa
const per = f({ kylmaainePiireja: '2', hoyrystimienMaara: '9', hoyrystimetPiireittain: '2,3' });
assert.deepEqual(kylmioEvaporatorCircuitCounts(per), [2, 3]);
assert.equal(getEvaporatorCircuitCount(per), 5);
assert.deepEqual(kylmioEvaporatorPosition([2, 3], 2), { circuit: 1, nth: 1, inCircuit: 3 });
assert.equal(kylmioEvaporatorTitle(per, 0), 'Piiri 1 — Höyrystin 1');
assert.equal(kylmioEvaporatorTitle(per, 4), 'Piiri 2 — Höyrystin 3');
assert.equal(kylmioEvaporatorTitle(f({ kylmaainePiireja: '1', hoyrystimetPiireittain: '1' }), 0), 'Höyrystin');
// piirien määrä muuttuu → lista täydentyy / lyhenee
assert.deepEqual(kylmioEvaporatorCircuitCounts(f({ kylmaainePiireja: '3', hoyrystimetPiireittain: '2' })), [2, 0, 0]);
assert.deepEqual(kylmioEvaporatorCircuitCounts(f({ kylmaainePiireja: '1', hoyrystimetPiireittain: '2,3' })), [2]);
// stepperin muutos: rivit pysyvät oikeassa piirissä, kokonaismäärä päivittyy
const rows = ['A', 'B', 'C'].map((m) => ({ ...(f({}).evaporatorData?.[0] ?? {}), malli: m }));
let form = f({ kylmaainePiireja: '2', hoyrystimetPiireittain: '1,2', hoyrystimienMaara: '3', evaporatorData: rows });
let patch = evaporatorCircuitCountPatch(form, 0, 2);
assert.equal(patch.hoyrystimetPiireittain, '2,2'); assert.equal(patch.hoyrystimienMaara, '4');
assert.deepEqual(patch.evaporatorData!.map((e: any) => e.malli), ['A', '', 'B', 'C']);
form = { ...form, ...patch };
patch = evaporatorCircuitCountPatch(form, 1, 1);
assert.equal(patch.hoyrystimetPiireittain, '2,1'); assert.equal(patch.hoyrystimienMaara, '3');
assert.deepEqual(patch.evaporatorData!.map((e: any) => e.malli), ['A', '', 'B']);

// --- laitekortti: tallennus + esitäyttö, vanha kortti toimii
const snap = buildHuoltoEquipmentTechnicalSnapshot(f({ kylmaainePiireja: '2', hoyrystimetPiireittain: '2,1', hoyrystimienMaara: '3', lauhdutinTyyppiLaite: 'erillinen_ilma', lauhduttimienMaara: '2' }) as any) as Record<string, any>;
assert.equal(snap.hoyrystimetPiireittain, '2,1'); assert.equal(snap.laiteKonfiguraatio.hoyrystimetPiireittain, '2,1');
let pre: any = applyEquipmentSnapshotToForm(f({ kylmaainePiireja: '2', lauhdutinTyyppiLaite: '', lauhduttimienMaara: '' }) as any, snap);
assert.equal(pre.hoyrystimetPiireittain, '2,1'); assert.equal(pre.hoyrystimienMaara, '3'); assert.equal(pre.lauhdutinTyyppiLaite, 'erillinen_ilma'); assert.equal(pre.lauhduttimienMaara, '2');
pre = applyEquipmentSnapshotToForm(f({ kylmaainePiireja: '2', hoyrystimienMaara: '4' }) as any, snap); // raportilla oma määrä → ei sekoiteta
assert.equal(pre.hoyrystimetPiireittain, undefined);
pre = applyEquipmentSnapshotToForm(f({ kylmaainePiireja: '2' }) as any, { laiteTyyppi: 'pakastin', hoyrystimienMaara: '3' }); // vanha kortti
assert.equal(pre.hoyrystimienMaara, '3'); assert.equal(pre.hoyrystimetPiireittain, undefined);
console.log('test-huolto-condenser-evaporator-structure OK');
