import assert from 'node:assert/strict';
import {
  buildMaintenanceReportTabCompletion,
  isMaintenanceReportModulesComplete,
  listIncompleteMaintenanceTabs,
} from '../src/lib/huoltoRaportti/maintenanceReportTabCompletion.ts';
import { isRaportointiBasicsComplete } from '../src/lib/huoltoRaportti/maintenanceReportBasicsValidation.ts';
import { normalizeHuoltoReportData } from '../src/lib/huoltoRaportti/defaults.ts';
import { applySiblingEquipmentCopyFields } from '../src/lib/huoltoRaportti/siblingEquipmentCopy.ts';

const customerInput = {
  profileCompanyId: 'co-1',
  reportOwnerCompanyId: 'co-1',
  reportOwnerTargets: [{ companyId: 'co-1', label: 'Test' }],
  customerId: 'cu-1',
  asiakas: 'Asiakas',
  osoite: '',
  canEditCustomerEquipment: true,
};

const deviceInput = {
  laiteTyyppi: 'ilmalampopumppu',
  laiteValmistaja: 'Toshiba',
  laiteMalli: 'Polar',
  laiteTunnus: 'ILP 1',
  laiteSarjanumero: 'ei tiedossa',
  laiteSijainti: 'Ulkona',
  laiteKayttotarkoitus: '',
  kylmaaineTyyppi: '',
  kylmaainePiireja: '',
  selectedModules: {},
};

assert.equal(isRaportointiBasicsComplete(customerInput, deviceInput), true, 'osoite optional');

const form = normalizeHuoltoReportData({
  laiteTyyppi: 'ilmalampopumppu',
  laiteValmistaja: 'Toshiba',
  laiteMalli: 'Polar',
  laiteTunnus: 'ILP 1',
  laiteSarjanumero: 'ei tiedossa',
  laiteSijainti: 'Ulkona',
  asiakas: 'Asiakas',
  osoite: '',
  huomiot: '',
  huoltoSuoritettu: true,
  huoltoPaivamaara: '2026-09-18',
  selectedModules: {},
});

const completion = buildMaintenanceReportTabCompletion(form, customerInput, deviceInput, {
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
  showLampopumppuSection: false,
  showMlpSection: false,
  showChillerKiinteistoSection: false,
  showChillerEnergySection: false,
  hiddenTabIds: [],
  moduleTabOrder: [],
});

assert.equal(completion.huomiot, 'ok', 'empty huomiot is ok');
assert.equal(completion.raportointi, 'ok');
assert.equal(isMaintenanceReportModulesComplete(completion), true);

const withFault = {
  ...completion,
  huoltotiedot: 'attention',
};
assert.equal(isMaintenanceReportModulesComplete(withFault), true, 'attention allows complete');

const incomplete = {
  ...completion,
  lampopumppu: 'incomplete',
};
assert.equal(isMaintenanceReportModulesComplete(incomplete), false);
assert.deepEqual(
  listIncompleteMaintenanceTabs(incomplete, { lampopumppu: 'Lämpöpumppu' }),
  ['Lämpöpumppu'],
);

const sibling = applySiblingEquipmentCopyFields(form, {
  tunnus: 'ILP 2',
  sarjanumero: 'SN-2',
  sameModel: true,
});
assert.equal(sibling.laiteTunnus, 'ILP 2');
assert.ok(sibling.laiteSijainti.trim(), 'sibling copy fills missing sijainti');

console.log('test-maintenance-complete-status: ok');
