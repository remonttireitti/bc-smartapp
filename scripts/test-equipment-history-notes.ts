import assert from 'node:assert/strict';
import { buildLatestMaintenanceByEquipment, buildMaintenanceHistoryForEquipment } from '../src/lib/equipmentMaintenanceHistory';
import type { EquipmentNote } from '../src/lib/equipmentNotes';

const eq = { id: 'e1', name: 'JK10', tag: 'JK10', customer_id: 'c1' } as never;
const note = (id: string, date: string, service: boolean): EquipmentNote => ({ id, equipment_id: 'e1', entry_date: date, author_company_name: 'Firma', installer_name: 'Asentaja', installer_tukes: 'T1', text: 'Hälytys kuitattu', is_service_visit: service, created_at: date });

// Merkintä ei päivitä viimeisintä huoltoa, huoltokäynti päivittää.
assert.deepEqual(buildLatestMaintenanceByEquipment([eq], [], [note('n1', '2026-09-01', false)]), {});
assert.deepEqual(buildLatestMaintenanceByEquipment([eq], [], [note('n1', '2026-09-01', true)]), { e1: '2026-09-01' });

// Työraportti näkyy kerran (useampi kirjaus), päivämääräjärjestys, ei duplikaatteja.
const work = [{ id: 'w1', equipment_id: 'e1', title: 'Työ', description: null, scheduled_start: null, completed_at: null, updated_at: '2026-06-01', created_at: '2026-06-01', company_name: 'Firma',
  logs: [{ id: 'l1', log_date: '2026-06-01', work_done: 'Höyrystin sulatettu', installer: 'A', tukes: 'T1' }, { id: 'l2', log_date: '2026-06-02', work_done: 'Hälytys kuitattu', installer: 'A', tukes: 'T1' }] }];
const h = buildMaintenanceHistoryForEquipment(eq, [], work as never, [note('n1', '2026-09-01', false), note('n2', '2026-05-01', true)]);
assert.equal(h.filter((x) => x.kind === 'työraportti').length, 1);
assert.deepEqual(h.map((x) => x.kind), ['huoltokäynti', 'työraportti', 'merkintä']);
assert.match(h[1].summary, /Höyrystin sulatettu \/ Hälytys kuitattu \(Firma · A, Tukes T1\)/);
console.log('equipment-history-notes ok');
