import { sumTripLegDraftKm, type TripLegDraft } from './workReportTripLegs';

export const AUTO_TRIP_KM_EXPENSE_KEY = 'auto-trip-km';

/** Kumppanilta (kevytyrittäjä → kumppani) PK-seutu huoltoautoveloitus. */
export const TRIP_PK_FLAT_PARTNER_EUR = 45;
/** Asiakkaalta (kumppani → asiakas) PK-seutu huoltoautoveloitus. */
export const TRIP_PK_FLAT_CUSTOMER_EUR = 55;
/** Yli tämän km:n laskutetaan €/km; muuten PK-seutu flat. */
export const TRIP_KM_PER_KM_THRESHOLD = 50;

/** @deprecated Käytä TRIP_PK_FLAT_PARTNER_EUR — vanha 35 € minimi korvattu hinnaston 45 €:lla. */
export const TRIP_VEHICLE_MIN_BILLING_EUR = TRIP_PK_FLAT_PARTNER_EUR;

export type TripKmExpenseDraft = {
  key: string;
  expense_type: string;
  description: string;
  qty: string;
  unit_price: string;
  bill_to_partner: boolean;
  bill_to_customer: boolean;
  customer_unit_price: string;
  partner_billed?: boolean;
};

export type TripKmBillingLine = {
  qty: number;
  unitPrice: number;
  usesMinimum: boolean;
  /** Todellinen ajomatka km (säilyy myös flat-tilassa). */
  distanceKm: number;
};

export type TripKmFlatOptions = {
  flatEur?: number;
  pkThresholdKm?: number;
};

function parseKmRateField(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 1000) / 1000;
}

function parseFlatField(raw: unknown, fallback: number): number {
  if (raw == null || raw === '') return fallback;
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.round(value * 100) / 100;
}

export function parseTripKmRate(settings?: { trip_km_rate?: unknown } | null): number | null {
  return parseKmRateField(settings?.trip_km_rate);
}

export function parseTripKmCustomerRate(
  settings?: { trip_km_customer_rate?: unknown; trip_km_rate?: unknown } | null,
): number | null {
  return parseKmRateField(settings?.trip_km_customer_rate) ?? parseTripKmRate(settings);
}

export function parseTripPkFlatPartner(
  settings?: { trip_pk_flat_partner?: unknown; trip_vehicle_min?: unknown } | null,
): number {
  return parseFlatField(
    settings?.trip_pk_flat_partner ?? settings?.trip_vehicle_min,
    TRIP_PK_FLAT_PARTNER_EUR,
  );
}

export function parseTripPkFlatCustomer(
  settings?: {
    trip_pk_flat_customer?: unknown;
    trip_vehicle_min_customer?: unknown;
    trip_pk_flat_partner?: unknown;
    trip_vehicle_min?: unknown;
  } | null,
): number {
  const own = settings?.trip_pk_flat_customer ?? settings?.trip_vehicle_min_customer;
  if (own != null && own !== '') return parseFlatField(own, TRIP_PK_FLAT_CUSTOMER_EUR);
  return TRIP_PK_FLAT_CUSTOMER_EUR;
}

export function isAutoTripKmExpense(expense: Pick<TripKmExpenseDraft, 'key'>): boolean {
  return expense.key === AUTO_TRIP_KM_EXPENSE_KEY;
}

