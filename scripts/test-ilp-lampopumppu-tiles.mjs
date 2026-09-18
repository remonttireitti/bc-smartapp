import assert from 'node:assert/strict';
import { createEmptyHuoltoReportData } from '../src/lib/huoltoRaportti/defaults.ts';
import { buildLampopumppuDocumentUnits } from '../src/lib/huoltoRaportti/lampopumppuDocumentHelpers.ts';
import {
  buildMaintenanceDocumentEntries,
  documentEntryUsesDialogLauncher,
} from '../src/lib/huoltoRaportti/maintenanceDocumentUnitEntries.ts';
import { buildMaintenanceReportTabs } from '../src/lib/huoltoRaportti/maintenanceReportTabs.ts';

function test(name, fn) {
  try {
    fn();
    console.log(`OK ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test('ILP lampopumppu expands to three popup tiles', () => {
  const form = {
    ...createEmptyHuoltoReportData(),
    laiteTyyppi: 'lämpöpumppu',
    selectedModules: {
      ...createEmptyHuoltoReportData().selectedModules,
      ulkoyksikko: true,
      sisayksikko: true,
      mittaukset: true,
    },
  };

  const units = buildLampopumppuDocumentUnits(form);
  assert.deepEqual(
    units.map((unit) => unit.id),
    ['ulkoyksikko', 'sisayksikko', 'mittaukset'],
  );

  const tabs = buildMaintenanceReportTabs({
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

  const entries = buildMaintenanceDocumentEntries(tabs, form);
  const lampoEntries = entries.filter((entry) => entry.kind === 'lampopumppuUnit');
  assert.equal(lampoEntries.length, 3);
  assert.ok(lampoEntries.every((entry) => documentEntryUsesDialogLauncher(entry)));
  assert.ok(!entries.some((entry) => entry.tabId === 'lampopumppu' && entry.kind === 'tab'));
});

console.log('test-ilp-lampopumppu-tiles: ok');
