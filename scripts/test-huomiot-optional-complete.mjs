import assert from 'node:assert/strict';
import { createEmptyHuoltoReportData } from '../src/lib/huoltoRaportti/defaults.ts';
import {
  buildMaintenanceReportTabCompletion,
  isMaintenanceReportModulesComplete,
} from '../src/lib/huoltoRaportti/maintenanceReportTabCompletion.ts';

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
  selectedModules: {},
};

test('empty huomiot is ok and does not block modulesComplete', () => {
  const form = {
    ...createEmptyHuoltoReportData(),
    laiteTyyppi: 'ILP',
    asiakas: 'Asiakas Oy',
    osoite: 'Testikatu 1',
    huoltoSuoritettu: true,
    huoltoPaivamaara: '2026-09-18',
    huomiot: '',
    selectedModules: {},
  };

  const completion = buildMaintenanceReportTabCompletion(form, customer, device, {
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
  });

  assert.equal(completion.huomiot, 'ok');
  // Force other tabs to ok/attention for the complete check.
  const forComplete = Object.fromEntries(
    Object.keys(completion).map((id) => [id, id === 'huomiot' ? 'ok' : 'ok']),
  );
  assert.equal(isMaintenanceReportModulesComplete(forComplete), true);
});

test('attention status still counts as modules complete', () => {
  assert.equal(
    isMaintenanceReportModulesComplete({
      raportointi: 'ok',
      huomiot: 'ok',
      huoltotiedot: 'attention',
    }),
    true,
  );
  assert.equal(
    isMaintenanceReportModulesComplete({
      raportointi: 'ok',
      huomiot: 'incomplete',
    }),
    false,
  );
});

console.log('test-huomiot-optional-complete: ok');
