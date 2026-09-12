import { isLikelyAutoTripKmExpense } from './tripKmExpense';
import {
  computeInstallationSupplyMarginPercent,
  computeInstallationSupplySellPrice,
} from './quoteRequest/installationSupplies';
import {
  DEFAULT_PARTNER_URAKKA_MARGIN_PERCENT,
  roundUrakkaMoney,
} from './workReportUrakkaBilling';

export type ExpenseBillingMode = 'partner_and_customer' | 'customer_only' | 'included_in_contract';

export const DEFAULT_PARTNER_EXPENSE_MARGIN_PERCENT = DEFAULT_PARTNER_URAKKA_MARGIN_PERCENT;
/** Tarvikkeiden oletuskate asiakashinnassa (hankinta + kate). */
export const DEFAULT_SUPPLY_MARGIN_PERCENT = 80;

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
  row: ExpensePurchaseFields,
): boolean {
  if (resolveExpenseBillingMode(row) !== 'customer_only') return false;
  const purchase = resolveExpensePurchaseUnitPrice(row);
  return purchase == null || !(purchase > 0);
}

export type ExpensePurchaseFields = ExpenseBillingFlags & {
  qty?: number | string | null;
  unit_price?: number | string | null;
  customer_unit_price?: number | string | null;
  description?: string | null;
};

/**
 * customer_only: hankinta on unit_price-kentässä. Vanhassa datassa unit_price voi olla
 * sama kuin asiakashinta — silloin hankintaa ei voi päätellä.
 */
export function resolveExpensePurchaseUnitPrice(row: ExpensePurchaseFields): number | null {
  if (resolveExpenseBillingMode(row) !== 'customer_only') {
    const unit = Number(row.unit_price || 0);
    return unit > 0 ? unit : null;
  }

  const unit = Number(row.unit_price || 0);
  const customerRaw = row.customer_unit_price;
  const customer =
    customerRaw != null && String(customerRaw).trim() !== '' ? Number(customerRaw) : null;

  if (unit > 0 && customer != null && customer > 0) {
    if (unit < customer) return unit;
    if (Math.abs(unit - customer) < 0.005) return null;
    return unit;
  }

  return unit > 0 ? unit : null;
}

export function expensePurchaseLineTotal(row: ExpensePurchaseFields): number {
  const purchaseUnit = resolveExpensePurchaseUnitPrice(row);
  if (purchaseUnit == null || !(purchaseUnit > 0)) return 0;
  const qty = Number(row.qty || 0);
  return Math.round(qty * purchaseUnit * 100) / 100;
}

export type DailyLogExpensePurchaseLine = {
  description: string;
  total: number;
};

export type DailyLogExpensePurchaseAnalysis = {
  purchaseNet: number;
  /** customer_only -kulu, josta puuttuu hankintahinta */
  purchasePricesMissing: boolean;
  lines: DailyLogExpensePurchaseLine[];
};

export function analyzeDailyLogExpensePurchase(
  logs: Array<{
    expense_lines?: Array<ExpensePurchaseFields> | null;
  }>,
): DailyLogExpensePurchaseAnalysis {
  let purchaseNet = 0;
  let purchasePricesMissing = false;
  const lines: DailyLogExpensePurchaseLine[] = [];

  for (const log of logs) {
    for (const line of log.expense_lines ?? []) {
      if (line.bill_to_customer === false) continue;
      if (resolveExpenseBillingMode(line) !== 'customer_only') continue;
      if (expensePurchasePriceMissing(line)) {
        purchasePricesMissing = true;
        continue;
      }
      const purchase = expensePurchaseLineTotal(line);
      if (purchase > 0) {
        purchaseNet += purchase;
        lines.push({
          description: String(line.description ?? '').trim() || 'Ostokulu',
          total: purchase,
        });
      }
    }
  }

  return {
    purchaseNet: Math.round(purchaseNet * 100) / 100,
    purchasePricesMissing,
    lines,
  };
}

export function sumDailyLogExpensePurchaseNet(
  logs: Parameters<typeof analyzeDailyLogExpensePurchase>[0],
): number {
  return analyzeDailyLogExpensePurchase(logs).purchaseNet;
}

export type ExpenseBillingFlags = {
  bill_to_partner?: boolean;
  bill_to_customer?: boolean;
  extra_billable?: boolean;
  extra_billing_allowed?: boolean;
  customer_margin_percent?: number | string | null;
};

export type SupplyLineExtraBillingFlag = {
  extra_billable: boolean;
  extra_billing_allowed: boolean;
  customer_margin_percent?: number | null;
};

export type ExpenseDraftLike = ExpenseBillingFlags & {
  expense_type?: string;
  description?: string;
  qty?: string | number;
  unit_price?: string | number | null;
  key?: string;
};

