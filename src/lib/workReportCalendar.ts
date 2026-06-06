import type { SupabaseClient } from '@supabase/supabase-js';
import {
  combineDateAndHour,
  roundTimeToHalfHour,
  sumDailyHours,
  toLocalYmd,
  WORK_STATUS_LABELS,
  type WorkReport,
  type WorkReportDailyLog,
  type WorkStatus,
} from '../types';

export const CALENDAR_DAY_START_MINUTES = 7 * 60;
export const CALENDAR_DAY_END_MINUTES = 17 * 60;
export const CALENDAR_DAY_SPAN_MINUTES = CALENDAR_DAY_END_MINUTES - CALENDAR_DAY_START_MINUTES;
export const SCHEDULE_PLACEHOLDER_HOURS = 1;
export const MAX_OVERLAP_MINUTES = 90;

export function formatAllowedOverlapLabel(minutes = MAX_OVERLAP_MINUTES): string {
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  const hours = minutes / 60;
  return `${hours.toFixed(1).replace('.', ',')} h`;
}

export type WorkReportCalendarEvent = {
  id: string;
  reportId: string;
  report: WorkReport;
  dayYmd: string;
  startMinutes: number;
  durationMinutes: number;
  kind: 'scheduled' | 'logged';
  status: WorkStatus;
  title: string;
  tooltip: string;
};

export type CalendarTimeRange = {
  reportId: string;
  logId?: string;
  dayYmd: string;
  startMinutes: number;
  endMinutes: number;
  label: string;
};

