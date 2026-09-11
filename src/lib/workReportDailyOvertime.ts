import type { WorkReportDailyLog } from '../types';
import type { HourBillingMode } from './workReportHourBilling';

export type DailyOvertimePolicy = {
  dailyRegularHours: number;
  overtime50Hours: number;
  overtime50Multiplier: number;
  overtime100Multiplier: number;
};

export const DEFAULT_DAILY_OVERTIME_POLICY: DailyOvertimePolicy = {
  dailyRegularHours: 8,
  overtime50Hours: 2,
  overtime50Multiplier: 1.5,
  overtime100Multiplier: 2,
};

export type DailyOvertimeAllocation = {
  regular: number;
  overtime50: number;
  overtime100: number;
  agreedRegular: number;
};

export type DayHourSegment = {
  workReportId: string;
  logId: string;
  logDate: string;
  performerUserId: string;
  sortKey: number;
  totalHours: number;
  onCallHours: number;
  reportHourMode: HourBillingMode;
  hoursAgreedRegular: number;
};

export function parseDailyOvertimePolicy(raw: unknown): DailyOvertimePolicy {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_DAILY_OVERTIME_POLICY };
  const record = raw as Record<string, unknown>;
  const num = (key: string, fallback: number) => {
    const value = Number(record[key]);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  };
  return {
    dailyRegularHours: num('daily_regular_hours', DEFAULT_DAILY_OVERTIME_POLICY.dailyRegularHours),
    overtime50Hours: num('overtime_50_hours', DEFAULT_DAILY_OVERTIME_POLICY.overtime50Hours),
    overtime50Multiplier: num('overtime_50_multiplier', DEFAULT_DAILY_OVERTIME_POLICY.overtime50Multiplier),
    overtime100Multiplier: num('overtime_100_multiplier', DEFAULT_DAILY_OVERTIME_POLICY.overtime100Multiplier),
  };
}

/** Laskutettavat työtunnit päiväkirjasta (ei päivystystä / urakkaa). */
export function billableWorkHoursFromLog(log: Pick<
  WorkReportDailyLog,
  'entry_type' | 'hours_regular' | 'hours_overtime' | 'hours_on_call'
>): number {
  if (log.entry_type === 'fixed_price' || log.entry_type === 'on_call') return 0;
  if (log.entry_type === 'regular') return Number(log.hours_regular) || 0;
  if (log.entry_type === 'overtime') return Number(log.hours_overtime) || 0;
  if (log.entry_type === 'regular_and_overtime') {
    return (Number(log.hours_regular) || 0) + (Number(log.hours_overtime) || 0);
  }
  return 0;
}

export function onCallHoursFromLog(log: Pick<WorkReportDailyLog, 'entry_type' | 'hours_on_call'>): number {
  if (log.entry_type !== 'on_call') return 0;
  return Number(log.hours_on_call) || 0;
}

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

function sortKeyFromLog(log: Pick<WorkReportDailyLog, 'log_start_time' | 'created_at'>): number {
  const time = log.log_start_time ? String(log.log_start_time).slice(0, 5) : '12:00';
  const [h, m] = time.split(':').map((part) => Number(part) || 0);
  const minutes = h * 60 + m;
  const created = Date.parse(log.created_at);
  return minutes * 1_000_000 + (Number.isFinite(created) ? created % 1_000_000 : 0);
}

export function buildDayHourSegment(input: {
  workReportId: string;
  log: WorkReportDailyLog;
  reportHourMode: HourBillingMode;
}): DayHourSegment | null {
  const totalHours = billableWorkHoursFromLog(input.log);
  const onCallHours = onCallHoursFromLog(input.log);
  if (totalHours <= 0 && onCallHours <= 0) return null;
  return {
    workReportId: input.workReportId,
    logId: input.log.id,
    logDate: input.log.log_date.slice(0, 10),
    performerUserId: input.log.created_by ?? 'unknown',
    sortKey: sortKeyFromLog(input.log),
    totalHours: roundHours(totalHours),
    onCallHours: roundHours(onCallHours),
    reportHourMode: input.reportHourMode,
    hoursAgreedRegular: roundHours(Number(input.log.hours_agreed_regular) || 0),
  };
}

