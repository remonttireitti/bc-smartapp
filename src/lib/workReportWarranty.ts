import type { WorkReportDailyLog } from '../types';
import { parseDailyLogPartnerBilling } from './commissionBillingMode';

/**
 * Takuu: kirjauksen tunnit (partner_billing.warranty) ja kulu-/tarvikerivit
 * (supply_line_flags[i].warranty → expense_line.warranty) eivät laskutu kenellekään.
 * Lehtimoduuli: importoi vain tyypit ja commissionBillingModen (ei kiertoja).
 */
export function logHoursWarranty(log: { partner_billing?: unknown }): boolean {
  return parseDailyLogPartnerBilling(log.partner_billing).warranty === true;
}

export function logTripsWarranty(log: { partner_billing?: unknown }): boolean {
  return parseDailyLogPartnerBilling(log.partner_billing).trips_warranty === true;
}

export function expenseLineWarranty(line: { warranty?: boolean } | null | undefined): boolean {
  return line?.warranty === true;
}

/** Laskentaa varten: takuutunnit 0 ja takuurivit pois (vain logeja suoraan lukeville laskureille). */
export function withoutWarranty<T extends WorkReportDailyLog>(logs: T[]): T[] {
  return logs.map((log) => withoutWarrantyLog(log));
}

export function withoutWarrantyLog<T extends WorkReportDailyLog>(log: T): T {
  const lines = log.expense_lines ?? [];
  const keptLines = lines.some(expenseLineWarranty) ? lines.filter((line) => !expenseLineWarranty(line)) : lines;
  const tripsW = logTripsWarranty(log);
  if (!logHoursWarranty(log)) {
    if (tripsW) return { ...log, expense_lines: keptLines, trip_legs: [] };
    return keptLines === lines ? log : { ...log, expense_lines: keptLines };
  }
  const extra =
    log.customer_extra_billing && typeof log.customer_extra_billing === 'object'
      ? { ...(log.customer_extra_billing as Record<string, unknown>), hours: 0 }
      : log.customer_extra_billing;
  return {
    ...log,
    hours_regular: 0,
    hours_overtime: 0,
    hours_on_call: 0,
    hours_agreed_regular: 0,
    fixed_price_amount: log.entry_type === 'fixed_price' ? 0 : log.fixed_price_amount,
    customer_fixed_price_amount: log.entry_type === 'fixed_price' ? 0 : log.customer_fixed_price_amount,
    customer_extra_billing: extra as T['customer_extra_billing'],
    expense_lines: keptLines,
    ...(tripsW ? { trip_legs: [] } : {}),
  };
}
