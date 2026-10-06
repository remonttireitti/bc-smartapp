import assert from 'node:assert/strict';
import { register } from 'node:module';

// printHtml → maintenanceReportImages → supabase (import.meta.env): korvataan tyhjällä clientilla.
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('.') && /(^|\\/)supabase(\\.ts)?$/.test(spec) && ctx.parentURL && ctx.parentURL.includes('/src/')) {
    return { url: 'data:text/javascript,export const supabase = {};', shortCircuit: true };
  }
  return next(spec, ctx);
}`));

const { createEmptyHuoltoReportData, normalizeHuoltoReportData, buildMaintenanceReportPrintTitle } = await import('../src/lib/huoltoRaportti/defaults.ts');
const ilp = await import('../src/lib/huoltoRaportti/ilpLaitteet.ts');
const { generateMaintenanceReportHtml } = await import('../src/lib/huoltoRaportti/printHtml.ts');
const { collectMaintenancePrintImagePaths } = await import('../src/lib/maintenanceReportPrintImages.ts');
const { buildMaintenanceReportTabCompletion } = await import('../src/lib/huoltoRaportti/maintenanceReportTabCompletion.ts');
const { buildMaintenanceDocumentEntries } = await import('../src/lib/huoltoRaportti/maintenanceDocumentUnitEntries.ts');
const { ilpPhotoTagOwner, partitionPhotoRowsByDevice } = await import('../src/lib/maintenanceReportPhotoSync.ts');

function test(name, fn) {
  try {
    fn();
    console.log(`OK ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function ilpReport(overrides = {}) {
  return normalizeHuoltoReportData({
    ...createEmptyHuoltoReportData(),
    laiteTyyppi: 'lämpöpumppu',
    asiakas: 'Asiakas Oy',
    osoite: 'Testikatu 1',
    huoltoPaivamaara: '2026-09-18',
    huoltoSuorittajaNimi: 'Asentaja',
    huoltoSuoritettu: true,
    laiteTunnus: 'ILP 1',
    laiteSijainti: 'Olohuone',
    laiteValmistaja: 'Daikin',
    ulkoyksikkoMalli: 'RXTP35',
    ulkoyksikkoSarjanumero: 'OU-1',
    ulkoyksikkoTarkastusTila: 'ok',
    kylmaaineTyyppi: 'R-32',
    kylmaaineValmistajaMaara: '1.1',
    sisayksikkoMaara: 1,
    sisayksikkoData: [{ tyyppi: 'seina', malli: 'FTXTP35', sarjanumero: 'IU-1', kondenssivesi: '', pumppuMalli: '', asennettu: 'ok', kennoPuhdas: 'ok', eiAania: 'ok', kondenssiTestattu: 'ok' }],
    mittausLammitysTestattu: true,
    mittausSisayksikot: [{ sisalampotilaLammitys: '21', puhallusLampotilaLammitys: '47.3' }],
    ...overrides,
  });
}

test('old single-device report = one-device protocol', () => {
  const form = ilpReport();
  assert.equal(ilp.ilpDeviceCount(form), 1);
  assert.equal(ilp.ilpDeviceViews(form)[0], form);
  assert.equal(ilp.ilpDeviceState(form), 'ok');
  const html = generateMaintenanceReportHtml(form, { companyName: 'Firma' });
  assert.equal((html.match(/ilp-device-card/g) ?? []).length, 1);
  assert.ok(html.includes('ILMALÄMPÖPUMPUT'));
  assert.ok(!html.includes('LAITETIEDOT'), 'device data lives in the card');
  assert.ok(!html.includes('>KYLMÄAINE<'), 'refrigerant lives in the card');
  assert.ok(html.includes('RXTP35') && html.includes('S/N OU-1') && html.includes('R-32 1.1 kg'));
  assert.ok(html.includes('Firma – Asiakas Oy – ILP 1'));
});