/** Jakaa päivän tunnit porrastukseen kaikille segmenteille (järjestyksessä). */
export function allocateDailyOvertimeForDay(
  segments: DayHourSegment[],
  policy: DailyOvertimePolicy,
): Map<string, { regular: number; overtime50: number; overtime100: number }> {
  const sorted = [...segments].sort((a, b) => a.sortKey - b.sortKey);
  const result = new Map<string, { regular: number; overtime50: number; overtime100: number }>();

  let regularRemaining = policy.dailyRegularHours;
  let ot50Remaining = policy.overtime50Hours;

  for (const segment of sorted) {
    if (segment.reportHourMode === 'manual') {
      result.set(segment.logId, { regular: 0, overtime50: 0, overtime100: 0 });
      continue;
    }

    let hours = segment.totalHours;
    let regular = 0;
    let overtime50 = 0;

    if (segment.reportHourMode === 'all_regular') {
      regular = hours;
      hours = 0;
    } else {
      regular = Math.min(hours, regularRemaining);
      regularRemaining = roundHours(regularRemaining - regular);
      hours = roundHours(hours - regular);

      overtime50 = Math.min(hours, ot50Remaining);
      ot50Remaining = roundHours(ot50Remaining - overtime50);
      hours = roundHours(hours - overtime50);
    }

    result.set(segment.logId, {
      regular: roundHours(regular),
      overtime50: roundHours(overtime50),
      overtime100: roundHours(hours),
    });
  }

  return result;
}

/** Lopullinen laskutus jakelu yhdelle segmentille (sis. sovitut normaalihintaiset). */
export function resolveDailyOvertimeBilling(
  segment: DayHourSegment,
  allocation: { regular: number; overtime50: number; overtime100: number } | undefined,
): DailyOvertimeAllocation {
  if (segment.reportHourMode === 'manual' || !allocation) {
    return { regular: 0, overtime50: 0, overtime100: 0, agreedRegular: 0 };
  }

  if (segment.reportHourMode === 'all_regular') {
    return {
      regular: segment.totalHours,
      overtime50: 0,
      overtime100: 0,
      agreedRegular: 0,
    };
  }

  let overtime50 = allocation.overtime50;
  let overtime100 = allocation.overtime100;
  const agreedRegular = Math.min(
    segment.hoursAgreedRegular,
    roundHours(overtime50 + overtime100),
  );

  const fromOt50 = Math.min(agreedRegular, overtime50);
  overtime50 = roundHours(overtime50 - fromOt50);
  const agreedLeft = roundHours(agreedRegular - fromOt50);

  const fromOt100 = Math.min(agreedLeft, overtime100);
  overtime100 = roundHours(overtime100 - fromOt100);

  return {
    regular: roundHours(allocation.regular + agreedRegular),
    overtime50,
    overtime100,
    agreedRegular,
  };
}

export function allocateDailyOvertimeBilling(
  segments: DayHourSegment[],
  policy: DailyOvertimePolicy,
): Map<string, DailyOvertimeAllocation> {
  const byDay = new Map<string, DayHourSegment[]>();
  for (const segment of segments) {
    const key = `${segment.performerUserId}:${segment.logDate}`;
    const list = byDay.get(key) ?? [];
    list.push(segment);
    byDay.set(key, list);
  }

  const billing = new Map<string, DailyOvertimeAllocation>();
  for (const daySegments of byDay.values()) {
    const raw = allocateDailyOvertimeForDay(daySegments, policy);
    for (const segment of daySegments) {
      billing.set(
        segment.logId,
        resolveDailyOvertimeBilling(segment, raw.get(segment.logId)),
      );
    }
  }
  return billing;
}

export function overtimeUnitPrices(
  hourlyRegular: number,
  policy: DailyOvertimePolicy,
): { overtime50: number; overtime100: number } {
  const base = Number(hourlyRegular) || 0;
  return {
    overtime50: roundHours(base * policy.overtime50Multiplier),
    overtime100: roundHours(base * policy.overtime100Multiplier),
  };
}
