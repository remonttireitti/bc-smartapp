import assert from 'node:assert/strict';
import {
  billableHoursFromLogEntry,
  buildCustomerExtraBillingFromLogForm,
  emptyDailyLogExtraBillingForm,
  extraCustomerWorkFromDailyLogs,
  hoursExtraBillingApproved,
  hoursExtraBillingLabel,
  serializeDailyLogCustomerExtraBilling,
} from '../src/lib/dailyLogCustomerExtraBilling.ts';

const baseForm = {
  ...emptyDailyLogExtraBillingForm(),
  entry_type: 'regular',
  hours_regular: '3',
  hours_overtime: '',
  hours_on_call: '',
  work_done: 'Ylimääräinen asennus',
  customer_hourly_rate_override: '85',
};

assert.equal(
  hoursExtraBillingLabel(
    buildCustomerExtraBillingFromLogForm({
      ...baseForm,
      hours_extra_billable: false,
      hours_extra_billing_allowed: false,
    }),
  ),
  'kuuluu tarjoukseen',
);

const pending = buildCustomerExtraBillingFromLogForm({
  ...baseForm,
  hours_extra_billable: true,
  hours_extra_billing_allowed: false,
});
assert.equal(hoursExtraBillingLabel(pending), 'lisälaskutettavissa · ei lupaa');
assert.equal(hoursExtraBillingApproved(pending), false);
assert.deepEqual(serializeDailyLogCustomerExtraBilling(pending), {
  hours_extra_billable: true,
  hours_extra_billing_allowed: false,
});

const approved = buildCustomerExtraBillingFromLogForm({
  ...baseForm,
  hours_extra_billable: true,
  hours_extra_billing_allowed: true,
});
assert.equal(hoursExtraBillingLabel(approved), 'lisälaskutus luvalla');
assert.equal(approved.hours, 3);
assert.equal(approved.hourly_rate, 85);

const logs = [
  {
    id: 'log-1',
    log_date: '2026-09-12',
    entry_type: 'regular',
    hours_regular: 3,
    work_done: 'Ylimääräinen asennus',
    customer_extra_billing: approved,
  },
];

const works = extraCustomerWorkFromDailyLogs(logs);
assert.equal(works.length, 1);
assert.equal(works[0].hours, 3);
assert.equal(billableHoursFromLogEntry({ entry_type: 'regular_and_overtime', hours_regular: 2, hours_overtime: 1, hours_on_call: 0 }), 3);

console.log('test-hours-extra-billing: ok');
