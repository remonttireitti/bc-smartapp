import type { BillableCalculation } from './workReportBilling';

type MinimalLogRow = {
  id: string;
  hours_regular?: number | null;
  hours_overtime?: number | null;
  hours_on_call?: number | null;
  fixed_price_amount?: number | null;
  commission_amount?: number | null;
};

export function calculationLogIds(calculation: unknown): Set<string> {
  const calc = calculation as BillableCalculation | null | undefined;
  const ids = new Set<string>();
  for (const user of calc?.byUser ?? []) {
    for (const line of user.lines ?? []) {
      if (line.logId) ids.add(line.logId);
    }
  }
  return ids;
}

export function logRowHasBillableContent(
  log: MinimalLogRow,
  expenseLineCount: number,
  refrigerantLineCount: number,
  tripLegCount = 0,
): boolean {
  return (
    Number(log.hours_regular) > 0
    || Number(log.hours_overtime) > 0
    || Number(log.hours_on_call) > 0
    || Number(log.fixed_price_amount) > 0
    || Number(log.commission_amount) > 0
    || expenseLineCount > 0
    || refrigerantLineCount > 0
    || tripLegCount > 0
  );
}

export function calculationMissingBillableLogs(input: {
  logRows: MinimalLogRow[];
  calculationLogIds: Set<string>;
  expenseCountByLogId: Map<string, number>;
  refrigerantCountByLogId: Map<string, number>;
  tripLegCountByLogId?: Map<string, number>;
}): boolean {
  for (const log of input.logRows) {
    if (input.calculationLogIds.has(log.id)) continue;
    if (
      logRowHasBillableContent(
        log,
        input.expenseCountByLogId.get(log.id) ?? 0,
        input.refrigerantCountByLogId.get(log.id) ?? 0,
        input.tripLegCountByLogId?.get(log.id) ?? 0,
      )
    ) {
      return true;
    }
  }
  return false;
}
