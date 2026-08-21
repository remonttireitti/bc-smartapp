import assert from 'node:assert/strict';
import { createEmptyHuoltoReportData } from '../src/lib/huoltoRaportti/defaults.ts';
import {
  isMaintenanceModuleVisited,
  markMaintenanceModuleVisited,
  resolveModuleTilePresentation,
} from '../src/lib/huoltoRaportti/maintenanceModuleVisit.ts';

function test(name, fn) {
  try {
    fn();
    console.log(`OK ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const empty = createEmptyHuoltoReportData();

test('unvisited module shows Täyttämättä even when data looks complete', () => {
  const form = {
    ...empty,
    huomiot: 'Kaikki ok',
    visitedModuleIds: [],
  };
  const presentation = resolveModuleTilePresentation('huomiot', form, 'ok');
  assert.equal(presentation.subtitle, 'Täyttämättä');
  assert.equal(presentation.showCheck, false);
});

test('visited module with faulty inspection shows yellow attention label', () => {
  const form = {
    ...empty,
    visitedModuleIds: ['hoyrystin'],
  };
  const presentation = resolveModuleTilePresentation('hoyrystin', form, 'attention');
  assert.equal(presentation.subtitle, 'Tarkastettu, huomioita');
  assert.equal(presentation.showAttention, true);
});

test('markMaintenanceModuleVisited is idempotent', () => {
  const once = markMaintenanceModuleVisited([], 'kylmaaine');
  const twice = markMaintenanceModuleVisited(once, 'kylmaaine');
  assert.deepEqual(once, ['kylmaaine']);
  assert.equal(twice, once);
  assert.equal(isMaintenanceModuleVisited({ ...empty, visitedModuleIds: once }, 'kylmaaine'), true);
});

console.log('All module visit tests passed.');
