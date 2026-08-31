import assert from 'node:assert/strict';
import {
  buildEquipmentUpdateFromHuoltoReport,
  findLatestMaintenanceReportForEquipment,
  huoltoReportMatchesEquipment,
  snapshotHasTechnicalData,
} from '../src/lib/equipmentHuoltoSnapshotSync.ts';
import { fillMissingDeviceBasics } from '../src/lib/huoltoRaportti/maintenanceReportBasicsValidation.ts';

const equipment = {
  id: 'eq-1',
  customer_id: 'cust-1',
  owner_company_id: 'co-1',
  name: 'Pakastin 1',
  tag: 'P-01',
  model: null,
  serial_number: null,
  location: null,
  device_type: 'pakastin',
  huolto_technical_snapshot: null,
};

const reportData = {
  laiteTyyppi: 'pakastin',
  laiteTunnus: 'P-01',
  laiteMalli: 'ABC',
  laiteSarjanumero: '',
  laiteSijainti: 'Keittiö',
  laiteKayttotarkoitus: 'Myynti',
  kylmaaineTyyppi: 'R-404A',
  kylmaaineMaaraYhteensa: '2.5',
  kylmaaineCO2Ekv: '5.1',
};

assert.equal(huoltoReportMatchesEquipment(reportData, equipment), true);

const patch = buildEquipmentUpdateFromHuoltoReport(reportData, equipment);
assert.equal(patch.model, 'ABC');
assert.equal(patch.location, 'Keittiö');
assert.equal(patch.serial_number, undefined);
assert.equal(snapshotHasTechnicalData(patch.snapshot), true);
assert.equal(patch.snapshot.kylmaaineTyyppi, 'R-404A');

const reports = [
  {
    id: 'r-draft',
    customer_id: 'cust-1',
    equipment_id: null,
    status: 'draft',
    data: reportData,
    updated_at: '2026-01-01T00:00:00Z',
    completed_at: null,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'r-submitted',
    customer_id: 'cust-1',
    equipment_id: null,
    status: 'submitted',
    data: { ...reportData, kylmaaineMaaraYhteensa: '3.0' },
    updated_at: '2026-02-01T00:00:00Z',
    completed_at: '2026-02-01T00:00:00Z',
    created_at: '2026-02-01T00:00:00Z',
  },
];

const latest = findLatestMaintenanceReportForEquipment(equipment, reports);
assert.equal(latest?.id, 'r-submitted');

const basicsPatch = fillMissingDeviceBasics({
  laiteTyyppi: 'lämpöpumppu',
  laiteValmistaja: 'Daikin',
  laiteMalli: 'XYZ',
  laiteTunnus: 'LP-1',
  laiteSarjanumero: '',
  laiteSijainti: 'Katto',
  laiteKayttotarkoitus: '',
});
assert.equal(basicsPatch.laiteSarjanumero, 'ei tiedossa');

console.log('test-equipment-huolto-snapshot-sync: ok');