export function timeToMinutes(time: string | null | undefined): number {
  if (!time) return 8 * 60;
  const normalized = roundTimeToHalfHour(time.length <= 5 ? time : time.slice(0, 5));
  const [h, m] = normalized.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatTimeRange(startMinutes: number, durationMinutes: number): string {
  const end = Math.min(CALENDAR_DAY_END_MINUTES, startMinutes + durationMinutes);
  return `${minutesToTime(startMinutes)}–${minutesToTime(end)}`;
}

export function resolveReportPerformerUserId(report: Pick<WorkReport, 'assigned_user_id' | 'created_by_user_id'>) {
  return report.assigned_user_id ?? report.created_by_user_id;
}

/** Hours used for calendar blocks; urakka can log non-billable hours for scheduling. */
export function calendarHoursForDailyLog(
  log: Pick<WorkReportDailyLog, 'entry_type' | 'hours_regular' | 'hours_overtime' | 'hours_on_call'>,
): number {
  if (log.entry_type === 'fixed_price') {
    const regular = Number(log.hours_regular) || 0;
    if (regular > 0) return regular;
    return SCHEDULE_PLACEHOLDER_HOURS;
  }
  return sumDailyHours([log as WorkReportDailyLog]);
}

export function dailyLogDurationMinutes(log: Pick<
  WorkReportDailyLog,
  'entry_type' | 'hours_regular' | 'hours_overtime' | 'hours_on_call'
>): number {
  const hours = calendarHoursForDailyLog(log);
  const roundedHours = Math.max(0.5, Math.round(hours * 2) / 2);
  return Math.round(roundedHours * 60);
}

export function scheduledStartParts(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  return {
    dayYmd: toLocalYmd(d),
    startMinutes: d.getHours() * 60 + d.getMinutes(),
  };
}

export function validateFutureSchedule(date: string, hour: string): string | null {
  const iso = combineDateAndHour(date, roundTimeToHalfHour(hour));
  if (!iso) return 'Valitse päivä ja kello.';
  if (new Date(iso).getTime() <= Date.now()) {
    return 'Aloitusajan pitää olla tulevaisuudessa.';
  }
  return null;
}

export function rangesOverlapMinutes(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  const overlap = Math.min(aEnd, bEnd) - Math.max(aStart, bStart);
  return Math.max(0, overlap);
}

export function hasDisallowedOverlap(
  candidate: CalendarTimeRange,
  others: CalendarTimeRange[],
  maxOverlapMinutes = MAX_OVERLAP_MINUTES,
) {
  for (const other of others) {
    if (other.dayYmd !== candidate.dayYmd) continue;
    if (other.reportId === candidate.reportId && other.logId === candidate.logId) continue;
    const overlap = rangesOverlapMinutes(
      candidate.startMinutes,
      candidate.endMinutes,
      other.startMinutes,
      other.endMinutes,
    );
    if (overlap > maxOverlapMinutes) return { conflict: other, overlapMinutes: overlap };
  }
  return null;
}

export function buildCalendarTimeRanges(input: {
  reports: WorkReport[];
  logsByReportId: Map<string, WorkReportDailyLog[]>;
  excludeReportId?: string;
  excludeLogId?: string;
}): CalendarTimeRange[] {
  const ranges: CalendarTimeRange[] = [];

  for (const report of input.reports) {
    if (!['scheduled', 'in_progress'].includes(report.status)) continue;
    const logs = input.logsByReportId.get(report.id) ?? [];

    if (logs.length === 0 && report.scheduled_start) {
      if (input.excludeReportId === report.id) continue;
      const parts = scheduledStartParts(report.scheduled_start);
      if (!parts) continue;
      const durationMinutes = SCHEDULE_PLACEHOLDER_HOURS * 60;
      ranges.push({
        reportId: report.id,
        dayYmd: parts.dayYmd,
        startMinutes: parts.startMinutes,
        endMinutes: parts.startMinutes + durationMinutes,
        label: report.title,
      });
      continue;
    }

    for (const log of logs) {
      if (input.excludeReportId === report.id && input.excludeLogId === log.id) continue;
      const dayYmd = log.log_date.slice(0, 10);
      const startMinutes = timeToMinutes(log.log_start_time ?? undefined);
      const durationMinutes = dailyLogDurationMinutes(log);
      ranges.push({
        reportId: report.id,
        logId: log.id,
        dayYmd,
        startMinutes,
        endMinutes: startMinutes + durationMinutes,
        label: report.title,
      });
    }
  }

  return ranges;
}

export function compareActiveReportsForList(a: WorkReport, b: WorkReport): number {
  const statusOrder = (status: WorkStatus) => (status === 'scheduled' ? 0 : status === 'in_progress' ? 1 : 2);
  const byStatus = statusOrder(a.status) - statusOrder(b.status);
  if (byStatus !== 0) return byStatus;
  const aTime = a.scheduled_start ? new Date(a.scheduled_start).getTime() : Number.MAX_SAFE_INTEGER;
  const bTime = b.scheduled_start ? new Date(b.scheduled_start).getTime() : Number.MAX_SAFE_INTEGER;
  if (aTime !== bTime) return aTime - bTime;
  return a.title.localeCompare(b.title, 'fi');
}

export const CALENDAR_DISPLAY_STATUSES: WorkStatus[] = [
  'scheduled',
  'in_progress',
  'completed',
  'billed_partner',
  'billed_customer',
];

export function buildCalendarEvents(input: {
  reports: WorkReport[];
  logsByReportId: Map<string, WorkReportDailyLog[]>;
}): WorkReportCalendarEvent[] {
  const events: WorkReportCalendarEvent[] = [];
  const calendarStatuses: WorkStatus[] = [
    'scheduled',
    'in_progress',
    'completed',
    'billed_partner',
    'billed_customer',
  ];

  for (const report of input.reports) {
    if (!calendarStatuses.includes(report.status)) continue;
    const logs = input.logsByReportId.get(report.id) ?? [];
    const customer = report.customers?.name ?? report.location_text ?? '—';
    const performer =
      report.assigned_user?.display_name ??
      report.created_by_user?.display_name ??
      '—';

    if (
      logs.length === 0 &&
      report.scheduled_start &&
      (report.status === 'scheduled' || report.status === 'in_progress')
    ) {
      const parts = scheduledStartParts(report.scheduled_start);
      if (!parts) continue;
      const durationMinutes = SCHEDULE_PLACEHOLDER_HOURS * 60;
      const timeLabel = formatTimeRange(parts.startMinutes, durationMinutes);
      const statusLabel =
        report.status === 'scheduled' ? WORK_STATUS_LABELS.scheduled : WORK_STATUS_LABELS.in_progress;
      events.push({
        id: `${report.id}-scheduled`,
        reportId: report.id,
        report,
        dayYmd: parts.dayYmd,
        startMinutes: parts.startMinutes,
        durationMinutes,
        kind: 'scheduled',
        status: report.status,
        title: report.title,
        tooltip: `${statusLabel} · ${timeLabel}\n${customer}\nTekijä: ${performer}`,
      });
      continue;
    }

    for (const log of logs) {
      const dayYmd = log.log_date.slice(0, 10);
      const startMinutes = timeToMinutes(log.log_start_time ?? undefined);
      const durationMinutes = dailyLogDurationMinutes(log);
      const hours = calendarHoursForDailyLog(log).toFixed(1).replace(/\.0$/, '');
      const timeLabel = formatTimeRange(startMinutes, durationMinutes);
      events.push({
        id: `${report.id}-log-${log.id}`,
        reportId: report.id,
        report,
        dayYmd: dayYmd,
        startMinutes,
        durationMinutes,
        kind: 'logged',
        status: report.status,
        title: report.title,
        tooltip: `${WORK_STATUS_LABELS[report.status]} · ${timeLabel} (${hours} h)\n${customer}\n${log.work_done.slice(0, 120)}`,
      });
    }
  }

  return events;
}

export function checkPerformerScheduleConflict(input: {
  performerUserId: string | null | undefined;
  reports: WorkReport[];
  logsByReportId: Map<string, WorkReportDailyLog[]>;
  candidate: CalendarTimeRange;
}): string | null {
  if (!input.performerUserId) return null;

  const performerReports = input.reports.filter(
    (report) => resolveReportPerformerUserId(report) === input.performerUserId,
  );

  const ranges = buildCalendarTimeRanges({
    reports: performerReports,
    logsByReportId: input.logsByReportId,
    excludeReportId: input.candidate.reportId,
    excludeLogId: input.candidate.logId,
  });

  const conflict = hasDisallowedOverlap(input.candidate, ranges);
  if (!conflict) return null;

  return `Tekijällä on päällekkäinen työ ${minutesToTime(conflict.conflict.startMinutes)}–${minutesToTime(conflict.conflict.endMinutes)} (${conflict.conflict.label}). Sallittu päällekkäisyys on ${formatAllowedOverlapLabel()}.`;
}

export const CALENDAR_EVENT_COLORS = [
  { bg: '#fef3c7', border: '#fcd34d', accent: '#92400e' },
  { bg: '#dbeafe', border: '#93c5fd', accent: '#1e40af' },
  { bg: '#dcfce7', border: '#86efac', accent: '#166534' },
  { bg: '#fce7f3', border: '#f9a8d4', accent: '#9d174d' },
  { bg: '#ede9fe', border: '#c4b5fd', accent: '#5b21b6' },
  { bg: '#ffedd5', border: '#fdba74', accent: '#9a3412' },
] as const;

export type LayoutedCalendarEvent = WorkReportCalendarEvent & {
  layout: {
    top: string;
    height: string;
    left: string;
    width: string;
    colorIndex: number;
  };
};

export function calendarEventStyle(event: WorkReportCalendarEvent) {
  const top =
    ((event.startMinutes - CALENDAR_DAY_START_MINUTES) / CALENDAR_DAY_SPAN_MINUTES) * 100;
  const height = Math.max(10, (event.durationMinutes / CALENDAR_DAY_SPAN_MINUTES) * 100);
  const clampedTop = Math.max(0, Math.min(90, top));
  return {
    top: `${clampedTop}%`,
    height: `${Math.min(100 - clampedTop, height)}%`,
  };
}

export function layoutCalendarDayEvents(events: WorkReportCalendarEvent[]): LayoutedCalendarEvent[] {
  const sorted = [...events].sort(
    (a, b) => a.startMinutes - b.startMinutes || a.id.localeCompare(b.id),
  );
  const laneEnds: number[] = [];

  const assignments: { event: WorkReportCalendarEvent; lane: number; colorIndex: number }[] = [];

  sorted.forEach((event, index) => {
    const start = event.startMinutes;
    const end = start + event.durationMinutes;
    let lane = laneEnds.findIndex((laneEnd) => start >= laneEnd - MAX_OVERLAP_MINUTES);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = Math.max(laneEnds[lane], end);
    }
    assignments.push({ event, lane, colorIndex: index % CALENDAR_EVENT_COLORS.length });
  });

  const laneCount = Math.max(1, laneEnds.length);
  const laneWidth = 100 / laneCount;

  return assignments.map(({ event, lane, colorIndex }) => {
    const style = calendarEventStyle(event);
    return {
      ...event,
      layout: {
        top: style.top,
        height: style.height,
        left: `calc(${lane * laneWidth}% + .12rem)`,
        width: `calc(${laneWidth}% - .28rem)`,
        colorIndex,
      },
    };
  });
}

