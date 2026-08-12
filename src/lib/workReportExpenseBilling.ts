export type ExpenseBillingMode = 'partner_and_customer' | 'customer_only' | 'included_in_contract';

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
  if (mode === 'customer_only') return 'kumppani laskuttaa asiakkaalta';
  return 'laskutetaan kumppanilta ja asiakkaalta';
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
  if (options.showPartner && !row.bill_to_partner) return 'ei veloiteta';
  if (options.showCustomer && !row.bill_to_customer) return 'ei veloiteta asiakkaalta';
  return null;
}

export function expensePrintBillingNote(
  row: ExpenseBillingFlags,
  options: { showPartner: boolean; showCustomer: boolean },
): string {
  if (expenseIncludedInContract(row)) return ' · kuulu urakkaan · ei veloiteta';
  if (options.showPartner && row.bill_to_partner === false && options.showCustomer && row.bill_to_customer !== false) {
    return ' · kumppani laskuttaa asiakkaalta';
  }
  if (options.showPartner && row.bill_to_partner === false) return ' · ei veloiteta';
  if (options.showCustomer && row.bill_to_customer === false) return ' · ei laskuteta asiakkaalta';
  return '';
}
