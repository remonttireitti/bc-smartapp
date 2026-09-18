import assert from 'node:assert/strict';
import {
  createEmptyMittausSisayksikkoData,
  ensureMittausSisayksikkoData,
} from '../src/lib/huoltoRaportti/defaults.ts';

function test(name, fn) {
  try {
    fn();
    console.log(`OK ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

test('legacy shared temps migrate into heating fields', () => {
  const migrated = ensureMittausSisayksikkoData({
    ...createEmptyMittausSisayksikkoData(),
    sisalampotila: '21',
    paluuLampotila: '25.6',
    puhallusLampotila: '51.8',
    ilmanmaaraM3h: '596',
  });
  assert.equal(migrated.sisalampotilaLammitys, '21');
  assert.equal(migrated.paluuLampotilaLammitys, '25.6');
  assert.equal(migrated.puhallusLampotilaLammitys, '51.8');
  assert.equal(migrated.ilmanmaaraM3hLammitys, '596');
  assert.equal(migrated.sisalampotilaJaahdytys, '');
});

test('mode-specific temps are kept separately', () => {
  const migrated = ensureMittausSisayksikkoData({
    sisalampotilaJaahdytys: '22',
    puhallusLampotilaJaahdytys: '12',
    sisalampotilaLammitys: '20',
    puhallusLampotilaLammitys: '45',
  });
  assert.equal(migrated.sisalampotilaJaahdytys, '22');
  assert.equal(migrated.puhallusLampotilaJaahdytys, '12');
  assert.equal(migrated.sisalampotilaLammitys, '20');
  assert.equal(migrated.puhallusLampotilaLammitys, '45');
});

console.log('test-ilp-mittaus-mode-fields: ok');