export function calendarDayEntryCount(events: WorkReportCalendarEvent[], dayYmd: string) {
  return events.filter((event) => event.dayYmd === dayYmd).length;
}

export const CALENDAR_LOG_SELECT =
  'id, work_report_id, log_date, log_start_time, entry_type, hours_regular, hours_overtime, hours_on_call, work_done';

export async function loadPerformerCalendarContext(
  supabase: SupabaseClient,
  performerUserId: string,
) {
  const { data: reportRows } = await supabase
    .from('work_reports')
    .select(
      'id, title, status, scheduled_start, assigned_user_id, created_by_user_id, customers(name), assigned_user:profiles!work_reports_assigned_user_id_fkey(display_name), created_by_user:profiles!work_reports_created_by_user_id_fkey(display_name)',
    )
    .in('status', ['scheduled', 'in_progress']);

  const reports = ((reportRows ?? []) as unknown as WorkReport[]).filter(
    (report) => resolveReportPerformerUserId(report) === performerUserId,
  );

  const reportIds = reports.map((report) => report.id);
  const logsByReportId = new Map<string, WorkReportDailyLog[]>();
  if (reportIds.length > 0) {
    const { data: logRows } = await supabase
      .from('work_report_daily_logs')
      .select(CALENDAR_LOG_SELECT)
      .in('work_report_id', reportIds);
    for (const log of (logRows ?? []) as WorkReportDailyLog[]) {
      const list = logsByReportId.get(log.work_report_id) ?? [];
      list.push(log);
      logsByReportId.set(log.work_report_id, list);
    }
  }

  return { reports, logsByReportId };
}

