import type { WorkReportDailyLog } from '../types';

export type CommissionBillingMode = 'commission_only' | 'commission_plus';

export interface DailyLogPartnerBilling {
  commission_mode?: CommissionBillingMode;
  hours_billed?: boolean;
  trips_billed?: boolean;
  /** Urakkaraportin lisälaskutus: laskutetaan kumppanilta urakan päälle omana osionaan. */
  extra_billing?: boolean;
  /** Takuutyö: kirjauksen tunnit eivät laskutu asiakkaalta eikä kumppanilta. */
  warranty?: boolean;
  /** Takuu: kirjauksen ajomatkat (km) eivät laskutu kenellekään. */
  trips_warranty?: boolean;
  /** Urakka: kirjauksen tunnit ja kulut kuuluvat urakkahintaan; vain rivikohtaisesti Laskutettava-merkityt kulurivit laskutetaan (Lisälaskutus). */
  urakka_all_in?: boolean;
  /** Työtuntirivin Laskutettava: urakassa tunnit laskutetaan urakan päälle (Lisälaskutus), takuussa tunnit ovat takuun ulkopuolisia. */
  hours_row_billed?: boolean;
  /** Kylmäainerivit (indeksi = tallennusjärjestys created_at): takuu, kumppanin varaston myyntiprovisio. */
  refrigerant_flags?: RefrigerantLineFlag[];
}

export type RefrigerantLineFlag = {
  warranty?: boolean;
  /** Kumppanin varasto: ei myyntiä kumppanille, vain provisio % asiakasmyynnistä. */
  customer_sale?: boolean;
  commission_percent?: number;
  /** Kumppanin varasto: varastohinta vain tiedoksi (sarakkeessa unit_price = 0, ei vähennystä). */
  warehouse_unit_price?: number;
};

function parseRefrigerantFlags(raw: unknown): RefrigerantLineFlag[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw.map((entry) => {
    const row = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
    const flag: RefrigerantLineFlag = {};
    if (row.warranty === true) flag.warranty = true;
    if (row.customer_sale === true) flag.customer_sale = true;
    const pct = Number(row.commission_percent);
    if (row.commission_percent != null && row.commission_percent !== '' && Number.isFinite(pct) && pct > 0 && pct <= 100) {
      flag.commission_percent = pct;
    }
    const whp = Number(row.warehouse_unit_price);
    if (row.warehouse_unit_price != null && row.warehouse_unit_price !== '' && Number.isFinite(whp) && whp > 0) {
      flag.warehouse_unit_price = whp;
    }
    return flag;
  });
  return out.some((flag) => Object.keys(flag).length > 0) ? out : undefined;
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
  if (v.extra_billing === true) out.extra_billing = true;
  if (v.warranty === true) out.warranty = true;
  if (v.trips_warranty === true) out.trips_warranty = true;
  if (v.urakka_all_in === true) out.urakka_all_in = true;
  if (v.hours_row_billed === true) out.hours_row_billed = true;
  const refrigerantFlags = parseRefrigerantFlags(v.refrigerant_flags);
  if (refrigerantFlags) out.refrigerant_flags = refrigerantFlags;
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
  if (value.extra_billing === true) out.extra_billing = true;
  if (value.warranty === true) out.warranty = true;
  if (value.trips_warranty === true) out.trips_warranty = true;
  if (value.urakka_all_in === true) out.urakka_all_in = true;
  if (value.hours_row_billed === true) out.hours_row_billed = true;
  const refrigerantFlags = parseRefrigerantFlags(value.refrigerant_flags);
  if (refrigerantFlags) out.refrigerant_flags = refrigerantFlags;
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

/** Urakka-kirjaus, jossa tunnit ja kulut kuuluvat urakkahintaan (Urakka-kytkin). */
export function logExpensesInUrakka(log: { entry_type?: string; partner_billing?: unknown }): boolean {
  return log.entry_type === 'fixed_price' && parseDailyLogPartnerBilling(log.partner_billing).urakka_all_in === true;
}

/** Urakka-kirjauksen tunnit laskutetaan urakan päälle (Laskutettava, Lisälaskutus-osio). */
export function logUrakkaHoursBilled(log: { entry_type?: string; partner_billing?: unknown }): boolean {
  return log.entry_type === 'fixed_price' && parseDailyLogPartnerBilling(log.partner_billing).hours_row_billed === true;
}

/** Lisälaskutus-kirjaus (urakkaraportissa urakan päälle laskutettava työ/kulut). */
export function logIsExtraBilling(log: { partner_billing?: unknown }): boolean {
  return parseDailyLogPartnerBilling(log.partner_billing).extra_billing === true;
}
