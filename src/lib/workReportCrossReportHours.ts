import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { WorkReportDailyLog } from '../types';
import { isMissingHoursAgreedRegularColumn } from './workReportDailyLogSelect';
import {
  allocateDailyOvertimeBilling,
  buildDayHourSegment,
  type DailyOvertimeAllocation,
  type DailyOvertimePolicy,
  type DayHourSegment,
} from './workReportDailyOvertime';
import {
  hourBillingModeForSide,
  isMissingHourBillingColumn,
  parseHourBillingSettings,
  type HourBillingMode,
} from './workReportHourBilling';

const CROSS_REPORT_LOG_SELECT_BASE =
  'id, work_report_id, log_date, log_start_time, entry_type, hours_regular, hours_overtime, hours_on_call, created_by, created_at';

const CROSS_REPORT_LOG_SELECT_WITH_AGREED =
  `${CROSS_REPORT_LOG_SELECT_BASE}, hours_agreed_regular`;

export async function loadCrossReportDaySegments(
  supabase: SupabaseClient,
  input: {
    workReportId: string;
    logs: WorkReportDailyLog[];
    side: 'partner' | 'customer';
  },
): Promise<DayHourSegment[]> {
  const performerIds = [...new Set(input.logs.map((log) => log.created_by).filter(Boolean))] as string[];
  const dates = [...new Set(input.logs.map((log) => log.log_date.slice(0, 10)))];
  if (performerIds.length === 0 || dates.length === 0) return [];

  let rows: WorkReportDailyLog[] | null = null;
  let error: PostgrestError | null = null;
  const primary = await supabase
    .from('work_report_daily_logs')
    .select(CROSS_REPORT_LOG_SELECT_WITH_AGREED)
    .in('created_by', performerIds)
    .in('log_date', dates);
  rows = (primary.data as WorkReportDailyLog[] | null) ?? null;
  error = primary.error;

  if (isMissingHoursAgreedRegularColumn(error)) {
    const legacy = await supabase
      .from('work_report_daily_logs')
      .select(CROSS_REPORT_LOG_SELECT_BASE)
      .in('created_by', performerIds)
      .in('log_date', dates);
    rows = (legacy.data as WorkReportDailyLog[] | null) ?? null;
    error = legacy.error;
  }

  if (error || !rows?.length) {
    return buildSegmentsFromLogs(input.logs, input.side, new Map());
  }

  const reportIds = [...new Set((rows as WorkReportDailyLog[]).map((row) => row.work_report_id))];
  const hourModes = await loadReportHourModes(supabase, reportIds);

  return buildSegmentsFromLogs(rows as WorkReportDailyLog[], input.side, hourModes);
}

async function loadReportHourModes(
  supabase: SupabaseClient,
  reportIds: string[],
): Promise<Map<string, { partner: HourBillingMode; customer: HourBillingMode }>> {
  const modes = new Map<string, { partner: HourBillingMode; customer: HourBillingMode }>();
  if (reportIds.length === 0) return modes;

  let { data, error } = await supabase
    .from('work_report_billable')
    .select('work_report_id, hour_billing')
    .in('work_report_id', reportIds);

  if (isMissingHourBillingColumn(error)) {
    return modes;
  }

  for (const row of data ?? []) {
    const settings = parseHourBillingSettings((row as { hour_billing?: unknown }).hour_billing);
    modes.set((row as { work_report_id: string }).work_report_id, {
      partner: settings.partner_mode,
      customer: settings.customer_mode,
    });
  }

  for (const reportId of reportIds) {
    if (!modes.has(reportId)) {
      modes.set(reportId, { partner: 'manual', customer: 'manual' });
    }
  }

  return modes;
}

function buildSegmentsFromLogs(
  logs: WorkReportDailyLog[],
  side: 'partner' | 'customer',
  hourModes: Map<string, { partner: HourBillingMode; customer: HourBillingMode }>,
): DayHourSegment[] {
  const segments: DayHourSegment[] = [];
  for (const log of logs) {
    const modes = hourModes.get(log.work_report_id) ?? { partner: 'manual', customer: 'manual' };
    const reportHourMode = side === 'partner' ? modes.partner : modes.customer;
    const segment = buildDayHourSegment({
      workReportId: log.work_report_id,
      log,
      reportHourMode,
    });
    if (segment) segments.push(segment);
  }
  return segments;
}

export async function buildDailyOvertimeBillingMap(
  supabase: SupabaseClient,
  input: {
    workReportId: string;
    logs: WorkReportDailyLog[];
    side: 'partner' | 'customer';
    hourBillingMode: HourBillingMode;
    policy: DailyOvertimePolicy;
  },
): Promise<Map<string, DailyOvertimeAllocation>> {
  if (input.hourBillingMode === 'manual') return new Map();

  const segments = await loadCrossReportDaySegments(supabase, {
    workReportId: input.workReportId,
    logs: input.logs,
    side: input.side,
  });

  if (segments.length === 0) return new Map();

  const all = allocateDailyOvertimeBilling(segments, input.policy);
  const currentLogIds = new Set(input.logs.map((log) => log.id));
  const filtered = new Map<string, DailyOvertimeAllocation>();
  for (const [logId, allocation] of all) {
    if (currentLogIds.has(logId)) filtered.set(logId, allocation);
  }
  return filtered;
}

export function hourBillingModeFromSettings(
  raw: unknown,
  side: 'partner' | 'customer',
): HourBillingMode {
  return hourBillingModeForSide(parseHourBillingSettings(raw), side);
}