export function buildLogCalendarCandidate(input: {
  reportId: string;
  logId?: string;
  dayYmd: string;
  logStartTime: string;
  entryType: WorkReportDailyLog['entry_type'];
  hoursRegular: number;
  hoursOvertime: number;
  hoursOnCall: number;
  label: string;
}): CalendarTimeRange {
  const startMinutes = timeToMinutes(input.logStartTime);
  const durationMinutes = dailyLogDurationMinutes({
    entry_type: input.entryType,
    hours_regular: input.hoursRegular,
    hours_overtime: input.hoursOvertime,
    hours_on_call: input.hoursOnCall,
  });
  return {
    reportId: input.reportId,
    logId: input.logId,
    dayYmd: input.dayYmd,
    startMinutes,
    endMinutes: startMinutes + durationMinutes,
    label: input.label,
  };
}

export function buildScheduleCalendarCandidate(input: {
  reportId: string;
  dayYmd: string;
  hour: string;
  label: string;
}): CalendarTimeRange {
  const startMinutes = timeToMinutes(input.hour);
  const durationMinutes = SCHEDULE_PLACEHOLDER_HOURS * 60;
  return {
    reportId: input.reportId,
    dayYmd: input.dayYmd,
    startMinutes,
    endMinutes: startMinutes + durationMinutes,
    label: input.label,
  };
}
