import assert from 'node:assert/strict';
import {
  buildMaintenanceHistoryForEquipment,
  buildMaintenanceHistoryPrintHtml,
  plainTextFromHuomioNotes,
} from '../src/lib/equipmentMaintenanceHistory.ts';
import {
  huoltoReportMatchesEquipment,
  isUsableEquipmentIdentity,
} from '../src/lib/equipmentHuoltoSnapshotSync.ts';

assert.equal(isUsableEquipmentIdentity('ei tiedossa'), false);
assert.equal(isUsableEquipmentIdentity('EI TIEDOSSA'), false);
assert.equal(isUsableEquipmentIdentity('—'), false);
assert.equal(isUsableEquipmentIdentity('ILP-1'), true);

const eq1 = {
  id: 'eq-1',
  customer_id: 'cust-1',
  name: 'ILP 1',
  tag: 'ILP 1',
  serial_number: 'ei tiedossa',
  device_type: 'ilmalämpöpumppu',
};
const eq2 = {
  id: 'eq-2',
  customer_id: 'cust-1',
  name: 'ILP 2',
  tag: 'ILP 2',
  serial_number: 'ei tiedossa',
  device_type: 'ilmalämpöpumppu',
};

// Placeholder serial must not cross-match every device.
assert.equal(
  huoltoReportMatchesEquipment(
    { laiteTunnus: 'ILP X', laiteSarjanumero: 'ei tiedossa' },
    eq1,
  ),
  false,
);
assert.equal(
  huoltoReportMatchesEquipment({ laiteTunnus: 'ILP 1', laiteSarjanumero: 'ei tiedossa' }, eq1),
  true,
);
assert.equal(
  huoltoReportMatchesEquipment({ laiteTunnus: 'ILP 1', laiteSarjanumero: 'ei tiedossa' }, eq2),
  false,
);

assert.equal(plainTextFromHuomioNotes('<strong>H</strong>'), 'H');
assert.equal(plainTextFromHuomioNotes('Normaali huomio'), 'Normaali huomio');
assert.equal(plainTextFromHuomioNotes('<p>Rivi 1</p><p>Rivi 2</p>'), 'Rivi 1\nRivi 2');

const maintenanceRows = [
  {
    id: 'm1',
    equipment_id: 'eq-1',
    data: {
      laiteTunnus: 'ILP 1',
      asiakasNimi: 'Villa',
      huomiot: '<strong>H</strong>',
      huomiotLuonne: 'kommentti',
      huoltoPaivamaara: '2026-09-18',
    },
    updated_at: '2026-09-18T20:00:00Z',
    completed_at: '2026-09-18T20:00:00Z',
    created_at: '2026-09-18T19:00:00Z',
  },
  {
    id: 'm2',
    equipment_id: null,
    data: {
      laiteTunnus: 'muu',
      laiteSarjanumero: 'ei tiedossa',
      asiakasNimi: 'Villa',
      huomiot: 'Väärä osuma',
      huomiotLuonne: 'kommentti',
      huoltoPaivamaara: '2026-09-17',
    },
    updated_at: '2026-09-17T20:00:00Z',
    completed_at: null,
    created_at: '2026-09-17T19:00:00Z',
  },
];

const workRows = [
  {
    id: 'w-multi',
    equipment_id: 'eq-1',
    equipment_ids: ['eq-1', 'eq-2'],
    title: 'Ilmalämpöpumppujen huolto',
    description: 'Tarkistetaan',
    scheduled_start: '2026-09-18T21:07:57Z',
    completed_at: null,
    updated_at: '2026-09-18T21:07:57Z',
    created_at: '2026-09-18T21:07:57Z',
  },
  {
    id: 'w-stale-fk',
    equipment_id: 'eq-1',
    // Junction says only eq-2 — stale legacy FK must not force eq-1 back in
    // when loadCustomerMaintenanceContext prefers junction rows.
    equipment_ids: ['eq-2'],
    title: 'Vain ILP 2',
    description: null,
    scheduled_start: '2026-09-18T20:00:00Z',
    completed_at: null,
    updated_at: '2026-09-18T20:00:00Z',
    created_at: '2026-09-18T20:00:00Z',
  },
];

const hist1 = buildMaintenanceHistoryForEquipment(eq1, maintenanceRows, workRows);
const hist2 = buildMaintenanceHistoryForEquipment(eq2, maintenanceRows, workRows);

assert.equal(hist1.some((e) => e.kind === 'huoltoraportti'), true);
assert.equal(hist2.some((e) => e.kind === 'huoltoraportti'), false, 'ei tiedossa must not leak huolto to ILP 2');
assert.equal(hist1.some((e) => e.summary.includes('Ilmalämpöpumppujen huolto')), true);
assert.equal(hist2.some((e) => e.summary.includes('Ilmalämpöpumppujen huolto')), true);
assert.equal(hist1.some((e) => e.summary.includes('Vain ILP 2')), false);
assert.equal(hist2.some((e) => e.summary.includes('Vain ILP 2')), true);

const html = buildMaintenanceHistoryPrintHtml({
  customerName: 'Huvila Villa Tammikko',
  sections: [{ deviceLabel: 'ILP 1 — ILP 1', entries: hist1 }],
  branding: { companyName: 'Testi', logoUrl: null },
});

assert.match(html, /Huomautukset:/);
assert.doesNotMatch(html, /&lt;strong&gt;/);
assert.doesNotMatch(html, /Huomautukset:.*&lt;strong&gt;H&lt;\/strong&gt;/);
// Either rendered rich HTML or plain "H" — never escaped tags as visible text payload.
assert.match(html, /Huomautukset:[\s\S]*\bH\b/);

console.log('test-equipment-maintenance-history: ok');