test('add / patch / copy / remove devices', () => {
  let form = ilpReport();
  form = { ...form, ...ilp.addIlpDevice(form) };
  assert.equal(ilp.ilpDeviceCount(form), 2);
  const second = ilp.ilpDeviceView(form, 1);
  assert.equal(second.laiteTunnus, '');
  assert.equal(second.asiakas, 'Asiakas Oy', 'shared fields visible in device view');
  assert.equal(second.sisayksikkoData.length, 1);

  const patch = ilp.patchIlpDevice(form, 1, { laiteTunnus: 'ILP 2', ulkoyksikkoMalli: 'RAS-25', huomiot: 'yhteinen' });
  assert.equal(patch.huomiot, 'yhteinen', 'shared key stays on report');
  assert.equal(patch.laiteTunnus, undefined, 'device key does not touch device 1');
  form = { ...form, ...patch };
  assert.equal(form.laiteTunnus, 'ILP 1');
  assert.equal(ilp.ilpDeviceView(form, 1).laiteTunnus, 'ILP 2');
  assert.deepEqual(ilp.patchIlpDevice(form, 0, { laiteTunnus: 'X' }), { laiteTunnus: 'X' });

  form = { ...form, ...ilp.addIlpDevice(form, 0) };
  const copy = ilp.ilpDeviceView(form, 2);
  assert.equal(copy.ulkoyksikkoMalli, 'RXTP35');
  assert.equal(copy.kylmaaineTyyppi, 'R-32');
  assert.equal(copy.ulkoyksikkoSarjanumero, '', 'serial not copied');
  assert.equal(copy.sisayksikkoData[0].malli, 'FTXTP35');
  assert.equal(copy.sisayksikkoData[0].sarjanumero, '');
  assert.equal(copy.sisayksikkoData[0].asennettu, null, 'inspection not copied');

  const removedFirst = { ...form, ...ilp.removeIlpDevice(form, 0) };
  assert.equal(ilp.ilpDeviceCount(removedFirst), 2);
  assert.equal(removedFirst.laiteTunnus, 'ILP 2');
  assert.equal(removedFirst.ulkoyksikkoMalli, 'RAS-25');
  const removedMiddle = { ...form, ...ilp.removeIlpDevice(form, 1) };
  assert.equal(ilp.ilpDeviceCount(removedMiddle), 2);
  assert.equal(ilp.ilpDeviceView(removedMiddle, 1).ulkoyksikkoMalli, 'RXTP35');
});

test('multi-device print = one protocol, card per device, shared header/notes/footer', () => {
  let form = ilpReport({ huomiot: 'Yhteinen huomio' });
  form = { ...form, ...ilp.addIlpDevice(form) };
  form = { ...form, ...ilp.patchIlpDevice(form, 1, { laiteTunnus: 'ILP 2', ulkoyksikkoMalli: 'RAS-25', ulkoyksikkoTarkastusTila: 'faulty', ulkoyksikkoTarkastusHuomio: 'Piirikortti rikki' }) };
  const html = generateMaintenanceReportHtml(form, { companyName: 'Firma' });
  assert.equal((html.match(/ilp-device-card/g) ?? []).length, 2);
  assert.equal((html.match(/Huoltopöytäkirja/g) ?? []).length, 1);
  assert.equal((html.match(/HUOMIOT JA LISÄTIEDOT/g) ?? []).length, 1);
  assert.equal((html.match(/class="footer"/g) ?? []).length, 1);
  assert.ok(html.includes('2 ilmalämpöpumppua'));
  assert.ok(html.includes('Laitteita <strong>2</strong>'));
  assert.ok(html.includes('Vika: Piirikortti rikki'));
  assert.ok(html.indexOf('1. ILP 1') < html.indexOf('2. ILP 2'));
  assert.equal(ilp.ilpDeviceState(ilp.ilpDeviceView(form, 1)), 'faulty');
  assert.ok(buildMaintenanceReportPrintTitle(form).includes('2 laitetta'));
});