function isLikelyAutoTripKmExpense(expense: Pick<TripKmExpenseDraft, 'key' | 'expense_type' | 'description'>): boolean {
  if (isAutoTripKmExpense(expense)) return true;
  return expense.expense_type === 'km' && /^Ajomatkat\s*\(/i.test(expense.description.trim());
}

export { isLikelyAutoTripKmExpense };

/**
 * PK-seutu (≤ 50 km): flat-veloitus (oletus kumppani 45 € / asiakas 55 €).
 * Yli 50 km: qty = km, unitPrice = €/km (ei minimi-inflaatiota).
 */
export function resolveTripKmBillingLine(
  totalKm: number,
  rate: number,
  options?: TripKmFlatOptions,
): TripKmBillingLine {
  const distanceKm = Math.round(totalKm * 10) / 10;
  const unitPrice = Math.round(rate * 100) / 100;
  const flatEur = options?.flatEur ?? TRIP_PK_FLAT_PARTNER_EUR;
  const threshold = options?.pkThresholdKm ?? TRIP_KM_PER_KM_THRESHOLD;

  if (distanceKm > 0 && distanceKm <= threshold) {
    return {
      qty: 1,
      unitPrice: Math.round(flatEur * 100) / 100,
      usesMinimum: true,
      distanceKm,
    };
  }

  return { qty: distanceKm, unitPrice, usesMinimum: false, distanceKm };
}

export function tripKmLineTotal(
  qty: number,
  unitPrice: number,
  usesMinimum: boolean,
  minBilling: number = TRIP_PK_FLAT_PARTNER_EUR,
): number {
  if (usesMinimum) {
    if (qty === 1 && unitPrice > 0) return Math.round(unitPrice * 100) / 100;
    return Math.round(minBilling * 100) / 100;
  }
  return Math.round(qty * unitPrice * 100) / 100;
}

/** Kumppani-/asiakaslaskun km-kulu: PK flat tai km × €/km. */
export function tripKmExpenseBillingTotal(
  expense: Pick<{ expense_type: string; qty: number | string; unit_price: number | string }, 'expense_type' | 'qty' | 'unit_price'>,
  options?: TripKmFlatOptions,
): number {
  return tripKmExpenseBillingLine(expense, options).total;
}

export function tripKmExpenseBillingLine(
  expense: Pick<{ expense_type: string; qty: number | string; unit_price: number | string }, 'expense_type' | 'qty' | 'unit_price'>,
  options?: TripKmFlatOptions,
): { qty: number; unitPrice: number; total: number } {
  const qty = Number(expense.qty);
  const rate = Number(expense.unit_price);
  if (expense.expense_type !== 'km' || !(qty > 0) || !(rate > 0)) {
    return { qty, unitPrice: rate, total: Math.round(qty * rate * 100) / 100 };
  }
  // Jo tallennettu PK-flatina (1 × flat).
  if (qty === 1) {
    const total = Math.round(rate * 100) / 100;
    return { qty: 1, unitPrice: rate, total };
  }
  const billing = resolveTripKmBillingLine(qty, rate, options);
  const total = tripKmLineTotal(
    billing.qty,
    billing.unitPrice,
    billing.usesMinimum,
    options?.flatEur ?? TRIP_PK_FLAT_PARTNER_EUR,
  );
  return {
    qty: billing.qty,
    unitPrice: billing.unitPrice,
    total,
  };
}

export function formatTripKmExpenseDescription(totalKm: number, usesMinimum: boolean): string {
  const qtyStr = String(Math.round(totalKm * 10) / 10);
  if (usesMinimum) {
    return `Ajomatkat (${qtyStr} km, PK-seutu huoltoautoveloitus)`;
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
  const text = description.trim();
  return (
    /minimilaskutus\s+huoltoauto/i.test(text)
    || /PK-seutu\s+huoltoautoveloitus/i.test(text)
  );
}

/** Asiakastulosteen selkeä km-korvauksen selitys. */
export function formatTripKmCustomerPrintDescription(totalKm: number, usesMinimum: boolean): string {
  const qtyStr = (Math.round(totalKm * 10) / 10).toLocaleString('fi-FI', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
  if (usesMinimum) {
    return `Ajomatkat ${qtyStr} km — PK-seutu, laskutetaan huoltoautoveloituksena (ei km-hintaa).`;
  }
  return `Ajomatkat ${qtyStr} km — laskutetaan ajettujen km mukaan.`;
}

export function resolveTripKmCustomerPrintDescription(
  line: { expense_type: string; description: string; qty: number | string },
): string | null {
  if (line.expense_type !== 'km') return null;
  const desc = String(line.description ?? '').trim();
  const qtyKm = Number(line.qty);
  const fromDesc = parseTripKmQuantityFromDescription(desc);
  const km = fromDesc != null && fromDesc > 0
    ? fromDesc
    : qtyKm > 1
      ? qtyKm
      : null;
  if (km == null || !(km > 0)) return null;
  return formatTripKmCustomerPrintDescription(km, tripKmExpenseUsesMinimumBilling(desc) || qtyKm === 1);
}

export function syncTripKmExpenseDrafts<T extends TripKmExpenseDraft>(
  expenseDrafts: T[],
  tripDrafts: TripLegDraft[],
  kmRate: number | null | undefined,
  customerKmRate?: number | null | undefined,
  flats?: { partnerFlat?: number | null; customerFlat?: number | null },
): T[] {
  const withoutAuto = expenseDrafts.filter((row) => !isLikelyAutoTripKmExpense(row));
  const billingSource = expenseDrafts.find(isLikelyAutoTripKmExpense);
  const totalKm = sumTripLegDraftKm(tripDrafts);
  const rate = kmRate != null && Number.isFinite(kmRate) && kmRate > 0 ? kmRate : null;
  const customerRate =
    customerKmRate != null && Number.isFinite(customerKmRate) && customerKmRate > 0
      ? customerKmRate
      : rate;
  const partnerFlat =
    flats?.partnerFlat != null && Number.isFinite(flats.partnerFlat) && flats.partnerFlat > 0
      ? flats.partnerFlat
      : TRIP_PK_FLAT_PARTNER_EUR;
  const customerFlat =
    flats?.customerFlat != null && Number.isFinite(flats.customerFlat) && flats.customerFlat > 0
      ? flats.customerFlat
      : TRIP_PK_FLAT_CUSTOMER_EUR;

  if (!rate || totalKm <= 0) {
    // Trip legs load async when editing — don't wipe auto km row (and its billing flags) yet.
    if (tripDrafts.length === 0) return expenseDrafts;
    return withoutAuto;
  }

  const partnerLine = resolveTripKmBillingLine(totalKm, rate, { flatEur: partnerFlat });
  const customerLine = resolveTripKmBillingLine(totalKm, customerRate ?? rate, {
    flatEur: customerFlat,
  });
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
    ...(billingSource?.partner_billed === false ? { partner_billed: false } : {}),
  } as T;

  return [...withoutAuto, autoDraft];
}

export function formatTripKmRateLabel(kmRate: number | null | undefined): string | null {
  if (kmRate == null || kmRate <= 0) return null;
  return `${kmRate.toFixed(2).replace(/\.?0+$/, '')} €/km`;
}
