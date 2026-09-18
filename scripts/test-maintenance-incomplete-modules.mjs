import assert from 'node:assert/strict';
import { createEmptyHuoltoReportData } from '../src/lib/huoltoRaportti/defaults.ts';
import { buildMaintenanceReportTabs } from '../src/lib/huoltoRaportti/maintenanceReportTabs.ts';
import { buildMaintenanceReportTabCompletion } from '../src/lib/huoltoRaportti/maintenanceReportTabCompletion.ts';
import { listIncompleteMaintenanceModules } from '../src/lib/huoltoRaportti/maintenanceDocumentUnitEntries.ts';

function test(name, fn) {
  try {
    fn();
    console.log(`OK ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const customer = {
  profileCompanyId: 'co-1',
  reportOwnerCompanyId: 'co-1',
  reportOwnerTargets: [{ id: 'co-1', name: 'Test' }],
  customerId: 'cu-1',
  asiakas: 'Asiakas Oy',
  osoite: 'Testikatu 1',
  canEditCustomerEquipment: true,
};

const selectedModules = {
  kylmaaine: true,
  ulkoyksikko: true,
  sisayksikko: true,
  mittaukset: true,
};

const device = {
  laiteTyyppi: 'ILP',
  laiteValmistaja: 'Mitsubishi',
  laiteMalli: 'MSZ',
  laiteTunnus: 'ILP-1',
  laiteSarjanumero: 'SN1',
  laiteSijainti: 'Olohuone',
  laiteKayttotarkoitus: 'Lämmitys',
  kylmaaineTyyppi: 'R32',
  kylmaainePiireja: '1',
  selectedModules,
};

const tabBuild = {
  laiteTyyppi: 'ILP',
  selectedModules,
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

test('lists incomplete ILP tiles with Finnish titles and status labels', () => {
  const form = {
    ...createEmptyHuoltoReportData(),
    laiteTyyppi: 'ILP',
    asiakas: 'Asiakas Oy',
    osoite: 'Testikatu 1',
    laiteValmistaja: 'Mitsubishi',
    laiteMalli: 'MSZ',
    laiteTunnus: 'ILP-1',
    laiteSarjanumero: 'SN1',
    laiteSijainti: 'Olohuone',
    kylmaaineTyyppi: 'R32',
    kylmaainePiireja: '1',
    selectedModules,
    visitedModuleIds: ['lampopumppu:ulkoyksikko'],
  };

  const tabs = buildMaintenanceReportTabs(tabBuild);
  const completion = buildMaintenanceReportTabCompletion(form, customer, device, tabBuild);
  const incomplete = listIncompleteMaintenanceModules(tabs, form, completion);
  const titles = incomplete.map((row) => row.title);

  assert.ok(titles.includes('Ulkoyksikkö'));
  assert.ok(titles.includes('Sisäyksiköt'));
  assert.ok(titles.includes('Mittaukset'));
  assert.ok(titles.some((title) => /Huolto/i.test(title)));
  assert.equal(
    incomplete.find((row) => row.title === 'Ulkoyksikkö')?.statusLabel,
    'Kesken',
  );
  assert.ok(
    incomplete.every((row) => row.statusLabel === 'Täyttämättä' || row.statusLabel === 'Kesken'),
  );
});

test('returns empty list when every document tile is ok or attention', () => {
  const form = {
    ...createEmptyHuoltoReportData(),
    laiteTyyppi: 'ILP',
    asiakas: 'Asiakas Oy',
    osoite: 'Testikatu 1',
    laiteValmistaja: 'Mitsubishi',
    laiteMalli: 'MSZ',
    laiteTunnus: 'ILP-1',
    laiteSarjanumero: 'SN1',
    laiteSijainti: 'Olohuone',
    kylmaaineTyyppi: 'R32',
    kylmaainePiireja: '1',
    selectedModules: {},
    huoltoSuoritettu: true,
    huoltoPaivamaara: '2026-09-18',
  };

  const tabs = buildMaintenanceReportTabs({
    ...tabBuild,
    selectedModules: {},
    showLampopumppuSection: false,
  });
  const completion = buildMaintenanceReportTabCompletion(
    form,
    customer,
    { ...device, selectedModules: {} },
    { ...tabBuild, selectedModules: {}, showLampopumppuSection: false },
  );
  // Force tab completions so only huomiot/huoltotiedot/raportointi remain.
  const forced = Object.fromEntries(Object.keys(completion).map((id) => [id, 'ok']));
  const incomplete = listIncompleteMaintenanceModules(tabs, form, forced);
  assert.deepEqual(incomplete, []);
});

console.log('test-maintenance-incomplete-modules: ok');
