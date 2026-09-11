import type { WorkReportDailyLog } from '../types';
import type { BillableLineKind } from './workReportBilling';
import type { DailyOvertimeAllocation, DailyOvertimePolicy } from './workReportDailyOvertime';
import { billableWorkHoursFromLog, onCallHoursFromLog, overtimeUnitPrices } from './workReportDailyOvertime';
import type { HourBillingMode } from './workReportHourBilling';

export type HourBillingLineDraft = {
  kind: BillableLineKind;
  qty: number;
  unitPrice: number;
  label: string;
};

export function buildDailyOvertimeHourLines(input: {
  log: WorkReportDailyLog;
  hourBillingMode: HourBillingMode;
  allocation?: DailyOvertimeAllocation;
  hourlyRegular: number;
  policy: DailyOvertimePolicy;
  resolveUnitPrice: (kind: BillableLineKind, log: WorkReportDailyLog) => number;
}): HourBillingLineDraft[] {
  const lines: HourBillingLineDraft[] = [];
  const onCall = onCallHoursFromLog(input.log);
  if (onCall > 0) {
    lines.push({
      kind: 'hours_on_call',
      qty: onCall,
      unitPrice: input.resolveUnitPrice('hours_on_call', input.log),
      label: 'Päivystystunnit',
    });
  }

  if (input.hourBillingMode === 'manual') {
    return [...lines, ...buildManualHourLines(input.log, input.resolveUnitPrice)];
  }

  const totalHours = billableWorkHoursFromLog(input.log);
  if (totalHours <= 0) return lines;

  if (input.hourBillingMode === 'all_regular') {
    lines.push({
      kind: 'hours_regular',
      qty: totalHours,
      unitPrice: input.resolveUnitPrice('hours_regular', input.log),
      label: 'Tunnit',
    });
    return lines;
  }

  const allocation = input.allocation ?? {
    regular: 0,
    overtime50: 0,
    overtime100: 0,
    agreedRegular: 0,
  };
  const otPrices = overtimeUnitPrices(input.hourlyRegular, input.policy);
  const regularUnit = input.resolveUnitPrice('hours_regular', input.log);

  const baseRegular = Math.max(0, allocation.regular - allocation.agreedRegular);
  if (baseRegular > 0) {
    lines.push({
      kind: 'hours_regular',
      qty: baseRegular,
      unitPrice: regularUnit,
      label: 'Tunnit',
    });
  }
  if (allocation.agreedRegular > 0) {
    lines.push({
      kind: 'hours_regular',
      qty: allocation.agreedRegular,
      unitPrice: regularUnit,
      label: 'Sovittu normaalihintaiset (ylityöalue)',
    });
  }
  if (allocation.overtime50 > 0) {
    lines.push({
      kind: 'hours_overtime_50',
      qty: allocation.overtime50,
      unitPrice: otPrices.overtime50,
      label: 'Ylityö 50 %',
    });
  }
  if (allocation.overtime100 > 0) {
    lines.push({
      kind: 'hours_overtime_100',
      qty: allocation.overtime100,
      unitPrice: otPrices.overtime100,
      label: 'Ylityö 100 %',
    });
  }

  return lines;
}

function buildManualHourLines(
  log: WorkReportDailyLog,
  resolveUnitPrice: (kind: BillableLineKind, log: WorkReportDailyLog) => number,
): HourBillingLineDraft[] {
  const lines: HourBillingLineDraft[] = [];
  if (log.entry_type === 'regular' || log.entry_type === 'regular_and_overtime') {
    if (Number(log.hours_regular) > 0) {
      lines.push({
        kind: 'hours_regular',
        qty: Number(log.hours_regular),
        unitPrice: resolveUnitPrice('hours_regular', log),
        label: 'Tunnit',
      });
    }
  }
  if (log.entry_type === 'overtime' || log.entry_type === 'regular_and_overtime') {
    if (Number(log.hours_overtime) > 0) {
      lines.push({
        kind: 'hours_overtime',
        qty: Number(log.hours_overtime),
        unitPrice: resolveUnitPrice('hours_overtime', log),
        label: 'Ylitötunnit',
      });
    }
  }
  return lines;
}
