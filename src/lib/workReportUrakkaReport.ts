import type { WorkReportDailyLog } from '../types';
import {
  DEFAULT_PARTNER_URAKKA_MARGIN_PERCENT,
  computePartnerUrakkaFromCustomer,
  resolveUrakkaCustomerAmount,
  resolveUrakkaPartnerAmount,
  roundUrakkaMoney,
} from './workReportUrakkaBilling';

// Urakkahinta kuuluu koko työraportille. Tallennus pysyy taaksepäin yhteensopivana: hinta on
// raportin ensimmäisellä urakkakirjauksella ("kantaja"), muiden urakkakirjausten hinta on tyhjä.
// Ei importteja workReportBillingiin (lehtimoduuli).

export type UrakkaReportLog = Pick<
  WorkReportDailyLog,
  | 'id'
  | 'log_date'
  | 'created_at'
  | 'entry_type'
  | 'fixed_price_amount'
  | 'customer_fixed_price_amount'
  | 'partner_urakka_margin_percent'
>;

export type UrakkaReportMode = 'direct' | 'from_customer';

export type UrakkaReportSummary = {
  /** Raportissa on vähintään yksi urakkakirjaus. */
  hasUrakka: boolean;
  carrierId: string | null;
  mode: UrakkaReportMode;
  /** Asiakkaalle annettu urakkahinta yhteensä (null = ei annettu). */
  customerTotal: number | null;
  /** Kumppanille laskutettava urakkahinta yhteensä. */
  partnerTotal: number;
  /** Kumppanilta laskutettava osuus asiakashinnasta (%), oletus 90. */
  partnerPercent: number;
};

export const DEFAULT_PARTNER_URAKKA_PERCENT = 100 - DEFAULT_PARTNER_URAKKA_MARGIN_PERCENT;

export function marginToPartnerPercent(margin: number | null | undefined): number {
  const m = margin == null || !Number.isFinite(Number(margin)) ? DEFAULT_PARTNER_URAKKA_MARGIN_PERCENT : Number(margin);
  return Math.round((100 - m) * 100) / 100;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PARTNER_URAKKA_PERCENT;
  return Math.max(0.01, Math.min(100, value));
}

export function urakkaLogsSorted<T extends UrakkaReportLog>(logs: T[]): T[] {
  return logs
    .filter((log) => log.entry_type === 'fixed_price')
    .sort((a, b) =>
      `${String(a.log_date).slice(0, 10)}${a.created_at ?? ''}`.localeCompare(
        `${String(b.log_date).slice(0, 10)}${b.created_at ?? ''}`,
      ),
    );
}

export function summarizeReportUrakka(logs: UrakkaReportLog[]): UrakkaReportSummary {
  const urakkaLogs = urakkaLogsSorted([...logs]);
  if (urakkaLogs.length === 0) {
    return {
      hasUrakka: false,
      carrierId: null,
      mode: 'direct',
      customerTotal: null,
      partnerTotal: 0,
      partnerPercent: DEFAULT_PARTNER_URAKKA_PERCENT,
    };
  }
  // Kantaja: ensimmäinen kirjaus, jolla on hinta; muuten ensimmäinen urakkakirjaus.
  const priced = urakkaLogs.find(
    (log) => (resolveUrakkaPartnerAmount(log) ?? 0) > 0 || (resolveUrakkaCustomerAmount(log) ?? 0) > 0,
  );
  const carrier = priced ?? urakkaLogs[0];
  let customerSum = 0;
  let partnerSum = 0;
  for (const log of urakkaLogs) {
    customerSum += resolveUrakkaCustomerAmount(log) ?? 0;
    partnerSum += resolveUrakkaPartnerAmount(log) ?? 0;
  }
  const carrierCustomer = Number(carrier.customer_fixed_price_amount);
  const fromCustomer =
    carrier.partner_urakka_margin_percent != null && carrierCustomer > 0;
  return {
    hasUrakka: true,
    carrierId: carrier.id,
    mode: fromCustomer ? 'from_customer' : 'direct',
    customerTotal: customerSum > 0 ? roundUrakkaMoney(customerSum) : null,
    partnerTotal: roundUrakkaMoney(partnerSum),
    partnerPercent: marginToPartnerPercent(fromCustomer ? carrier.partner_urakka_margin_percent : null),
  };
}

