import assert from 'node:assert/strict';
import { calendarPeriodLabel, dayLoadLevel, dayLoadMap, isoWeekNumber, shiftCalendarAnchor, weekDays, yearMonths } from '../src/lib/workReportCalendarViews.ts';
const d = new Date(2026, 9, 15); // to 15.10.2026
const w = weekDays(d);
assert.equal(w.length, 7);
assert.equal(w[0].getDay(), 1);
assert.equal(w[0].getDate(), 12);
assert.equal(isoWeekNumber(d), 42);
assert.equal(isoWeekNumber(new Date(2026, 0, 1)), 1);
assert.equal(calendarPeriodLabel(d, 'week'), 'Viikko 42 · 12.10.–18.10.2026');
assert.equal(calendarPeriodLabel(d, 'year'), '2026');
assert.equal(shiftCalendarAnchor(d, 'week', 1).getDate(), 22);
assert.equal(shiftCalendarAnchor(d, 'month', -1).getMonth(), 8);
assert.equal(shiftCalendarAnchor(d, 'year', 1).getFullYear(), 2027);
assert.equal(yearMonths(2026).length, 12);
const m = dayLoadMap([
  { dayYmd: '2026-10-15', durationMinutes: 120, kind: 'logged' },
  { dayYmd: '2026-10-15', durationMinutes: 400, kind: 'scheduled' },
]);
assert.deepEqual(m.get('2026-10-15'), { minutes: 520, count: 2, pending: 1 });
assert.equal(dayLoadLevel(m.get('2026-10-15')), 3);
assert.equal(dayLoadLevel(undefined), 0);
assert.equal(dayLoadLevel({ minutes: 60, count: 1, pending: 0 }), 1);
console.log('test-calendar-views: ok');