function expenseDraftCountsForSave(row: ExpenseDraftLike): boolean {
  const description = row.description?.trim() ?? '';
  if (!description) return false;
  if (row.expense_type) return true;
  if (row.key && isLikelyAutoTripKmExpense(row as { key: string; expense_type: string; description: string })) {
    return true;
  }
  return row.expense_type === 'km' && /^Ajomatkat\s*\(/i.test(description);
}

function expenseLineCountsForSupplyFlags(row: ExpenseDraftLike): boolean {
  return (
    expenseDraftCountsForSave(row)
    && !isLikelyAutoTripKmExpense({
      key: row.key ?? '',
      expense_type: row.expense_type ?? '',
      description: row.description ?? '',
    })
  );
}

export function buildSupplyLineFlagsFromExpenseDrafts(
  drafts: ExpenseDraftLike[],
): SupplyLineExtraBillingFlag[] {
  return drafts
    .filter(expenseLineCountsForSupplyFlags)
    .map((row) => {
      const marginRaw = row.customer_margin_percent;
      const margin =
        marginRaw != null && String(marginRaw).trim() !== '' && Number.isFinite(Number(marginRaw))
          ? Number(marginRaw)
          : null;
      return {
        extra_billable: row.extra_billable === true,
        extra_billing_allowed: row.extra_billing_allowed === true,
        customer_margin_percent:
          margin != null && margin >= 0 && margin < 100 ? margin : null,
      };
    });
}

/** Yhdistää DB-sarakkeen ja customer_extra_billing-varmuuskopion. */
export function resolveExpenseExtraBillableFromSources(
  line: ExpenseBillingFlags,
  fallback?: SupplyLineExtraBillingFlag | null,
): boolean {
  if (line.extra_billable === true) return true;
  if (line.extra_billable === false) return false;
  if (fallback != null) return fallback.extra_billable === true;
  return line.extra_billing_allowed === true;
}

export function resolveSupplyLineFlagForExpenseLine(
  _line: { expense_type?: string; description?: string | null },
  lineIndex: number,
  allLines: Array<{ expense_type?: string; description?: string | null }> | null | undefined,
  supplyLineFlags?: SupplyLineExtraBillingFlag[] | null,
): SupplyLineExtraBillingFlag | null {
  if (!supplyLineFlags?.length || !allLines?.length) return null;
  let flagIndex = -1;
  for (let i = 0; i <= lineIndex; i++) {
    const row = allLines[i];
    if (!row) continue;
    if (isLikelyAutoTripKmExpense({
      key: '',
      expense_type: row.expense_type ?? '',
      description: String(row.description ?? ''),
    })) {
      continue;
    }
    flagIndex += 1;
  }
  if (flagIndex < 0) return null;
  return supplyLineFlags[flagIndex] ?? null;
}

export function resolveExpenseExtraBillingAllowedFromSources(
  line: ExpenseBillingFlags,
  fallback?: SupplyLineExtraBillingFlag | null,
): boolean {
  if (!resolveExpenseExtraBillableFromSources(line, fallback)) return false;
  if (line.extra_billing_allowed === true) return true;
  if (line.extra_billing_allowed === false) return false;
  if (fallback != null) return fallback.extra_billing_allowed === true;
  return false;
}

/** Tarvike voi olla lisälaskutettavissa (ei sama kuin lupa). */
export function expenseExtraBillable(
  row: ExpenseBillingFlags,
): boolean {
  if (row.extra_billable === true) return true;
  if (row.extra_billable === false) return false;
  return row.extra_billing_allowed === true;
}

/** Lupa lisälaskutukseen on saatu ja rivi laskutetaan asiakkaalta. */
export function expenseExtraBillingAllowed(row: ExpenseBillingFlags): boolean {
  return expenseExtraBillable(row) && row.extra_billing_allowed === true;
}

export function resolveSupplyMarginPercent(
  row: Pick<ExpenseBillingFlags, 'customer_margin_percent'>,
  fallback: number = DEFAULT_SUPPLY_MARGIN_PERCENT,
): number {
  const raw = row.customer_margin_percent;
  const parsed = raw != null && String(raw).trim() !== '' ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed >= 0 && parsed < 100) return parsed;
  return fallback;
}

/** Asiakashinta = hankinta + kate-% hankinnasta (markup, sama kuin tarjouksen tarvikkeet). */
export function computeSupplyCustomerUnitPrice(
  purchaseUnit: number,
  marginPercent?: number,
): number {
  return computeInstallationSupplySellPrice(
    purchaseUnit,
    marginPercent ?? DEFAULT_SUPPLY_MARGIN_PERCENT,
  );
}

export function inferSupplyMarginPercent(
  purchaseUnit: number,
  customerUnit: number,
  fallback: number = DEFAULT_SUPPLY_MARGIN_PERCENT,
): number {
  const purchase = Number(purchaseUnit) || 0;
  const customer = Number(customerUnit) || 0;
  if (!(purchase > 0) || !(customer > 0)) return fallback;
  const inferred = computeInstallationSupplyMarginPercent(purchase, customer);
  return inferred > 0 ? inferred : fallback;
}

