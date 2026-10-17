import { addDays, addMonths, addYears, monthGridDays, startOfMonth, startOfWeek, toLocalYmd } from '../types';

export type CalendarViewMode = 'week' | 'month' | 'year';

const VIEW_KEY = 'bc-work-report-calendar-view';

export function readCalendarViewMode(isNarrow: boolean): CalendarViewMode {
  try {
    const stored = localStorage.getItem(VIEW_KEY);
    if (stored === 'week' || stored === 'month' || stored === 'year') return stored;
  } catch {
    /* ignore */
  }
  return isNarrow ? 'week' : 'month';
}

export function writeCalendarViewMode(mode: CalendarViewMode) {
  try {
    localStorage.setItem(VIEW_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function weekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** ISO 8601 -viikkonumero. */
export function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function shiftCalendarAnchor(anchor: Date, mode: CalendarViewMode, step: number): Date {
  if (mode === 'week') return addDays(anchor, 7 * step);
  if (mode === 'month') return addMonths(startOfMonth(anchor), step);
  return addYears(new Date(anchor.getFullYear(), 0, 1), step);
}

export function calendarPeriodLabel(anchor: Date, mode: CalendarViewMode): string {
  if (mode === 'year') return String(anchor.getFullYear());
  if (mode === 'month') return anchor.toLocaleDateString('fi-FI', { month: 'long', year: 'numeric' });
  const days = weekDays(anchor);
  const first = days[0];
  const last = days[6];
  const fmt = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}.`;
  return `Viikko ${isoWeekNumber(first)} · ${fmt(first)}–${fmt(last)}${last.getFullYear()}`;
}

export function yearMonths(year: number): { month: Date; days: Date[] }[] {
  return Array.from({ length: 12 }, (_, m) => {
    const month = new Date(year, m, 1);
    return { month, days: monthGridDays(month) };
  });
}

export type DayLoad = { minutes: number; count: number; pending: number };

export function dayLoadMap(
  events: { dayYmd: string; durationMinutes: number; kind: 'scheduled' | 'logged' }[],
): Map<string, DayLoad> {
  const map = new Map<string, DayLoad>();
  for (const e of events) {
    const cur = map.get(e.dayYmd) ?? { minutes: 0, count: 0, pending: 0 };
    cur.minutes += e.durationMinutes;
    cur.count += 1;
    if (e.kind === 'scheduled') cur.pending += 1;
    map.set(e.dayYmd, cur);
  }
  return map;
}

/** 0 = tyhjä, 1 = < 4 h, 2 = < 8 h, 3 = 8 h tai enemmän. */
export function dayLoadLevel(load: DayLoad | undefined): 0 | 1 | 2 | 3 {
  if (!load || load.minutes <= 0) return 0;
  if (load.minutes < 240) return 1;
  if (load.minutes < 480) return 2;
  return 3;
}

export { toLocalYmd };
