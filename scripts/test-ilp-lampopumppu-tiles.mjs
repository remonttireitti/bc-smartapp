import assert from 'node:assert/strict';
import { createEmptyHuoltoReportData } from '../src/lib/huoltoRaportti/defaults.ts';
import { buildLampopumppuDocumentUnits } from '../src/lib/huoltoRaportti/lampopumppuDocumentHelpers.ts';
import {
  buildMaintenanceDocumentEntries,
  documentEntryUsesDialogLauncher,
  documentNavTargetTabId,
} from '../src/lib/huoltoRaportti/maintenanceDocumentUnitEntries.ts';
import { maintenanceTabUsesDialogLauncher } from '../src/lib/huoltoRaportti/maintenanceDocumentDialogTabs.ts';
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

test('ILP lampopumppu is one device-list tile (konvektori pattern)', () => {
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
  assert.equal(entries.filter((entry) => entry.kind === 'lampopumppuUnit').length, 0);
  const ilpEntry = entries.find((entry) => entry.tabId === 'lampopumppu');
  assert.equal(ilpEntry?.kind, 'tab');
  assert.ok(!documentEntryUsesDialogLauncher(ilpEntry));
  assert.ok(maintenanceTabUsesDialogLauncher('lampopumppu'));
  assert.equal(documentNavTargetTabId('lampopumppu', form), 'lampopumppu');
  assert.equal(documentNavTargetTabId('lampopumppu:sisayksikko', form), 'lampopumppu');
});

test('vesi-ilmalämpöpumppu keeps the unit tiles', () => {
  const base = createEmptyHuoltoReportData();
  const form = {
    ...base,
    laiteTyyppi: 'vesiilmalampopumppu',
    selectedModules: { ...base.selectedModules, ulkoyksikko: true },
  };
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
  assert.ok(entries.some((entry) => entry.kind === 'lampopumppuUnit'));
  assert.ok(!entries.some((entry) => entry.tabId === 'lampopumppu' && entry.kind === 'tab'));
  assert.ok(documentNavTargetTabId('lampopumppu', form).startsWith('lampopumppu:'));
});

console.log('test-ilp-lampopumppu-tiles: ok');
