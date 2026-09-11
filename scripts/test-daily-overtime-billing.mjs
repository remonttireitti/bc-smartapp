import assert from 'node:assert/strict';
import {
  allocateDailyOvertimeBilling,
  billableWorkHoursFromLog,
  buildDayHourSegment,
  DEFAULT_DAILY_OVERTIME_POLICY,
  overtimeUnitPrices,
} from '../src/lib/workReportDailyOvertime.ts';
import { buildDailyOvertimeHourLines } from '../src/lib/workReportDailyOvertimeHourLines.ts';
import { calculateWorkReportBillable } from '../src/lib/workReportBilling.ts';

const policy = DEFAULT_DAILY_OVERTIME_POLICY;

function log(input) {
  return {
    id: input.id,
    work_report_id: input.workReportId,
    log_date: input.date,
    log_start_time: input.start ?? '08:00',
    entry_type: 'regular',
    hours_regular: input.hours,
    hours_overtime: 0,
    hours_on_call: 0,
    hours_agreed_regular: input.agreedRegular ?? 0,
    created_by: input.performer ?? 'user-1',
    created_at: input.createdAt ?? '2026-09-11T08:00:00Z',
    fixed_price_amount: null,
    commission_amount: 0,
    commission_note: null,
    work_done: 'Työ',
    author: null,
  };
}

// Raportti A: 6 h, raportti B: 5 h samana päivänä → 8 reg + 2 OT50 + 1 OT100
const segments = [
  buildDayHourSegment({
    workReportId: 'report-a',
    log: log({ id: 'log-a', workReportId: 'report-a', date: '2026-09-11', hours: 6, start: '08:00' }),
    reportHourMode: 'daily_overtime',
  }),
  buildDayHourSegment({
    workReportId: 'report-b',
    log: log({ id: 'log-b', workReportId: 'report-b', date: '2026-09-11', hours: 5, start: '14:00' }),
    reportHourMode: 'daily_overtime',
  }),
].filter(Boolean);

const billing = allocateDailyOvertimeBilling(segments, policy);
assert.equal(billing.get('log-a')?.regular, 6);
assert.equal(billing.get('log-a')?.overtime50, 0);
assert.equal(billing.get('log-b')?.regular, 2);
assert.equal(billing.get('log-b')?.overtime50, 2);
assert.equal(billing.get('log-b')?.overtime100, 1);

// Sovittu normaalihintainen: 2 h OT50-alueelta
const agreedLog = log({
  id: 'log-c',
  workReportId: 'report-b',
  date: '2026-09-12',
  hours: 5,
  start: '14:00',
  agreedRegular: 2,
});
const agreedSegments = [
  buildDayHourSegment({
    workReportId: 'report-a',
    log: log({ id: 'log-a2', workReportId: 'report-a', date: '2026-09-12', hours: 6, start: '08:00' }),
    reportHourMode: 'daily_overtime',
  }),
  buildDayHourSegment({
    workReportId: 'report-b',
    log: agreedLog,
    reportHourMode: 'daily_overtime',
  }),
].filter(Boolean);
const agreedBilling = allocateDailyOvertimeBilling(agreedSegments, policy);
const b = agreedBilling.get('log-c');
assert.equal(b?.overtime50, 0);
assert.equal(b?.overtime100, 1);
assert.equal(b?.agreedRegular, 2);
assert.equal(b?.regular, 4);

const hourLines = buildDailyOvertimeHourLines({
  log: agreedLog,
  hourBillingMode: 'daily_overtime',
  allocation: b,
  hourlyRegular: 50,
  policy,
  resolveUnitPrice: () => 50,
});
assert.ok(hourLines.some((line) => line.label.includes('Sovittu normaalihintaiset')));
assert.ok(hourLines.some((line) => line.kind === 'hours_overtime_100' && line.qty === 1));

const otPrices = overtimeUnitPrices(50, policy);
assert.equal(otPrices.overtime50, 75);
assert.equal(otPrices.overtime100, 100);

const partnerCalc = calculateWorkReportBillable({
  logs: [agreedLog],
  users: [{ id: 'user-1', display_name: 'Matti', bill_hours_enabled: false, bill_expenses_enabled: false }],
  rates: { hourly_regular: 50, hourly_overtime: 80, hourly_on_call: 90 },
  ratesSource: 'company_default',
  billToCompanyId: 'company-1',
  billToCompanyName: 'Kumppani',
  hourBillingMode: 'daily_overtime',
  overtimePolicy: policy,
  dailyOvertimeBilling: agreedBilling,
});
assert.equal(partnerCalc.grandTotal, 4 * 50 + 1 * 100);

assert.equal(billableWorkHoursFromLog({ entry_type: 'regular', hours_regular: 3, hours_overtime: 0, hours_on_call: 0 }), 3);

console.log('daily-overtime-billing: ok');