test('tab completion and summary cover all devices', () => {
  let form = ilpReport();
  assert.equal(ilp.ilpDevicesCompletion(form), 'ok');
  form = { ...form, ...ilp.addIlpDevice(form) };
  assert.equal(ilp.ilpDevicesCompletion(form), 'incomplete');
  assert.deepEqual(ilp.ilpLaitteetSummaryRows(form), [{ label: 'Laitteita', value: '2 kpl' }, { label: 'Tulos', value: 'Kesken (Laite 2)' }]);
  const customer = {
    profileCompanyId: 'co-1',
    reportOwnerCompanyId: 'co-1',
    reportOwnerTargets: [{ id: 'co-1', name: 'Test' }],
    customerId: 'cu-1',
    asiakas: 'Asiakas Oy',
    osoite: 'Testikatu 1',
    canEditCustomerEquipment: true,
  };
  const device = {
    laiteTyyppi: form.laiteTyyppi,
    laiteValmistaja: 'Daikin',
    laiteMalli: 'X',
    laiteTunnus: 'ILP 1',
    laiteSarjanumero: '',
    laiteSijainti: 'Olohuone',
    laiteKayttotarkoitus: '',
    kylmaaineTyyppi: 'R-32',
    kylmaainePiireja: '1',
    selectedModules: form.selectedModules,
  };
  const tabBuild = {
    laiteTyyppi: form.laiteTyyppi,
    selectedModules: form.selectedModules,
    customModules: [],
    showEvaporatorSection: false,
    showCondenserSection: false,
    showLauhdutuspiiriSection: false,
    showNestelauhduttimetSection: false,
    showJaahdytysvesiSection: false,
    showVapaajahdytysSection: false,
    showKonvektoritSection: false,
    showLampopumppuSection: true,
    showMlpSection: false,
    showChillerKiinteistoSection: false,
    showChillerEnergySection: false,
  };
  assert.equal(buildMaintenanceReportTabCompletion(form, customer, device, tabBuild).lampopumppu, 'incomplete');
  const first = ilpReport();
  assert.equal(buildMaintenanceReportTabCompletion(first, customer, device, tabBuild).lampopumppu, 'ok');
  const withTest = ilpReport({ selectedModules: { ...first.selectedModules, tiiveyskoe: true } });
  const completion = buildMaintenanceReportTabCompletion(withTest, customer, device, { ...tabBuild, selectedModules: withTest.selectedModules });
  assert.equal(completion.tiiveyskoe, undefined, 'no shared tiiveyskoe tab for ILP');
  assert.equal(buildMaintenanceReportTabCompletion(first, customer, device, tabBuild).huoltotiedot, 'ok');
  const faultyFirst = ilpReport({ ulkoyksikkoTarkastusTila: 'faulty', huoltoLaiteessaVika: false });
  assert.equal(buildMaintenanceReportTabCompletion(faultyFirst, customer, device, tabBuild).huoltotiedot, 'attention');
  assert.equal(completion.lampopumppu, 'incomplete', 'unfinished device-1 test keeps the device incomplete');
});

