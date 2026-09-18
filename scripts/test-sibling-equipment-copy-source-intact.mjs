import assert from 'node:assert/strict';
import { createEmptyHuoltoReportData } from '../src/lib/huoltoRaportti/defaults.ts';
import { applySiblingEquipmentCopyFields } from '../src/lib/huoltoRaportti/siblingEquipmentCopy.ts';

function test(name, fn) {
  try {
    fn();
    console.log(`OK ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test('sibling copy does not mutate source form tunnus', () => {
  const source = {
    ...createEmptyHuoltoReportData(),
    laiteTyyppi: 'lämpöpumppu',
    laiteTunnus: 'ILP 2',
    laiteMalli: 'Toshiba Polar',
    laiteValmistaja: 'Toshiba',
    laiteSarjanumero: 'OLD-SN',
  };
  const frozen = structuredClone(source);

  const next = applySiblingEquipmentCopyFields(source, {
    tunnus: 'ILP 3',
    sarjanumero: '',
    sameModel: true,
  });

  assert.equal(next.laiteTunnus, 'ILP 3');
  assert.equal(next.laiteMalli, 'Toshiba Polar');
  assert.equal(source.laiteTunnus, 'ILP 2');
  assert.equal(source.laiteSarjanumero, 'OLD-SN');
  assert.deepEqual(source, frozen);
});

console.log('test-sibling-equipment-copy-source-intact: ok');
