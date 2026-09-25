import { expenseLinePriceMissing } from './expensePriceMissing';
import {
  computeCustomerPriceFromPartnerCost,
  DEFAULT_PARTNER_EXPENSE_MARGIN_PERCENT,
  DEFAULT_SUPPLY_MARGIN_PERCENT,
  expenseBillingSummaryLabel,
  expensePurchaseLineTotal,
  formatExpenseSupplyExtraBillingMarginNote,
  inferPartnerExpenseMarginPercent,
  inferSupplyMarginPercent,
  resolveExpenseBillingMode,
  resolveExpenseExtraBillableFromSources,
  resolveExpenseExtraBillingAllowedFromSources,
  resolveSupplyLineFlagForExpenseLine,
  syncSupplyExpenseCustomerPrice,
  type ExpenseBillingQuoteContext,
  type SupplyLineExtraBillingFlag,
} from './workReportExpenseBilling';
import { isAutoTripKmExpense } from './tripKmExpense';
import { EXPENSE_TYPE_LABELS, type WorkReportDailyLog } from '../types';

export type ExpenseDraft = {
  key: string;
  expense_type: string;
  description: string;
  qty: string;
  unit_price: string;
  bill_to_partner: boolean;
  bill_to_customer: boolean;
  customer_unit_price: string;
  partner_expense_margin_percent: string;
  customer_margin_percent: string;
  extra_billable: boolean;
  extra_billing_allowed: boolean;
};

export function emptyExpense(): ExpenseDraft {
  return {
    key: crypto.randomUUID(),
    expense_type: '',
    description: '',
    qty: '1',
    unit_price: '',
    bill_to_partner: true,
    bill_to_customer: true,
    customer_unit_price: '',
    partner_expense_margin_percent: String(DEFAULT_PARTNER_EXPENSE_MARGIN_PERCENT),
    customer_margin_percent: String(DEFAULT_SUPPLY_MARGIN_PERCENT),
    extra_billable: false,
    extra_billing_allowed: false,
  };
}

export function syncExpenseCustomerPriceFromPartner(row: ExpenseDraft): ExpenseDraft {
  if (resolveExpenseBillingMode(row) !== 'partner_and_customer') return row;
  const partner = Number(row.unit_price);
  if (!(partner > 0)) return row;
  const margin = Number(row.partner_expense_margin_percent) || DEFAULT_PARTNER_EXPENSE_MARGIN_PERCENT;
  return {
    ...row,
    customer_unit_price: String(computeCustomerPriceFromPartnerCost(partner, margin)),
  };
}

export function patchExpenseDraft(
  row: ExpenseDraft,
  patch: Partial<ExpenseDraft>,
  context?: ExpenseBillingQuoteContext | null,
): ExpenseDraft {
  const next = { ...row, ...patch };
  if (resolveExpenseBillingMode(next) === 'partner_and_customer') {
    return syncExpenseCustomerPriceFromPartner(next);
  }
  if (resolveExpenseBillingMode(next) === 'customer_only') {
    return syncSupplyExpenseCustomerPrice(next, context);
  }
  return next;
}

export function isNewExpenseRow(row: ExpenseDraft): boolean {
  return !row.description.trim() && !row.expense_type;
}

