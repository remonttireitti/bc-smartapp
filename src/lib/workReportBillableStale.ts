import type { SupabaseClient } from '@supabase/supabase-js';

/** Onko tallennettu laskelma vanhempi kuin viimeisin päiväkirjaus tai sen kulurivit. */
export async function workReportBillableNeedsRecalculation(
  supabase: SupabaseClient,
  workReportId: string,
  calculatedAt: string | null | undefined,
): Promise<boolean> {
  if (!calculatedAt) return true;

  const calculatedMs = Date.parse(calculatedAt);
  if (!Number.isFinite(calculatedMs)) return true;

  const { data: logs } = await supabase
    .from('work_report_daily_logs')
    .select('id, updated_at, created_at')
    .eq('work_report_id', workReportId);

  if (!logs?.length) return false;

  let newestMs = calculatedMs;
  for (const log of logs) {
    const logMs = Date.parse(String(log.updated_at ?? log.created_at));
    if (Number.isFinite(logMs) && logMs > newestMs) newestMs = logMs;
  }

  const logIds = logs.map((log) => log.id);
  const [{ data: expenseLines }, { data: tripLegs }] = await Promise.all([
    supabase.from('work_report_daily_expense_lines').select('created_at').in('daily_log_id', logIds),
    supabase.from('work_report_daily_trip_legs').select('created_at').in('daily_log_id', logIds),
  ]);

  for (const row of [...(expenseLines ?? []), ...(tripLegs ?? [])]) {
    const rowMs = Date.parse(String((row as { updated_at?: string }).updated_at ?? row.created_at));
    if (Number.isFinite(rowMs) && rowMs > newestMs) newestMs = rowMs;
  }

  return newestMs > calculatedMs;
}
