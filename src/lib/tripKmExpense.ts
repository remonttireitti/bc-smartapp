import { sumTripLegDraftKm, type TripLegDraft } from './workReportTripLegs';

export const AUTO_TRIP_KM_EXPENSE_KEY = 'auto-trip-km';
export const TRIP_VEHICLE_MIN_BILLING_EUR = 35;

export type TripKmExpenseDraft = {
  key: string;
  expense_type: string;
  description: string;
  qty: string;
  unit_price: string;
  bill_to_partner: boolean;
  bill_to_customer: boolean;
  customer_unit_price: string;
};

export type TripKmBillingLine = {
  qty: number;
  unitPrice: number;
  usesMinimum: boolean;
};

function parseKmRateField(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 1000) / 1000;
}

export function parseTripKmRate(settings?: { trip_km_rate?: unknown } | null): number | null {
  return parseKmRateField(settings?.trip_km_rate);
}

export function parseTripKmCustomerRate(
  settings?: { trip_km_customer_rate?: unknown; trip_km_rate?: unknown } | null,
): number | null {
  return parseKmRateField(settings?.trip_km_customer_rate) ?? parseTripKmRate(settings);
}

export function isAutoTripKmExpense(expense: Pick<TripKmExpenseDraft, 'key'>): boolean {
  return expense.key === AUTO_TRIP_KM_EXPENSE_KEY;
}