test('legacy visit: several one-device reports merge into one protocol', () => {
  const r3 = ilpReport({ laiteTunnus: 'ILP 3', ulkoyksikkoMalli: 'MUZ', huomiot: 'Kolmosen huomio', huoltoSuorittajaNimi: 'Asentaja' });
  const r1 = ilpReport({
    laiteTunnus: 'ILP 1',
    huomiotLiitteet: [{ id: 'maintenance-photos/a.jpg', storagePath: 'maintenance-photos/a.jpg', name: 'a.jpg' }],
    selectedModules: { ...createEmptyHuoltoReportData().selectedModules, tiiveyskoe: true },
    tiiveyskoeData: { ...createEmptyHuoltoReportData().tiiveyskoeData, testipaineBar: '25', todisteKuvat: [{ storagePath: 'maintenance-photos/tk.jpg', comment: '' }] },
  });
  const r2 = ilpReport({ laiteTunnus: 'ILP 2', huoltoLaiteessaVika: true, huoltoSuoritettu: false });
  const merged = ilp.mergeIlpVisitReports(r3, [r1, r2]);
  assert.equal(ilp.ilpDeviceCount(merged), 3);
  const labels = ilp.ilpDeviceViews(merged).map((v, i) => ilp.ilpDeviceLabel(v, i));
  assert.deepEqual(labels, ['ILP 1', 'ILP 2', 'ILP 3'], 'sorted by tunnus');
  assert.equal(ilp.ilpDeviceView(merged, 2).ilpLaiteHuomiot, 'Kolmosen huomio');
  assert.equal(ilp.ilpDeviceView(merged, 1).ilpLaiteHuomiot, undefined, 'no note leak from device 1');
  assert.equal(merged.huomiot, '');
  assert.equal(merged.huoltoLaiteessaVika, true);
  assert.equal(merged.huoltoSuoritettu, false);
  assert.equal(merged.huomiotLiitteet.length, 1);
  assert.equal(merged.selectedModules.tiiveyskoe, true, 'ILP 1 (device 1) keeps its tiiveyskoe');
  assert.equal(merged.tiiveyskoeData.testipaineBar, '25');
  assert.equal(ilp.ilpDeviceTestEnabled(ilp.ilpDeviceView(merged, 1), 'tiiveyskoe'), false);
  assert.ok(collectMaintenancePrintImagePaths(merged).includes('maintenance-photos/tk.jpg'));

  const html = generateMaintenanceReportHtml(merged, { companyName: 'Firma' });
  assert.equal((html.match(/ilp-device-card/g) ?? []).length, 3);
  assert.ok(!html.includes('TIIVEYSKOE'), 'no shared tiiveyskoe box');
  assert.equal((html.match(/25 bar/g) ?? []).length, 1, 'test printed once, in the card');
  assert.ok(html.includes('Kolmosen huomio'));
  assert.ok(html.includes('3 ilmalämpöpumppua'));
  assert.equal(ilp.mergeIlpVisitReports(r1, []), r1);
});

test('legacy visit: tests of a later report stay with that device', () => {
  const empty = createEmptyHuoltoReportData();
  const r1 = ilpReport({ laiteTunnus: 'ILP 1' });
  const r2 = ilpReport({
    laiteTunnus: 'ILP 2',
    selectedModules: { ...empty.selectedModules, tyhjiointi: true },
    tyhjiointiData: { ...empty.tyhjiointiData, loppupaineArvo: '300', tulos: 'hyvaksytty' },
  });
  const merged = ilp.mergeIlpVisitReports(r1, [r2]);
  assert.equal(merged.selectedModules.tyhjiointi, false);
  const second = ilp.ilpDeviceView(merged, 1);
  assert.equal(ilp.ilpDeviceTestEnabled(second, 'tyhjiointi'), true);
  assert.equal(second.tyhjiointiData.loppupaineArvo, '300');
});

