import { useMemo, useState } from 'react';
import WorkReportCalendarTimeline, { calendarDayHoursLabel } from './WorkReportCalendarTimeline';
import type { WorkReportCalendarEvent } from '../lib/workReportCalendar';
import {
  calendarPeriodLabel,
  dayLoadLevel,
  dayLoadMap,
  readCalendarViewMode,
  shiftCalendarAnchor,
  weekDays,
  writeCalendarViewMode,
  yearMonths,
  type CalendarViewMode,
} from '../lib/workReportCalendarViews';
import { monthGridDays, startOfMonth, toLocalYmd } from '../types';

const VIEW_LABELS: Record<CalendarViewMode, string> = { week: 'Viikko', month: 'Kuukausi', year: 'Vuosi' };
const WEEKDAY_SHORT = ['ma', 'ti', 'ke', 'to', 'pe', 'la', 'su'];

function isNarrowViewport() {
  return typeof window !== 'undefined' && window.innerWidth < 700;
}

export default function WorkReportCalendarView({ events }: { events: WorkReportCalendarEvent[] }) {
  const [mode, setModeState] = useState<CalendarViewMode>(() => readCalendarViewMode(isNarrowViewport()));
  const [anchor, setAnchor] = useState(() => new Date());
  const todayYmd = toLocalYmd(new Date());
  const loads = useMemo(() => dayLoadMap(events), [events]);

  function setMode(next: CalendarViewMode) {
    setModeState(next);
    writeCalendarViewMode(next);
  }

  function open(next: CalendarViewMode, date: Date) {
    setAnchor(date);
    setMode(next);
  }

  function pendingMarker(dayYmd: string) {
    const pending = loads.get(dayYmd)?.pending ?? 0;
    if (pending <= 0) return null;
    return (
      <span className="calendar-pending-dot" title={`Odottaa päiväkirjausta: ${pending}`} aria-label={`Odottaa päiväkirjausta: ${pending}`} />
    );
  }

  return (
    <div className="calendar-view">
      <div className="calendar-view-head">
        <div className="calendar-view-nav">
          <button type="button" className="btn btn-secondary btn-sm" aria-label="Edellinen" onClick={() => setAnchor(shiftCalendarAnchor(anchor, mode, -1))}>‹</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAnchor(new Date())}>Tänään</button>
          <button type="button" className="btn btn-secondary btn-sm" aria-label="Seuraava" onClick={() => setAnchor(shiftCalendarAnchor(anchor, mode, 1))}>›</button>
          <strong className="calendar-view-title">{calendarPeriodLabel(anchor, mode)}</strong>
        </div>
        <div className="calendar-view-modes" role="group" aria-label="Kalenterinäkymä">
          {(Object.keys(VIEW_LABELS) as CalendarViewMode[]).map((m) => (
            <button key={m} type="button" className={mode === m ? 'is-active' : ''} aria-pressed={mode === m} onClick={() => setMode(m)}>
              {VIEW_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      {mode === 'week' ? (
        <div className="calendar-week">
          {weekDays(anchor).map((day) => {
            const ymd = toLocalYmd(day);
            const hours = calendarDayHoursLabel(events, ymd);
            return (
              <div key={ymd} className={`calendar-day calendar-week-day${ymd === todayYmd ? ' is-today' : ''}`}>
                <div className="calendar-day-head">
                  {day.toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric' })}
                  {pendingMarker(ymd)}
                  {hours && <span className="calendar-day-hours">{hours}</span>}
                </div>
                <div className="calendar-day-body">
                  <WorkReportCalendarTimeline dayYmd={ymd} events={events} />
                </div>
              </div>
            );
          })}
        </div>
      ) : mode === 'month' ? (
        <div className="calendar-grid calendar-grid-month">
          {monthGridDays(anchor).map((day) => {
            const ymd = toLocalYmd(day);
            const hours = calendarDayHoursLabel(events, ymd);
            return (
              <div
                key={ymd}
                className={['calendar-day', day.getMonth() !== anchor.getMonth() ? 'outside-month' : '', ymd === todayYmd ? 'is-today' : ''].filter(Boolean).join(' ')}
              >
                <button type="button" className="calendar-day-head calendar-day-head-btn" title="Avaa viikko" onClick={() => open('week', day)}>
                  {day.toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric' })}
                  {pendingMarker(ymd)}
                  {hours && <span className="calendar-day-hours">{hours}</span>}
                </button>
                <div className="calendar-day-body calendar-day-body-month">
                  <WorkReportCalendarTimeline dayYmd={ymd} events={events} compact />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="calendar-year">
          {yearMonths(anchor.getFullYear()).map(({ month, days }) => (
            <div key={month.getMonth()} className="calendar-year-month">
              <button type="button" className="calendar-year-month-title" onClick={() => open('month', startOfMonth(month))}>
                {month.toLocaleDateString('fi-FI', { month: 'long' })}
              </button>
              <div className="calendar-year-grid">
                {WEEKDAY_SHORT.map((w) => <span key={w} className="calendar-year-wd">{w}</span>)}
                {days.map((day) => {
                  const ymd = toLocalYmd(day);
                  const inMonth = day.getMonth() === month.getMonth();
                  if (!inMonth) return <span key={ymd} className="calendar-year-day is-outside" />;
                  const load = loads.get(ymd);
                  const level = dayLoadLevel(load);
                  const title = load
                    ? `${day.toLocaleDateString('fi-FI')} · ${(load.minutes / 60).toFixed(1).replace(/\.0$/, '')} h · ${load.count} työtä${load.pending ? ` · ${load.pending} odottaa kirjausta` : ''}`
                    : day.toLocaleDateString('fi-FI');
                  return (
                    <button
                      key={ymd}
                      type="button"
                      className={`calendar-year-day level-${level}${ymd === todayYmd ? ' is-today' : ''}${load?.pending ? ' has-pending' : ''}`}
                      title={title}
                      aria-label={title}
                      onClick={() => open('week', day)}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
