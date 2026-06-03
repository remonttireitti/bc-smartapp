import { sumTripLegDraftKm, type TripLegDraft } from './workReportTripLegs';

export const AUTO_TRIP_KM_EXPENSE_KEY = 'auto-trip-km';

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

export function syncTripKmExpenseDrafts<T extends TripKmExpenseDraft>(
  expenseDrafts: T[],
  tripDrafts: TripLegDraft[],
  kmRate: number | null | undefined,
  customerKmRate?: number | null | undefined,
): T[] {
  const withoutAuto = expenseDrafts.filter((row) => !isLikelyAutoTripKmExpense(row));
  const totalKm = sumTripLegDraftKm(tripDrafts);
  const rate = kmRate != null && Number.isFinite(kmRate) && kmRate > 0 ? kmRate : null;
  const customerRate =
    customerKmRate != null && Number.isFinite(customerKmRate) && customerKmRate > 0
      ? customerKmRate
      : rate;

  if (!rate || totalKm <= 0) {
    return withoutAuto;
  }

  const qtyStr = String(Math.round(totalKm * 10) / 10);
  const priceStr = String(Math.round(rate * 100) / 100);
  const customerPriceStr = String(Math.round((customerRate ?? rate) * 100) / 100);
  const billToCustomer =
    tripDrafts.length > 0 && tripDrafts.every((leg) => leg.bill_to_customer !== false);

  const autoDraft = {
    key: AUTO_TRIP_KM_EXPENSE_KEY,
    expense_type: 'km',
    description: `Ajomatkat (${qtyStr} km)`,
    qty: qtyStr,
    unit_price: priceStr,
    bill_to_partner: true,
    bill_to_customer: billToCustomer,
    customer_unit_price: customerPriceStr,
  } as T;

  return [...withoutAuto, autoDraft];
}

export function formatTripKmRateLabel(kmRate: number | null | undefined): string | null {
  if (kmRate == null || kmRate <= 0) return null;
  return `${kmRate.toFixed(2).replace(/\.?0+$/, '')} €/km`;
}