function isLikelyAutoTripKmExpense(expense: Pick<TripKmExpenseDraft, 'key' | 'expense_type' | 'description'>): boolean {
  if (isAutoTripKmExpense(expense)) return true;
  return expense.expense_type === 'km' && /^Ajomatkat\s*\(/i.test(expense.description.trim());
}

export { isLikelyAutoTripKmExpense };

export function resolveTripKmBillingLine(totalKm: number, rate: number): TripKmBillingLine {
  const qty = Math.round(totalKm * 10) / 10;
  const unitPrice = Math.round(rate * 100) / 100;
  const total = Math.round(qty * unitPrice * 100) / 100;

  if (qty > 0 && total > 0 && total < TRIP_VEHICLE_MIN_BILLING_EUR) {
    return {
      qty,
      unitPrice: Math.round((TRIP_VEHICLE_MIN_BILLING_EUR / qty) * 100) / 100,
      usesMinimum: true,
    };
  }

  return { qty, unitPrice, usesMinimum: false };
}

export function tripKmLineTotal(qty: number, unitPrice: number, usesMinimum: boolean): number {
  if (usesMinimum) return TRIP_VEHICLE_MIN_BILLING_EUR;
  return Math.round(qty * unitPrice * 100) / 100;
}

/** Kumppani-/asiakaslaskun km-kulu: 35 € minimi ellei km-määrä × €/km ylitä sitä. */
export function tripKmExpenseBillingTotal(
  expense: Pick<{ expense_type: string; qty: number | string; unit_price: number | string }, 'expense_type' | 'qty' | 'unit_price'>,
): number {
  const qty = Number(expense.qty);
  const rate = Number(expense.unit_price);
  if (expense.expense_type !== 'km' || !(qty > 0) || !(rate > 0)) {
    return Math.round(qty * rate * 100) / 100;
  }
  const billing = resolveTripKmBillingLine(qty, rate);
  return tripKmLineTotal(billing.qty, billing.unitPrice, billing.usesMinimum);
}

export function tripKmExpenseBillingLine(
  expense: Pick<{ expense_type: string; qty: number | string; unit_price: number | string }, 'expense_type' | 'qty' | 'unit_price'>,
): { qty: number; unitPrice: number; total: number } {
  const qty = Number(expense.qty);
  const rate = Number(expense.unit_price);
  if (expense.expense_type !== 'km' || !(qty > 0) || !(rate > 0)) {
    return { qty, unitPrice: rate, total: Math.round(qty * rate * 100) / 100 };
  }
  const billing = resolveTripKmBillingLine(qty, rate);
  const total = tripKmLineTotal(billing.qty, billing.unitPrice, billing.usesMinimum);
  return {
    qty: billing.qty,
    unitPrice: billing.unitPrice,
    total,
  };
}

export function formatTripKmExpenseDescription(totalKm: number, usesMinimum: boolean): string {
  const qtyStr = String(Math.round(totalKm * 10) / 10);
  if (usesMinimum) {
    return `Ajomatkat (${qtyStr} km, minimilaskutus huoltoautosta)`;
  }
  return `Ajomatkat (${qtyStr} km)`;
}

export function parseTripKmQuantityFromDescription(description: string): number | null {
  const match = description.trim().match(/^Ajomatkat\s*\(\s*([\d.,]+)\s*km/i);
  if (!match?.[1]) return null;
  const value = Number(match[1].replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function tripKmExpenseUsesMinimumBilling(description: string): boolean {
  return /minimilaskutus\s+huoltoauto/i.test(description.trim());
}

/** Asiakastulosteen selkeä km-korvauksen selitys. */
export function formatTripKmCustomerPrintDescription(totalKm: number, usesMinimum: boolean): string {
  const qtyStr = (Math.round(totalKm * 10) / 10).toLocaleString('fi-FI', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
  if (usesMinimum) {
    return `Ajomatkat ${qtyStr} km — ajo on niin vähäistä, että laskutetaan minimihuoltoautokorvauksen mukaan.`;
  }
  return `Ajomatkat ${qtyStr} km — laskutetaan ajettujen km mukaan.`;
}

export function resolveTripKmCustomerPrintDescription(
  line: { expense_type: string; description: string; qty: number | string },
): string | null {
  if (line.expense_type !== 'km') return null;
  const desc = String(line.description ?? '').trim();
  const qtyKm = Number(line.qty);
  const km = qtyKm > 0 ? qtyKm : parseTripKmQuantityFromDescription(desc);
  if (km == null || !(km > 0)) return null;
  return formatTripKmCustomerPrintDescription(km, tripKmExpenseUsesMinimumBilling(desc));
}

export function syncTripKmExpenseDrafts<T extends TripKmExpenseDraft>(
  expenseDrafts: T[],
  tripDrafts: TripLegDraft[],
  kmRate: number | null | undefined,
  customerKmRate?: number | null | undefined,
): T[] {
  const withoutAuto = expenseDrafts.filter((row) => !isLikelyAutoTripKmExpense(row));
  const billingSource = expenseDrafts.find(isLikelyAutoTripKmExpense);
  const totalKm = sumTripLegDraftKm(tripDrafts);
  const rate = kmRate != null && Number.isFinite(kmRate) && kmRate > 0 ? kmRate : null;
  const customerRate =
    customerKmRate != null && Number.isFinite(customerKmRate) && customerKmRate > 0
      ? customerKmRate
      : rate;

  if (!rate || totalKm <= 0) {
    // Trip legs load async when editing — don't wipe auto km row (and its billing flags) yet.
    if (tripDrafts.length === 0) return expenseDrafts;
    return withoutAuto;
  }

  const partnerLine = resolveTripKmBillingLine(totalKm, rate);
  const customerLine = resolveTripKmBillingLine(totalKm, customerRate ?? rate);
  const usesMinimum = partnerLine.usesMinimum || customerLine.usesMinimum;
  const defaultBillToCustomer =
    tripDrafts.length > 0 && tripDrafts.every((leg) => leg.bill_to_customer !== false);
  const billToPartner = billingSource?.bill_to_partner ?? true;
  const billToCustomer = billingSource?.bill_to_customer ?? defaultBillToCustomer;

  const autoDraft = {
    key: AUTO_TRIP_KM_EXPENSE_KEY,
    expense_type: 'km',
    description: formatTripKmExpenseDescription(totalKm, usesMinimum),
    qty: String(partnerLine.qty),
    unit_price: String(partnerLine.unitPrice),
    bill_to_partner: billToPartner,
    bill_to_customer: billToCustomer,
    customer_unit_price: String(customerLine.unitPrice),
  } as T;

  return [...withoutAuto, autoDraft];
}

export function formatTripKmRateLabel(kmRate: number | null | undefined): string | null {
  if (kmRate == null || kmRate <= 0) return null;
  return `${kmRate.toFixed(2).replace(/\.?0+$/, '')} €/km`;
}
