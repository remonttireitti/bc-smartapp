import type { WorkReportDailyLog } from '../types';
import { formatEuro } from './workReportBilling';

export const DEFAULT_PARTNER_URAKKA_MARGIN_PERCENT = 10;

type UrakkaLog = Pick<
  WorkReportDailyLog,
  'entry_type' | 'fixed_price_amount' | 'customer_fixed_price_amount' | 'partner_urakka_margin_percent'
>;

export function roundUrakkaMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computePartnerUrakkaFromCustomer(
  customerAmount: number,
  marginPercent: number = DEFAULT_PARTNER_URAKKA_MARGIN_PERCENT,
): number {
  const margin = Number.isFinite(marginPercent) ? marginPercent : DEFAULT_PARTNER_URAKKA_MARGIN_PERCENT;
  const clamped = Math.max(0, Math.min(margin, 99.99));
  return roundUrakkaMoney(customerAmount * (1 - clamped / 100));
}

export function resolveUrakkaCustomerAmount(log: UrakkaLog): number | null {
  if (log.entry_type !== 'fixed_price') return null;
  const customer = Number(log.customer_fixed_price_amount);
  if (customer > 0) return customer;
  const legacy = Number(log.fixed_price_amount);
  if (legacy > 0) return legacy;
  return null;
}

export function resolveUrakkaPartnerAmount(log: UrakkaLog): number | null {
  if (log.entry_type !== 'fixed_price') return null;
  const partnerStored = Number(log.fixed_price_amount);
  if (partnerStored > 0) return partnerStored;
  const customer = Number(log.customer_fixed_price_amount);
  if (customer > 0) {
    const margin =
      log.partner_urakka_margin_percent != null
        ? Number(log.partner_urakka_margin_percent)
        : DEFAULT_PARTNER_URAKKA_MARGIN_PERCENT;
    return computePartnerUrakkaFromCustomer(customer, margin);
  }
  return null;
}

export function urakkaHasSplitPricing(log: UrakkaLog): boolean {
  const customer = resolveUrakkaCustomerAmount(log);
  const partner = resolveUrakkaPartnerAmount(log);
  if (customer == null || partner == null) return false;
  return Math.abs(customer - partner) > 0.009;
}

export function urakkaPartnerLineDescription(log: UrakkaLog): string {
  const customer = resolveUrakkaCustomerAmount(log);
  const partner = resolveUrakkaPartnerAmount(log);
  if (customer != null && partner != null && Math.abs(customer - partner) > 0.009) {
    const margin =
      log.partner_urakka_margin_percent != null
        ? Number(log.partner_urakka_margin_percent)
        : DEFAULT_PARTNER_URAKKA_MARGIN_PERCENT;
    return `Urakkahinta · kumppanille (asiakas ${formatEuro(customer)}, kate ${margin} % → ${formatEuro(partner)})`;
  }
  return 'Urakkahinta · kumppanille';
}

export function urakkaCustomerLineDescription(log: UrakkaLog): string {
  if (urakkaHasSplitPricing(log)) {
    return 'Urakkahinta · asiakkaalta (kumppani saa erillisen hinnan)';
  }
  return 'Urakkahinta · asiakkaalta';
}
