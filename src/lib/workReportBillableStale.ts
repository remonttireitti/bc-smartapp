import type { SupabaseClient } from '@supabase/supabase-js';

export type BillableSnapshot = {
  workReportId: string;
  calculatedAt: string | null | undefined;
  hasCalculation: boolean;
};

/** Onko tallennettu laskelma vanhempi kuin viimeisin päiväkirjaus tai sen kulurivit. */
export async function workReportBillableNeedsRecalculation(
  supabase: SupabaseClient,
  workReportId: string,
  calculatedAt: string | null | undefined,
): Promise<boolean> {
  const [stale] = await findStaleBillableReportIds(supabase, [
    { workReportId, calculatedAt, hasCalculation: true },
  ]);
  return stale === workReportId;
}

/** Palauttaa raportti-id:t, joiden laskelma puuttuu tai on vanhentunut. */
export async function findStaleBillableReportIds(
  supabase: SupabaseClient,
  snapshots: BillableSnapshot[],
): Promise<string[]> {
  const staleIds: string[] = [];
  const needsCheck: BillableSnapshot[] = [];

  for (const snapshot of snapshots) {
    if (!snapshot.hasCalculation || !snapshot.calculatedAt) {
      staleIds.push(snapshot.workReportId);
    } else {
      needsCheck.push(snapshot);
    }
  }

  if (needsCheck.length === 0) return staleIds;

  const calculatedAtMs = new Map(
    needsCheck.map((s) => [s.workReportId, Date.parse(String(s.calculatedAt))]),
  );
  const reportIds = needsCheck.map((s) => s.workReportId);

  const { data: logRows } = await supabase
    .from('work_report_daily_logs')
    .select('id, work_report_id, updated_at, created_at')
    .in('work_report_id', reportIds);

  const newestByReport = new Map<string, number>();
  const logToReport = new Map<string, string>();

  for (const log of logRows ?? []) {
    logToReport.set(log.id, log.work_report_id);
    const ms = Date.parse(String(log.updated_at ?? log.created_at));
    if (!Number.isFinite(ms)) continue;
    const prev = newestByReport.get(log.work_report_id) ?? 0;
    if (ms > prev) newestByReport.set(log.work_report_id, ms);
  }

  const logIds = [...logToReport.keys()];
  if (logIds.length > 0) {
    const [{ data: expenseLines }, { data: tripLegs }] = await Promise.all([
      supabase.from('work_report_daily_expense_lines').select('daily_log_id, created_at').in('daily_log_id', logIds),
      supabase.from('work_report_daily_trip_legs').select('daily_log_id, created_at').in('daily_log_id', logIds),
    ]);

    for (const row of [...(expenseLines ?? []), ...(tripLegs ?? [])]) {
      const reportId = logToReport.get(row.daily_log_id);
      if (!reportId) continue;
      const ms = Date.parse(String(row.created_at));
      if (!Number.isFinite(ms)) continue;
      const prev = newestByReport.get(reportId) ?? 0;
      if (ms > prev) newestByReport.set(reportId, ms);
    }
  }

  for (const snapshot of needsCheck) {
    const calcMs = calculatedAtMs.get(snapshot.workReportId);
    if (!Number.isFinite(calcMs)) {
      staleIds.push(snapshot.workReportId);
      continue;
    }
    const newest = newestByReport.get(snapshot.workReportId) ?? calcMs!;
    if (newest > calcMs!) staleIds.push(snapshot.workReportId);
  }

  return staleIds;
}

export async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let index = 0;
  const poolSize = Math.min(Math.max(1, concurrency), items.length);

  await Promise.all(
    Array.from({ length: poolSize }, async () => {
      while (index < items.length) {
        const item = items[index];
        index += 1;
        await worker(item);
      }
    }),
  );
}
