import type { WorkReportDailyLog } from '../types';

export type CommissionBillingMode = 'commission_only' | 'commission_plus';

export interface DailyLogPartnerBilling {
  commission_mode?: CommissionBillingMode;
  hours_billed?: boolean;
  trips_billed?: boolean;
}

export const DEFAULT_COMMISSION_BILLING_MODE: CommissionBillingMode = 'commission_plus';

export function parseDailyLogPartnerBilling(raw: unknown): DailyLogPartnerBilling {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== 'object') return {};
  const v = value as Record<string, unknown>;
  const out: DailyLogPartnerBilling = {};
  if (v.commission_mode === 'commission_only' || v.commission_mode === 'commission_plus') {
    out.commission_mode = v.commission_mode;
  }
  if (v.hours_billed === false) out.hours_billed = false;
  if (v.trips_billed === false) out.trips_billed = false;
  return out;
}

/** Null when everything is default (keeps DB rows null for legacy behaviour). */
export function serializeDailyLogPartnerBilling(
  value: DailyLogPartnerBilling,
): DailyLogPartnerBilling | null {
  const out: DailyLogPartnerBilling = {};
  if (value.commission_mode === 'commission_only') out.commission_mode = 'commission_only';
  if (value.hours_billed === false) out.hours_billed = false;
  if (value.trips_billed === false) out.trips_billed = false;
  return Object.keys(out).length ? out : null;
}

type LogLike = Pick<WorkReportDailyLog, 'created_by' | 'commission_amount'> & {
  partner_billing?: unknown;
};

export function logCommissionMode(log: LogLike): CommissionBillingMode {
  return parseDailyLogPartnerBilling(log.partner_billing).commission_mode ??
    DEFAULT_COMMISSION_BILLING_MODE;
}

/**
 * Authors whose commission is in "Laskutetaan vain provisio" mode in this report.
 * For them, only the commission is billed: hours, urakka, expenses and trip km are not.
 */
export function commissionOnlyAuthors(logs: LogLike[]): Set<string> {
  const set = new Set<string>();
  for (const log of logs) {
    if (Number(log.commission_amount) > 0 && logCommissionMode(log) === 'commission_only') {
      set.add(log.created_by ?? '');
    }
  }
  return set;
}

export interface PartnerBillingContext {
  commissionOnly: Set<string>;
}

export function partnerBillingContext(logs: LogLike[]): PartnerBillingContext {
  return { commissionOnly: commissionOnlyAuthors(logs) };
}

function isCommissionOnly(ctx: PartnerBillingContext, log: LogLike) {
  return ctx.commissionOnly.has(log.created_by ?? '');
}

export function logHoursPartnerBilled(ctx: PartnerBillingContext, log: LogLike): boolean {
  if (isCommissionOnly(ctx, log)) return false;
  return parseDailyLogPartnerBilling(log.partner_billing).hours_billed !== false;
}

export function logTripsPartnerBilled(ctx: PartnerBillingContext, log: LogLike): boolean {
  if (isCommissionOnly(ctx, log)) return false;
  return parseDailyLogPartnerBilling(log.partner_billing).trips_billed !== false;
}

export function expensePartnerBilled(
  ctx: PartnerBillingContext,
  log: LogLike,
  expense: { bill_to_partner?: boolean | null; partner_billed?: boolean | null },
): boolean {
  if (isCommissionOnly(ctx, log)) return false;
  return expense.bill_to_partner !== false && expense.partner_billed !== false;
}

/** Why a row is not billed (for UI/print labels), or null if billed. */
export function notBilledReason(
  ctx: PartnerBillingContext,
  log: LogLike,
  rowBilled: boolean,
): 'commission_only' | 'toggle' | null {
  if (isCommissionOnly(ctx, log)) return 'commission_only';
  return rowBilled ? null : 'toggle';
}