test('per-device tiiveyskoe / tyhjiöinti', () => {
  let form = ilpReport();
  form = { ...form, ...ilp.addIlpDevice(form) };
  form = { ...form, ...ilp.patchIlpDevice(form, 1, { laiteTunnus: 'ILP 2', ulkoyksikkoTarkastusTila: 'ok', sisayksikkoData: form.sisayksikkoData, mittausLammitysTestattu: true, mittausSisayksikot: form.mittausSisayksikot }) };
  assert.equal(ilp.ilpDeviceState(ilp.ilpDeviceView(form, 1)), 'ok');

  // device 2 test does not touch device 1 / shared modules
  const enable = ilp.setIlpDeviceTestEnabled(form, 1, 'tiiveyskoe', true);
  assert.equal(enable.selectedModules, undefined);
  form = { ...form, ...enable };
  assert.equal(form.selectedModules.tiiveyskoe, false);
  assert.equal(form.ilpLisaLaitteet[0].ilpLaiteTiiveyskoeKaytossa, true);
  let second = ilp.ilpDeviceView(form, 1);
  assert.equal(ilp.ilpDeviceTestEnabled(second, 'tiiveyskoe'), true);
  assert.equal(ilp.ilpDeviceTestEnabled(ilp.ilpDeviceView(form, 0), 'tiiveyskoe'), false);
  assert.equal(ilp.ilpDeviceState(second), 'incomplete', 'unfinished test');

  form = { ...form, ...ilp.patchIlpDevice(form, 1, { tiiveyskoeData: { ...second.tiiveyskoeData, testipaineBar: '42', tulos: 'hylatty' } }) };
  assert.equal(form.tiiveyskoeData.testipaineBar, '', 'device 1 data untouched');
  second = ilp.ilpDeviceView(form, 1);
  assert.equal(second.tiiveyskoeData.testipaineBar, '42');
  assert.equal(ilp.ilpDeviceState(second), 'faulty', 'failed test = fault');

  // device 1 uses the flat report fields
  assert.deepEqual(ilp.setIlpDeviceTestEnabled(form, 0, 'tyhjiointi', true).selectedModules.tyhjiointi, true);
  form = { ...form, ...ilp.setIlpDeviceTestEnabled(form, 0, 'tyhjiointi', true) };
  form = { ...form, ...ilp.patchIlpDevice(form, 0, { tyhjiointiData: { ...form.tyhjiointiData, loppupaineArvo: '250', tulos: 'hyvaksytty' } }) };
  assert.equal(form.tyhjiointiData.loppupaineArvo, '250');
  assert.equal(ilp.ilpDeviceTestEnabled(ilp.ilpDeviceView(form, 1), 'tyhjiointi'), false);

  // photo tags
  assert.equal(ilp.ilpDevicePhotoTag(form, 0), undefined);
  const tag = ilp.ilpDevicePhotoTag(form, 1);
  assert.equal(tag, `ilp-${form.ilpLisaLaitteet[0].id.replace(/[^A-Za-z0-9-]/g, '')}`);
  form = { ...form, ...ilp.patchIlpDevice(form, 1, { tiiveyskoeData: { ...second.tiiveyskoeData, todisteKuvat: [{ storagePath: `r/tiiveyskoe/${tag}--u-a.jpg`, comment: '' }] } }) };
  assert.ok(collectMaintenancePrintImagePaths(form).includes(`r/tiiveyskoe/${tag}--u-a.jpg`));

  // print: tests inside the cards, no shared boxes
  const html = generateMaintenanceReportHtml(form, { companyName: 'Firma' });
  assert.ok(!html.includes('TIIVEYSKOE') && !html.includes('TYHJIÖINTI'));
  const cards = html.split('ilp-device-card').slice(1);
  assert.equal(cards.length, 2);
  assert.ok(cards[0].includes('Tyhjiöinti') && !cards[0].includes('Tiiveyskoe'));
  assert.ok(cards[1].includes('Tiiveyskoe') && cards[1].includes('42 bar') && !cards[1].includes('Tyhjiöinti'));

  // removing device 1 promotes device 2 incl. its tests
  const promoted = { ...form, ...ilp.removeIlpDevice(form, 0) };
  assert.equal(ilp.ilpDeviceCount(promoted), 1);
  assert.equal(promoted.selectedModules.tiiveyskoe, true);
  assert.equal(promoted.selectedModules.tyhjiointi, false);
  assert.equal(promoted.tiiveyskoeData.testipaineBar, '42');
  assert.equal(promoted.ilpLaiteTiiveyskoeKaytossa, undefined);
});

