import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkReportDailyLog } from '../types';
import {
  mergeAutoPartnerCommission,
  stripAutoPartnerCommission,
  type BillableCalculation,
} from './workReportBilling';
import {
  billingQuoteHasData,
  computePartnerNetMargin,
  formatCommissionPercent,
  normalizeBillingQuoteSettings,
  parseBillingQuoteSettings,
  type PartnerMarginComputed,
} from './workReportBillingQuote';
import { mergeActualPurchaseFromWorkReportLogs } from './quoteRequestActualPurchaseSync';

/** Automaattisen provisiorivin teksti kumppanilaskulla. */
export function autoPartnerCommissionDescription(margin: PartnerMarginComputed): string {
  const pct = formatCommissionPercent(margin.commissionPercent);
  if (margin.commissionSource === 'amount') {
    return `Provisio (sovittu summa, ${pct} % puhtaasta katteesta)`;
  }
  return `Provisio ${pct} % puhtaasta katteesta`;
}

function latestLogDate(logs: WorkReportDailyLog[]): string | undefined {
  const dates = logs
    .map((log) => String(log.log_date ?? '').slice(0, 10))
    .filter(Boolean)
    .sort();
  return dates[dates.length - 1];
}

/**
 * Lisää kumppanilaskelmaan automaattisen provisiorivin (kind 'commission'), kun
 * työraporttiin on liitetty laskutustarjous. partner_total = calculation.grandTotal
 * (kustannukset + provisio) — yksi mekanismi, ei erillistä summakorjausta.
 *
 * - Päiväkirjan Myyntiprovisio € (commission_amount > 0) on provisio: automaattista
 *   riviä ei lisätä (mergeAutoPartnerCommission poistaa sen).
 * - Ei vaikuta asiakaslaskutukseen.
 */
export function applyQuoteCommissionToPartnerCalculation(input: {
  billingQuote: unknown;
  logs: WorkReportDailyLog[];
  calculation: BillableCalculation;
  /**
   * Linkitetyn tarjouspyynnön data (quote_requests.data). Tarvitaan, jotta
   * hankintariveille saadaan tarjotut laitteet samalla tavalla kuin
   * laskutustarjous-paneelissa. Ilman tätä vanha tallennettu rakenne
   * (pelkkä "Tarvikkeet (päiväkirja)" -rivi) pudottaa laitteen katteesta pois
   * ja provisio paisuu (Wärtsilä: laite 22 896 € puuttui → provisio 15 022,57 €).
   */
  quoteData?: unknown | null;
}): { calculation: BillableCalculation; partnerMargin: PartnerMarginComputed | null } {
  const base = stripAutoPartnerCommission(input.calculation);
  const parsed = normalizeBillingQuoteSettings(parseBillingQuoteSettings(input.billingQuote));
  if (!billingQuoteHasData(parsed)) {
    return { calculation: base, partnerMargin: null };
  }
  const effectiveSettings = mergeActualPurchaseFromWorkReportLogs(
    parsed,
    input.logs,
    input.quoteData ?? null,
  );
  const partnerMargin = computePartnerNetMargin(effectiveSettings, base.grandTotal, {
    logs: input.logs,
    partnerRates: base.ratesUsed,
    customerRates: undefined,
    partnerCalculation: base,
  });
  if (!partnerMargin) {
    return { calculation: base, partnerMargin: null };
  }
  const calculation = mergeAutoPartnerCommission(base, {
    amount: partnerMargin.commissionNet,
    percent: partnerMargin.commissionPercent,
    note: autoPartnerCommissionDescription(partnerMargin),
    logs: input.logs,
    logDate: latestLogDate(input.logs),
  });
  return { calculation, partnerMargin };
}

/**
 * Lataa laskutustarjoukseen linkitetyn tarjouspyynnön datan (laitteet + tarvikkeet),
 * jotta kumppanilaskelman provisio lasketaan samoista hankintariveistä kuin
 * laskutustarjous-paneelissa ja tulosteessa. Palauttaa null, jos linkkiä ei ole
 * tai rivi ei ole luettavissa.
 */
export async function loadLinkedQuoteDataForBillingQuote(
  supabase: SupabaseClient,
  billingQuote: unknown,
): Promise<unknown | null> {
  const parsed = parseBillingQuoteSettings(billingQuote);
  const quoteRequestId = parsed.quote_request_id?.trim();
  if (!quoteRequestId) return null;
  try {
    const { data, error } = await supabase
      .from('quote_requests')
      .select('data')
      .eq('id', quoteRequestId)
      .maybeSingle();
    if (error || !data) return null;
    return (data as { data?: unknown }).data ?? null;
  } catch {
    return null;
  }
}

/**
 * Tallennettu kumppanilaskelma on ristiriitainen, jos partner_total ≠ calculation.grandTotal
 * (ennen #83:a provisio lisättiin vain partner_total:iin → lista näytti "Avoinna"
 * provisiota, raportti ei).
 */
export function partnerBillableStoredTotalMismatch(
  partnerTotal: unknown,
  calculation: unknown,
): boolean {
  const calc = calculation as { grandTotal?: unknown; byUser?: unknown[] } | null | undefined;
  if (!calc?.byUser?.length) return false;
  const total = Number(partnerTotal);
  const grand = Number(calc.grandTotal);
  if (!Number.isFinite(total) || !Number.isFinite(grand)) return false;
  return Math.abs(total - grand) > 0.005;
}

/**
 * Ohitetaanko uudelleenlaskenta täysin laskutetulle raportille. Ei ohiteta, kun
 * käyttäjä painoi "Päivitä laskelma" (force), laskelma on merkitty päivitettäväksi
 * tai tallennettu summa on ristiriidassa laskelman kanssa (vanha, jäätynyt summa).
 * Laskutettu summa (partner_billed_amount) ei muutu uudelleenlaskennassa.
 */
export function shouldSkipPaidPartnerRecalc(input: {
  partnerInvoiceStatus: string | null | undefined;
  partnerBilledAmount: unknown;
  partnerRecalcNeeded?: boolean | null;
  partnerTotal?: unknown;
  calculation?: unknown;
  force?: boolean;
}): boolean {
  if (input.force) return false;
  const isFullyPaid =
    input.partnerInvoiceStatus === 'paid'
    && Number(input.partnerBilledAmount ?? 0) > 0.005
    && input.partnerRecalcNeeded !== true;
  if (!isFullyPaid) return false;
  if (partnerBillableStoredTotalMismatch(input.partnerTotal, input.calculation)) return false;
  return true;
}
