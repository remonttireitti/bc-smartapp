import type { WorkReportDailyLog } from '../types';
import { breakdownPartnerBillingForQuoteMargin, type BillableCalculation } from './workReportBilling';
import {
  billingQuoteHasData,
  computePartnerNetMargin,
  normalizeBillingQuoteSettings,
  parseBillingQuoteSettings,
  type PartnerMarginComputed,
} from './workReportBillingQuote';
import { mergeActualPurchaseFromWorkReportLogs } from './quoteRequestActualPurchaseSync';

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Kumppanille laskutettava = kumppanin kustannukset (työ + kulut, ilman provisiorivejä)
 * + provisio. Jos laskelmassa on jo päiväkirjan provisiorivi (Myyntiprovisio €),
 * se korvataan commissionNet:llä eikä lisätä toiseen kertaan.
 * Ei vaikuta asiakaslaskutukseen.
 */
export function resolvePartnerTotalWithCommission(
  calculation: BillableCalculation,
  commissionNet: number,
): number {
  const commissionInCalculation = breakdownPartnerBillingForQuoteMargin(calculation).commission;
  return roundMoney(calculation.grandTotal - commissionInCalculation + commissionNet);
}

/**
 * partner_total työraportille: ilman laskutustarjousta = calculation.grandTotal,
 * tarjouksen kanssa = kustannukset + provisio (computePartnerNetMargin).
 */
export function computePartnerTotalWithQuoteCommission(input: {
  billingQuote: unknown;
  logs: WorkReportDailyLog[];
  calculation: BillableCalculation;
}): { partnerTotal: number; partnerMargin: PartnerMarginComputed | null } {
  const parsed = normalizeBillingQuoteSettings(parseBillingQuoteSettings(input.billingQuote));
  if (!billingQuoteHasData(parsed)) {
    return { partnerTotal: input.calculation.grandTotal, partnerMargin: null };
  }
  const effectiveSettings = mergeActualPurchaseFromWorkReportLogs(parsed, input.logs, null);
  const partnerMargin = computePartnerNetMargin(effectiveSettings, input.calculation.grandTotal, {
    logs: input.logs,
    partnerRates: input.calculation.ratesUsed,
    customerRates: undefined,
    partnerCalculation: input.calculation,
  });
  if (!partnerMargin) {
    return { partnerTotal: input.calculation.grandTotal, partnerMargin: null };
  }
  return {
    partnerTotal: resolvePartnerTotalWithCommission(input.calculation, partnerMargin.commissionNet),
    partnerMargin,
  };
}
