import assert from 'node:assert/strict';
import {
  EMPTY_WORK_REPORT_CREATE_VISITED,
  isReadyForScheduled,
  missingScheduledRequirements,
} from '../src/lib/workReportCreateSections.ts';

const data = {
  ownerCompanyId: 'company-a',
  customerId: 'customer-1',
  description: 'Korjaustyöt',
};

assert.equal(
  isReadyForScheduled(EMPTY_WORK_REPORT_CREATE_VISITED, data),
  false,
  'unvisited sections block scheduled save',
);

assert.equal(
  isReadyForScheduled(
    { basics: true, customer: true, task: true, attachments: false },
    data,
  ),
  true,
  'required sections visited and filled allow scheduled save',
);

assert.deepEqual(
  missingScheduledRequirements(
    { basics: true, customer: false, task: false, attachments: false },
    { ownerCompanyId: 'company-a', customerId: '', description: '' },
  ),
  ['Asiakas', 'Tehtävä'],
);

console.log('test-work-report-create-sections: ok');
