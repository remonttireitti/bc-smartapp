import assert from 'node:assert/strict';
import {
  duplicateEquipmentTunnusError,
  equipmentTunnusConflicts,
} from '../src/lib/huoltoRaportti/equipmentTunnusUniqueness.ts';
import { applySiblingEquipmentCopyFields } from '../src/lib/huoltoRaportti/siblingEquipmentCopy.ts';

const rows = [
  { id: 'eq-1', name: 'ILP 2', tag: 'ILP 2' },
  { id: 'eq-2', name: 'ILP 3', tag: 'ILP 3' },
];

assert.equal(equipmentTunnusConflicts(rows, 'ILP 3')?.id, 'eq-2');
assert.equal(equipmentTunnusConflicts(rows, 'ilp 3')?.id, 'eq-2');
assert.equal(equipmentTunnusConflicts(rows, 'ILP 3', 'eq-2'), null);
assert.equal(equipmentTunnusConflicts(rows, 'ILP 4'), null);
assert.equal(equipmentTunnusConflicts(rows, '  '), null);

const err = duplicateEquipmentTunnusError('ILP 3');
assert.match(err.message, /ILP 3/);
assert.match(err.message, /uniikki/i);

const source = {
  type: 'huolto',
  laiteTyyppi: 'ilmalampopumppu',
  laiteTunnus: 'ILP 2',
  laiteMalli: 'Polar',
  laiteValmistaja: 'Toshiba',
  laiteSarjanumero: 'ABC',
  laiteSijainti: 'Ulkona',
  asiakas: 'Testi',
  selectedModules: [],
  visitedModuleIds: ['x'],
};
const cloned = applySiblingEquipmentCopyFields(source, {
  tunnus: 'ILP 3',
  sarjanumero: 'XYZ',
  sameModel: true,
});
assert.equal(cloned.laiteTunnus, 'ILP 3');
assert.equal(cloned.laiteSarjanumero, 'XYZ');
assert.equal(cloned.laiteMalli, 'Polar');
assert.ok(cloned.laiteSijainti.trim(), 'missing sijainti is filled for copy');
assert.deepEqual(cloned.visitedModuleIds, []);

console.log('test-sibling-equipment-copy: ok');