test('ILP has no shared test entries / completion; other types keep them', () => {
  const tabs = [{ id: 'lampopumppu', label: 'Lämpöpumppu' }, { id: 'huomiot', label: 'Huomiot' }];
  const form = ilpReport({ selectedModules: { ...createEmptyHuoltoReportData().selectedModules, tiiveyskoe: true, tyhjiointi: true } });
  const entries = buildMaintenanceDocumentEntries(tabs, form).map((e) => e.tabId);
  assert.ok(!entries.includes('tiiveyskoe') && !entries.includes('tyhjiointi'));
  assert.equal(ilp.usesSharedServiceTests('lämpöpumppu'), false);
  assert.equal(ilp.usesSharedServiceTests('vesi-ilmalämpöpumppu'), true);
  assert.equal(ilp.usesSharedServiceTests('konvektorit'), false);
  const other = { ...form, laiteTyyppi: 'vesi-ilmalämpöpumppu' };
  const otherEntries = buildMaintenanceDocumentEntries(tabs, other).map((e) => e.tabId);
  assert.ok(otherEntries.includes('tiiveyskoe') && otherEntries.includes('tyhjiointi'));
  const html = generateMaintenanceReportHtml({ ...other, tiiveyskoeData: { ...other.tiiveyskoeData, testipaineBar: '30' } }, { companyName: 'Firma' });
  assert.ok(html.includes('TIIVEYSKOE'), 'non-ILP keeps the shared box');
});

test('photo rows are split per device', () => {
  assert.equal(ilpPhotoTagOwner('r/tiiveyskoe/ilp-abc-1--u1-a--b.jpg'), 'abc-1');
  assert.equal(ilpPhotoTagOwner('r/tiiveyskoe/u1-a.jpg'), null);
  const rows = [
    { storage_path: 'r/tiiveyskoe/u1-a.jpg' },
    { storage_path: 'r/tiiveyskoe/ilp-dev2--u2-b.jpg' },
    { storage_path: 'r/tiiveyskoe/ilp-gone--u3-c.jpg' },
    { storage_path: 'r/tiiveyskoe/u4-d.jpg' },
  ];
  const [d1, d2] = partitionPhotoRowsByDevice(rows, [
    { id: null, json: [] },
    { id: 'dev2', json: [{ storagePath: 'r/tiiveyskoe/u4-d.jpg', comment: '' }] },
  ]);
  assert.deepEqual(d1.map((r) => r.storage_path), ['r/tiiveyskoe/u1-a.jpg']);
  assert.deepEqual(d2.map((r) => r.storage_path), ['r/tiiveyskoe/ilp-dev2--u2-b.jpg', 'r/tiiveyskoe/u4-d.jpg']);
});