export function expensesToDrafts(
  lines: WorkReportDailyLog['expense_lines'],
  supplyLineFlags?: SupplyLineExtraBillingFlag[],
): ExpenseDraft[] {
  return (lines ?? []).map((line, index) => {
    const fallback = resolveSupplyLineFlagForExpenseLine(line, index, lines, supplyLineFlags);
    const unitPrice = Number(line.unit_price);
    const customerPrice =
      line.customer_unit_price != null && Number(line.customer_unit_price) > 0
        ? Number(line.customer_unit_price)
        : null;
    const isCustomerOnly = line.bill_to_partner === false && line.bill_to_customer !== false;
    const purchaseUnit = isCustomerOnly ? unitPrice : unitPrice;
    const margin =
      line.customer_margin_percent != null && Number.isFinite(Number(line.customer_margin_percent))
        ? Number(line.customer_margin_percent)
        : isCustomerOnly && customerPrice != null && customerPrice > 0 && purchaseUnit > 0
          ? inferSupplyMarginPercent(purchaseUnit, customerPrice)
          : isCustomerOnly
            ? DEFAULT_SUPPLY_MARGIN_PERCENT
            : unitPrice > 0 && customerPrice != null && customerPrice > 0
              ? inferPartnerExpenseMarginPercent(unitPrice, customerPrice)
              : DEFAULT_PARTNER_EXPENSE_MARGIN_PERCENT;
    const extraBillable = resolveExpenseExtraBillableFromSources(line, fallback);
    const extraBillingAllowed = resolveExpenseExtraBillingAllowedFromSources(line, fallback);
    const fallbackMargin = fallback?.customer_margin_percent;
    return {
      key: line.id,
      expense_type: line.expense_type,
      description: line.description,
      qty: String(line.qty),
      unit_price: String(line.unit_price),
      bill_to_partner: line.bill_to_partner !== false,
      bill_to_customer: line.bill_to_customer !== false,
      customer_unit_price:
        customerPrice != null && customerPrice > 0 ? String(customerPrice) : '',
      partner_expense_margin_percent: String(
        isCustomerOnly ? DEFAULT_PARTNER_EXPENSE_MARGIN_PERCENT : margin,
      ),
      customer_margin_percent: String(
        isCustomerOnly
          ? fallbackMargin != null
            ? fallbackMargin
            : margin
          : DEFAULT_SUPPLY_MARGIN_PERCENT,
      ),
      extra_billable: extraBillable,
      extra_billing_allowed: extraBillingAllowed,
    };
  });
}

export function expenseRowSectionTitle(
  row: ExpenseDraft,
  showPartner: boolean,
  showCustomer: boolean,
  context?: ExpenseBillingQuoteContext | null,
): string {
  const type = row.expense_type
    ? (EXPENSE_TYPE_LABELS[row.expense_type] ?? row.expense_type)
    : 'Uusi kulu';
  const desc = row.description.trim() || 'Täytä tiedot';
  const parts = [type, desc];
  if (row.qty.trim()) parts.push(`${row.qty} kpl`);
  if (resolveExpenseBillingMode(row) === 'customer_only' && expensePurchaseLineTotal(row) > 0) {
    parts.push(`hankinta ${expensePurchaseLineTotal(row).toFixed(2)} €`);
  }
  const supplyLabel = formatExpenseSupplyExtraBillingMarginNote(
    row,
    (value) => `${value.toFixed(2)} €`,
    context,
  );
  if (supplyLabel) parts.push(supplyLabel);
  const billingLabel = expenseBillingSummaryLabel(row, {
    showPartner,
    showCustomer,
  });
  if (billingLabel) parts.push(billingLabel);
  if (
    (showPartner || showCustomer)
    && row.expense_type
    && expenseLinePriceMissing({
      expense_type: row.expense_type,
      description: row.description,
      unit_price: row.unit_price,
      customer_unit_price: row.customer_unit_price,
    })
  ) {
    parts.push('hinta puuttuu');
  }
  return parts.join(' · ');
}

export function normalizeExpenseDraftsForSave(
  drafts: ExpenseDraft[],
  context?: ExpenseBillingQuoteContext | null,
): ExpenseDraft[] {
  return drafts.map((row) => {
    if (
      isAutoTripKmExpense({
        key: row.key,
        expense_type: row.expense_type,
        description: row.description,
      } as { key: string; expense_type?: string; description?: string })
    ) {
      return row;
    }
    const mode = resolveExpenseBillingMode(row);
    if (mode === 'customer_only') return syncSupplyExpenseCustomerPrice(row, context);
    if (mode === 'partner_and_customer') return syncExpenseCustomerPriceFromPartner(row);
    return row;
  });
}