export type UrakkaReportPriceInput = {
  mode: UrakkaReportMode;
  /** Asiakkaan urakkahinta (€, alv 0 %) tekstinä. */
  customer: string;
  /** Kumppanilta laskutettava osuus (%). */
  partnerPercent: string;
  /** Kumppanille laskutettava urakkahinta (€) suoraan. */
  partner: string;
};

export type UrakkaLogPricePatch = {
  fixed_price_amount: number | null;
  customer_fixed_price_amount: number | null;
  partner_urakka_margin_percent: number | null;
};

export const EMPTY_URAKKA_PRICE_PATCH: UrakkaLogPricePatch = {
  fixed_price_amount: null,
  customer_fixed_price_amount: null,
  partner_urakka_margin_percent: null,
};

function parseMoney(raw: string): number | null {
  const text = String(raw ?? '').trim().replace(',', '.');
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function parsePartnerPercent(raw: string): number {
  const text = String(raw ?? '').trim().replace(',', '.');
  if (!text) return DEFAULT_PARTNER_URAKKA_PERCENT;
  return clampPercent(Number(text));
}

/** Kumppanilasku asiakashinnasta: asiakashinta × % (esim. 5 000 € × 90 % = 4 500 €, 500 € jää kumppanille). */
export function computePartnerBillFromCustomerPrice(customer: number, partnerPercent: number) {
  const pct = clampPercent(partnerPercent);
  const partnerBill = computePartnerUrakkaFromCustomer(customer, 100 - pct);
  return { partnerBill, partnerKeeps: roundUrakkaMoney(customer - partnerBill) };
}

/** Raportin urakkahinta → kantajakirjauksen tallennettavat kentät. */
export function buildUrakkaReportPatch(input: UrakkaReportPriceInput, options?: { keepCustomerPrice?: boolean }): UrakkaLogPricePatch {
  if (input.mode === 'from_customer') {
    const customer = parseMoney(input.customer);
    if (customer == null) return { ...EMPTY_URAKKA_PRICE_PATCH };
    const pct = parsePartnerPercent(input.partnerPercent);
    const { partnerBill } = computePartnerBillFromCustomerPrice(customer, pct);
    return {
      fixed_price_amount: partnerBill,
      customer_fixed_price_amount: customer,
      partner_urakka_margin_percent: roundUrakkaMoney(100 - pct),
    };
  }
  const partner = parseMoney(input.partner);
  const customer = options?.keepCustomerPrice ? parseMoney(input.customer) : null;
  return {
    fixed_price_amount: partner,
    customer_fixed_price_amount: customer,
    partner_urakka_margin_percent: null,
  };
}

/** Hinnan siirto toiselle urakkakirjaukselle, kun kantaja poistetaan tai se ei enää ole urakka. */
export function urakkaPricePatchFromLog(log: UrakkaReportLog): UrakkaLogPricePatch | null {
  const partner = Number(log.fixed_price_amount);
  const customer = Number(log.customer_fixed_price_amount);
  if (!(partner > 0) && !(customer > 0)) return null;
  return {
    fixed_price_amount: log.fixed_price_amount ?? null,
    customer_fixed_price_amount: log.customer_fixed_price_amount ?? null,
    partner_urakka_margin_percent: log.partner_urakka_margin_percent ?? null,
  };
}

/** Kirjaukset, joiden oma hinta pitää tyhjentää kun raportin urakkahinta tallennetaan (muu kuin kantaja). */
export function urakkaLogsToClear(logs: UrakkaReportLog[], carrierId: string): string[] {
  return urakkaLogsSorted([...logs])
    .filter((log) => log.id !== carrierId && urakkaPricePatchFromLog(log) != null)
    .map((log) => log.id);
}