test('overall verdict is derived from the devices', () => {
  const okForm = ilpReport();
  assert.equal(ilp.ilpOverallVerdict(okForm).state, 'ok');
  let html = generateMaintenanceReportHtml(okForm, { companyName: 'Firma' });
  assert.ok(html.includes('Ei vikaa havaittu'));

  // incomplete device → incomplete verdict
  let form = { ...okForm, ...ilp.addIlpDevice(okForm) };
  form = { ...form, ...ilp.patchIlpDevice(form, 1, { laiteTunnus: 'ILP 2' }) };
  assert.deepEqual(ilp.ilpOverallVerdict(form), { state: 'incomplete', faulty: [], incomplete: ['ILP 2'] });
  html = generateMaintenanceReportHtml(form, { companyName: 'Firma' });
  assert.ok(html.includes('Kesken (ILP 2)') && !html.includes('Ei vikaa havaittu'));

  // faulty device wins; manual "no fault" cannot hide it
  form = { ...form, ...ilp.patchIlpDevice(form, 1, { ulkoyksikkoTarkastusTila: 'faulty' }), huoltoLaiteessaVika: false };
  form = { ...form, ...ilp.addIlpDevice(form) };
  const v = ilp.ilpOverallVerdict(form);
  assert.equal(v.state, 'faulty');
  assert.deepEqual(v.faulty, ['ILP 2']);
  html = generateMaintenanceReportHtml(form, { companyName: 'Firma' });
  assert.ok(html.includes('Vika havaittu (ILP 2)') && !html.includes('Ei vikaa havaittu'));
  assert.deepEqual(ilp.ilpLaitteetSummaryRows(form).map((r) => r.label), ['Laitteita', 'Tulos', 'Kesken']);

  // failed device test (device 2) = fault
  let t = { ...okForm, ...ilp.addIlpDevice(okForm, 0) };
  t = { ...t, ...ilp.patchIlpDevice(t, 1, { laiteTunnus: 'ILP 2', ulkoyksikkoTarkastusTila: 'ok', sisayksikkoData: okForm.sisayksikkoData.map((u) => ({ ...u, sarjanumero: 'IU-2' })) }) };
  assert.equal(ilp.ilpOverallVerdict(t).state, 'ok');
  t = { ...t, ...ilp.setIlpDeviceTestEnabled(t, 1, 'tyhjiointi', true) };
  t = { ...t, ...ilp.patchIlpDevice(t, 1, { tyhjiointiData: { ...ilp.ilpDeviceView(t, 1).tyhjiointiData, loppupaineArvo: '900', tulos: 'hylatty' } }) };
  assert.deepEqual(ilp.ilpOverallVerdict(t).faulty, ['ILP 2']);

  // manual flag only adds a fault
  const manual = { ...okForm, huoltoLaiteessaVika: true };
  assert.equal(ilp.ilpOverallVerdict(manual).state, 'faulty');
  html = generateMaintenanceReportHtml(manual, { companyName: 'Firma' });
  assert.ok(html.includes('Vika havaittu') && !html.includes('Ei vikaa havaittu'));

  // other device types keep the manual line
  const other = { ...createEmptyHuoltoReportData(), laiteTyyppi: 'vesi-ilmalämpöpumppu', huoltoLaiteessaVika: false };
  html = generateMaintenanceReportHtml(other, { companyName: 'Firma' });
  assert.ok(html.includes('Ei vikaa havaittu'));
  html = generateMaintenanceReportHtml({ ...other, huoltoLaiteessaVika: true }, { companyName: 'Firma' });
  assert.ok(html.includes('Laiteessa vika havaittu'));
});

test('legacy merged visit: verdict follows the device cards', () => {
  const r1 = ilpReport({ laiteTunnus: 'ILP 1' });
  const r2 = ilpReport({ laiteTunnus: 'ILP 2', ulkoyksikkoTarkastusTila: 'faulty', huoltoLaiteessaVika: false });
  const merged = ilp.mergeIlpVisitReports(r1, [r2]);
  assert.equal(merged.huoltoLaiteessaVika, false);
  const html = generateMaintenanceReportHtml(merged, { companyName: 'Firma' });
  assert.ok(html.includes('Vika havaittu (ILP 2)') && !html.includes('Ei vikaa havaittu'));
});

test('legacy presence checkboxes are not a fault', () => {
  const legacy = ilpReport({ ulkoyksikkoTarkastusTila: undefined, ulkoyksikkoKennosPuhdas: true, ulkoyksikkoTurvakytkin: true, ulkoyksikkoSuojakotelo: false });
  assert.equal(ilp.ilpUlkoyksikkoStatus(legacy), 'ok');
  const empty = ilpReport({ ulkoyksikkoTarkastusTila: undefined, ulkoyksikkoKennosPuhdas: false, ulkoyksikkoTurvakytkin: false, ulkoyksikkoSuojakotelo: false });
  assert.equal(ilp.ilpUlkoyksikkoStatus(empty), null);
  assert.equal(ilp.ilpDeviceState(empty), 'incomplete');
});

test('other device types are untouched', () => {
  const form = { ...createEmptyHuoltoReportData(), laiteTyyppi: 'konvektorit', ilpLisaLaitteet: [{ id: 'x' }] };
  assert.equal(ilp.ilpDeviceCount(form), 1);
  assert.equal(ilp.isIlpDeviceKey('laiteTyyppi'), false);
  assert.equal(ilp.isIlpDeviceKey('kylmaainePiiri1'), false);
  assert.equal(ilp.isIlpDeviceKey('kylmaaineTyyppi'), true);
  assert.equal(ilp.isIlpDeviceKey('huomiot'), false);
});

console.log('test-ilp-multi-device-protocol: ok');
