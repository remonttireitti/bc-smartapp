import assert from 'node:assert/strict';
import {
  billableUsers,
  hasIncludedBillableLines,
} from '../src/lib/workReportPrintBillingGuards.ts';

assert.deepEqual(billableUsers(null), []);
assert.deepEqual(billableUsers({ version: 3 }), []);
assert.equal(hasIncludedBillableLines({ version: 3, byUser: undefined }), false);
assert.equal(
  hasIncludedBillableLines({
    version: 3,
    byUser: [{ userId: '1', userName: 'Test', lines: [{ included: true }] }],
  }),
  true,
);
assert.equal(
  hasIncludedBillableLines({
    version: 3,
    byUser: [{ userId: '1', userName: 'Test', lines: undefined }],
  }),
  false,
);

console.log('test-work-report-print-billing: ok');