export function expenseSupplyExtraBillingLabel(row: ExpenseBillingFlags): string | null {
  if (resolveExpenseBillingMode(row) !== 'customer_only') return null;
  if (!expenseExtraBillable(row)) return 'kuuluu tarjoukseen · syö katetta';
  if (!row.extra_billing_allowed) return 'lisälaskutettavissa · ei lupaa';
  return 'Lisälaskutettava';
}

export type ExpenseSupplyExtraBillingMarginImpact = {
  currentMarginImpactNet: number;
  marginIfApprovedNet: number;
};

/** Piikkitarvikkeen nykyinen ja hyväksytyn lisälaskutuksen katevaikutus. */
export function expenseSupplyExtraBillingMarginImpact(
  row: ExpensePurchaseFields & ExpenseBillingFlags,
): ExpenseSupplyExtraBillingMarginImpact | null {
  if (resolveExpenseBillingMode(row) !== 'customer_only') return null;
  if (!expenseExtraBillable(row)) return null;
  const qty = Number(row.qty) || 0;
  const purchase = resolveExpensePurchaseUnitPrice(row);
  if (!(qty > 0) || purchase == null || !(purchase > 0)) return null;
  const customerRaw =
    row.customer_unit_price != null && String(row.customer_unit_price).trim() !== ''
      ? Number(row.customer_unit_price)
      : null;
  const customerRate =
    customerRaw != null && customerRaw > 0
      ? customerRaw
      : computeSupplyCustomerUnitPrice(purchase, resolveSupplyMarginPercent(row));
  const customerNet = Math.round(qty * customerRate * 100) / 100;
  const piikkiCostNet = Math.round(qty * purchase * 100) / 100;
  const marginIfApprovedNet = Math.round((customerNet - piikkiCostNet) * 100) / 100;
  if (expenseExtraBillingAllowed(row)) {
    return { currentMarginImpactNet: marginIfApprovedNet, marginIfApprovedNet };
  }
  return { currentMarginImpactNet: -piikkiCostNet, marginIfApprovedNet };
}

export function formatExpenseSupplyExtraBillingMarginNote(
  row: ExpensePurchaseFields & ExpenseBillingFlags,
  formatMoney: (value: number) => string,
): string | null {
  const label = expenseSupplyExtraBillingLabel(row);
  const impact = expenseSupplyExtraBillingMarginImpact(row);
  if (!label || !impact) return label;
  if (expenseExtraBillingAllowed(row)) {
    const sign = impact.currentMarginImpactNet >= 0 ? '+' : '−';
    return `${label} · kate ${sign} ${formatMoney(Math.abs(impact.currentMarginImpactNet))}`;
  }
  const parts = [label];
  if (impact.currentMarginImpactNet < -0.005) {
    parts.push(`nyt − ${formatMoney(Math.abs(impact.currentMarginImpactNet))} kate`);
  }
  const approvedSign = impact.marginIfApprovedNet >= 0 ? '+' : '−';
  parts.push(`jos lupa: ${approvedSign} ${formatMoney(Math.abs(impact.marginIfApprovedNet))} kate`);
  return parts.join(' · ');
}

/** Päivittää piikkiostorivin asiakashinnan — ei muuta laskutustilaa (bill_to_*). */
export function syncSupplyExpenseCustomerPrice<
  T extends ExpenseBillingFlags & {
    unit_price?: number | string | null;
    customer_unit_price?: number | string | null;
    customer_margin_percent?: number | string | null;
  },
>(row: T): T {
  if (resolveExpenseBillingMode(row) !== 'customer_only') return row;
  if (!expenseExtraBillingAllowed(row)) {
    return { ...row, customer_unit_price: '' };
  }
  const purchase = Number(row.unit_price);
  if (!(purchase > 0)) {
    return { ...row, customer_unit_price: '' };
  }
  const margin = resolveSupplyMarginPercent(row);
  return {
    ...row,
    customer_unit_price: String(computeSupplyCustomerUnitPrice(purchase, margin)),
  };
}

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
  const supplyExtraLabel = expenseSupplyExtraBillingLabel(row);
  if (options.showPartner && row.bill_to_partner === false && row.bill_to_customer !== false) {
    return supplyExtraLabel ? ` · ${supplyExtraLabel}` : ' · ei laskuteta kumppanilta';
  }
  if (options.showPartner && row.bill_to_partner === false) return ' · ei veloiteta';
  if (options.showCustomer && row.bill_to_customer === false) return ' · ei laskuteta asiakkaalta';
  return supplyExtraLabel ? ` · ${supplyExtraLabel}` : '';
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
