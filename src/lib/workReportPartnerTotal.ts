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
}): { calculation: BillableCalculation; partnerMargin: PartnerMarginComputed | null } {
  const base = stripAutoPartnerCommission(input.calculation);
  const parsed = normalizeBillingQuoteSettings(parseBillingQuoteSettings(input.billingQuote));
  if (!billingQuoteHasData(parsed)) {
    return { calculation: base, partnerMargin: null };
  }
  const effectiveSettings = mergeActualPurchaseFromWorkReportLogs(parsed, input.logs, null);
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
