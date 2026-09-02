import { isLikelyAutoTripKmExpense } from './tripKmExpense';
import {
  DEFAULT_PARTNER_URAKKA_MARGIN_PERCENT,
  roundUrakkaMoney,
} from './workReportUrakkaBilling';

export type ExpenseBillingMode = 'partner_and_customer' | 'customer_only' | 'included_in_contract';

export const DEFAULT_PARTNER_EXPENSE_MARGIN_PERCENT = DEFAULT_PARTNER_URAKKA_MARGIN_PERCENT;

export function computeCustomerPriceFromPartnerCost(
  partnerCost: number,
  marginPercent: number = DEFAULT_PARTNER_EXPENSE_MARGIN_PERCENT,
): number {
  const margin = Number.isFinite(marginPercent) ? marginPercent : DEFAULT_PARTNER_EXPENSE_MARGIN_PERCENT;
  const clamped = Math.max(0, Math.min(margin, 99.99));
  const divisor = 1 - clamped / 100;
  if (divisor <= 0) return roundUrakkaMoney(partnerCost);
  return roundUrakkaMoney(partnerCost / divisor);
}

export function inferPartnerExpenseMarginPercent(
  partnerCost: number,
  customerPrice: number,
  fallback: number = DEFAULT_PARTNER_EXPENSE_MARGIN_PERCENT,
): number {
  if (!(partnerCost > 0) || !(customerPrice > 0) || customerPrice < partnerCost) return fallback;
  return roundUrakkaMoney((1 - partnerCost / customerPrice) * 100);
}

export function expenseCustomerPriceMissing(
  row: ExpenseBillingFlags & { unit_price?: number | string | null; customer_unit_price?: number | string | null },
): boolean {
  const mode = resolveExpenseBillingMode(row);
  const customerRaw = row.customer_unit_price;
  const customerPrice =
    customerRaw != null && String(customerRaw).trim() !== '' ? Number(customerRaw) : null;
  if (customerPrice != null && customerPrice > 0) return false;
  if (mode === 'customer_only') return true;
  if (mode === 'included_in_contract') return false;
  const partnerPrice = Number(row.unit_price || 0);
  return !(partnerPrice > 0);
}

export function expensePurchasePriceMissing(
  row: ExpenseBillingFlags & { unit_price?: number | string | null },
): boolean {
  if (resolveExpenseBillingMode(row) !== 'customer_only') return false;
  return !(Number(row.unit_price || 0) > 0);
}

export function expensePurchaseLineTotal(
  row: Pick<{ qty?: number | string | null; unit_price?: number | string | null }, 'qty' | 'unit_price'>,
): number {
  const qty = Number(row.qty || 0);
  const unit = Number(row.unit_price || 0);
  return Math.round(qty * unit * 100) / 100;
}

export function sumDailyLogExpensePurchaseNet(
  logs: Array<{ expense_lines?: Array<{ qty?: number | string | null; unit_price?: number | string | null }> | null }>,
): number {
  let total = 0;
  for (const log of logs) {
    for (const line of log.expense_lines ?? []) {
      const purchase = expensePurchaseLineTotal(line);
      if (purchase > 0) total += purchase;
    }
  }
  return Math.round(total * 100) / 100;
}

export type ExpenseBillingFlags = {
  bill_to_partner?: boolean;
  bill_to_customer?: boolean;
};

export function resolveExpenseBillingMode(row: ExpenseBillingFlags): ExpenseBillingMode {
  const billToPartner = row.bill_to_partner !== false;
  const billToCustomer = row.bill_to_customer !== false;
  if (!billToPartner && !billToCustomer) return 'included_in_contract';
  if (!billToPartner && billToCustomer) return 'customer_only';
  return 'partner_and_customer';
}

export function applyExpenseBillingMode<T extends ExpenseBillingFlags>(
  row: T,
  mode: ExpenseBillingMode,
): T {
  if (mode === 'included_in_contract') {
    return { ...row, bill_to_partner: false, bill_to_customer: false };
  }
  if (mode === 'customer_only') {
    return { ...row, bill_to_partner: false, bill_to_customer: true };
  }
  return { ...row, bill_to_partner: true, bill_to_customer: true };
}

export function expenseIncludedInContract(row: ExpenseBillingFlags): boolean {
  return row.bill_to_partner === false && row.bill_to_customer === false;
}

export function expenseBillingModeShortLabel(mode: ExpenseBillingMode): string {
  if (mode === 'included_in_contract') return 'kuulu urakkaan · ei veloiteta';
  if (mode === 'customer_only') return 'ei laskuteta kumppanilta';
  return 'laskutetaan kumppanilta';
}

export function expenseBillingSummaryLabel(
  row: ExpenseBillingFlags,
  options: { showPartner: boolean; showCustomer: boolean },
): string | null {
  const mode = resolveExpenseBillingMode(row);
  if (mode === 'included_in_contract') return expenseBillingModeShortLabel(mode);
  if (options.showPartner && options.showCustomer) {
    return mode === 'customer_only' ? expenseBillingModeShortLabel(mode) : null;
  }
  if (options.showPartner && !row.bill_to_partner) {
    return mode === 'customer_only' ? expenseBillingModeShortLabel(mode) : 'ei veloiteta';
  }
  if (options.showCustomer && !row.bill_to_customer) return 'ei veloiteta asiakkaalta';
  return null;
}

export function expensePrintBillingNote(
  row: ExpenseBillingFlags,
  options: { showPartner: boolean; showCustomer: boolean },
): string {
  if (expenseIncludedInContract(row)) return ' · kuulu urakkaan · ei veloiteta';
  if (options.showPartner && row.bill_to_partner === false && row.bill_to_customer !== false) {
    return ' · ei laskuteta kumppanilta';
  }
  if (options.showPartner && row.bill_to_partner === false) return ' · ei veloiteta';
  if (options.showCustomer && row.bill_to_customer === false) return ' · ei laskuteta asiakkaalta';
  return '';
}

export function findAutoTripKmExpense<T extends ExpenseBillingFlags & { key?: string; expense_type?: string; description?: string }>(
  expenseDrafts: T[],
): T | undefined {
  return expenseDrafts.find(
    (row) =>
      row.key === 'auto-trip-km'
      || (row.expense_type === 'km' && /^Ajomatkat\s*\(/i.test(String(row.description ?? '').trim())),
  );
}

export function resolveTripBillingFromExpenses(
  expenseDrafts: ExpenseBillingFlags[],
): ExpenseBillingMode {
  const auto = findAutoTripKmExpense(expenseDrafts);
  return auto ? resolveExpenseBillingMode(auto) : 'partner_and_customer';
}

export function applyTripBillingToExpenses<T extends ExpenseBillingFlags & { key?: string; expense_type?: string; description?: string }>(
  expenseDrafts: T[],
  mode: ExpenseBillingMode,
): T[] {
  return expenseDrafts.map((row) =>
    isLikelyAutoTripKmExpense(row as Parameters<typeof isLikelyAutoTripKmExpense>[0])
      ? applyExpenseBillingMode(row, mode)
      : row,
  );
}

export function tripLegsBillToCustomer(mode: ExpenseBillingMode): boolean {
  return mode !== 'included_in_contract';
}
