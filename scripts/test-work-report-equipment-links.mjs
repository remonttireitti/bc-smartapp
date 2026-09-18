import assert from 'node:assert/strict';
import {
  formatWorkReportEquipmentList,
} from '../src/lib/workReportEquipment.ts';
import { WORK_REPORT_NO_EQUIPMENT_LABEL } from '../src/types/index.ts';

assert.equal(formatWorkReportEquipmentList([]), WORK_REPORT_NO_EQUIPMENT_LABEL);
assert.equal(
  formatWorkReportEquipmentList([{ name: 'ILP 1', tag: 'ILP 1' }]),
  'ILP 1 — ILP 1',
);
assert.equal(
  formatWorkReportEquipmentList([
    { name: 'ILP 1', tag: 'ILP 1' },
    { name: 'ILP 2', tag: null },
  ]),
  'ILP 1 — ILP 1, ILP 2',
);

console.log('test-work-report-equipment-links: ok');
