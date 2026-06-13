/**
 * Jaettu hinnoittelulogiikka (listahinta → alennus % → hankinta + toimitus).
 * Vastaa Tarjouspyyntö-sivun DEVICE_DEFAULTS -käytäntöjä.
 */
import type { HeatPumpDevice } from './pumpDeviceCatalog';
import type { BrandDeliveryFeesByCategoryRow } from './deviceRegistryTypes';

export type { BrandDeliveryFeesByCategoryRow } from './deviceRegistryTypes';

/** Sisäinen: avaimet aina lowercase (brändi). */
export type BrandDeliveryFeeByCategoryMap = Record<string, BrandDeliveryFeesByCategoryRow>;

export const DEVICE_BRAND_DEFAULTS = {
  daikin: { discountPercent: 52.5 },
  inventor: { discountPercent: 0 },
  samsung: { discountPercent: 0 },
} as const;

function coerceNonNegativeNumber(val: unknown): number | undefined {
  if (typeof val === 'number' && Number.isFinite(val) && val >= 0) return val;
  if (typeof val === 'string') {
    const n = parseFloat(val.replace(',', '.').trim());
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return undefined;
}

/**
 * Firestore / vanhat tallenteet: arvo voi olla merkkijono, avain millä tahansa kirjainkoolla.
 * Palauttaa aina avaimet lowercase — yhteensopiva device.brand → .toLowerCase() -haun kanssa.
 */
export function parseBrandDeliveryFeeRaw(raw: unknown): Record<string, number> {
  if (raw == null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(raw as Record<string, unknown>)) {
    const keyLower = String(k).trim().toLowerCase();
    if (!keyLower) continue;
    const n = coerceNonNegativeNumber(val);
    if (n === undefined) continue;
    out[keyLower] = n;
  }
  return out;
}

/** Tallennus Firestoreen: yhtenäiset avaimet (lowercase). */
export function deliveryFeesForFirestore(uiMap: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(uiMap)) {
    const keyLower = String(k).trim().toLowerCase();
    if (!keyLower) continue;
    const n = coerceNonNegativeNumber(v);
    if (n === undefined) continue;
    out[keyLower] = n;
  }
  return out;
}

/** Tallenna brändi × laitetyyppi -map Firestoreen (brändi lowercase). */
export function deliveryFeesByCategoryForFirestore(
  uiMap: Record<string, BrandDeliveryFeesByCategoryRow>
): BrandDeliveryFeeByCategoryMap {
  const out: BrandDeliveryFeeByCategoryMap = {};
  for (const [k, row] of Object.entries(uiMap)) {
    const keyLower = String(k).trim().toLowerCase();
    if (!keyLower || !row || typeof row !== 'object') continue;
    const o: BrandDeliveryFeesByCategoryRow = {};
    const i = coerceNonNegativeNumber(row.ilmalampopumppu);
    const v = coerceNonNegativeNumber(row['vesi-ilmalampopumppu']);
    if (i !== undefined) o.ilmalampopumppu = i;
    if (v !== undefined) o['vesi-ilmalampopumppu'] = v;
    if (Object.keys(o).length) out[keyLower] = o;
  }
  return out;
}

function parseBrandDeliveryFeesByCategoryRaw(raw: unknown): BrandDeliveryFeeByCategoryMap {
  if (raw == null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: BrandDeliveryFeeByCategoryMap = {};
  for (const [k, val] of Object.entries(raw as Record<string, unknown>)) {
    const brandLower = String(k).trim().toLowerCase();
    if (!brandLower) continue;
    if (typeof val !== 'object' || val === null || Array.isArray(val)) continue;
    const obj = val as Record<string, unknown>;
    const row: BrandDeliveryFeesByCategoryRow = {};
    const i = coerceNonNegativeNumber(obj.ilmalampopumppu);
    const v = coerceNonNegativeNumber(obj['vesi-ilmalampopumppu']);
    if (i !== undefined) row.ilmalampopumppu = i;
    if (v !== undefined) row['vesi-ilmalampopumppu'] = v;
    if (Object.keys(row).length) out[brandLower] = row;
  }
  return out;
}

/**
 * Yhdistää Firestore-meta: uusi rakenne + vanha flat (vain puuttuville tyypeille / brändeille).
 */
export function parseBrandDeliveryFeesFromMeta(
  meta:
    | {
        brandDeliveryFeesByCategory?: unknown;
        brandDeliveryFeePerUnit?: unknown;
      }
    | null
    | undefined
): BrandDeliveryFeeByCategoryMap {
  const fromNested = parseBrandDeliveryFeesByCategoryRaw(meta?.brandDeliveryFeesByCategory);
  const flat = parseBrandDeliveryFeeRaw(meta?.brandDeliveryFeePerUnit);

  const allBrands = new Set<string>();
  Object.keys(fromNested).forEach((k) => allBrands.add(k.trim().toLowerCase()));
  Object.keys(flat).forEach((k) => allBrands.add(k.trim().toLowerCase()));

  const out: BrandDeliveryFeeByCategoryMap = {};
  for (const b of allBrands) {
    const nestedRow = fromNested[b] || {};
    const flatFee = flat[b];
    const row: BrandDeliveryFeesByCategoryRow = {};

    const hasNested =
      nestedRow.ilmalampopumppu !== undefined ||
      nestedRow['vesi-ilmalampopumppu'] !== undefined;

    if (hasNested) {
      if (nestedRow.ilmalampopumppu !== undefined) row.ilmalampopumppu = nestedRow.ilmalampopumppu;
      else if (flatFee !== undefined) row.ilmalampopumppu = flatFee;

      if (nestedRow['vesi-ilmalampopumppu'] !== undefined) {
        row['vesi-ilmalampopumppu'] = nestedRow['vesi-ilmalampopumppu'];
      } else if (flatFee !== undefined) {
        row['vesi-ilmalampopumppu'] = flatFee;
      }
    } else if (flatFee !== undefined) {
      row.ilmalampopumppu = flatFee;
      row['vesi-ilmalampopumppu'] = flatFee;
    }

    if (Object.keys(row).length) out[b] = row;
  }
  return out;
}

/** Näytä rekisteri-UI: täytä katalogin brändinimen avaimilla (esim. Inventor). */
export function expandDeliveryFeesToBrandKeys(
  parsedLowercase: Record<string, number>,
  canonicalBrandNames: string[]
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const br of canonicalBrandNames) {
    const v = parsedLowercase[br.trim().toLowerCase()];
    if (v !== undefined) out[br] = v;
  }
  return out;
}

export function expandDeliveryFeesByCategoryToBrandKeys(
  parsed: BrandDeliveryFeeByCategoryMap,
  canonicalBrandNames: string[]
): Record<string, BrandDeliveryFeesByCategoryRow> {
  const out: Record<string, BrandDeliveryFeesByCategoryRow> = {};
  for (const br of canonicalBrandNames) {
    const row = parsed[br.trim().toLowerCase()];
    if (row && Object.keys(row).length) out[br] = { ...row };
  }
  return out;
}

/** € / toimitusyksikkö (alv 0): vain rekisteristä; ei koodin oletusta. */
export function getResolvedBrandDeliveryFeePerUnit(
  brand: string,
  category: HeatPumpDevice['category'] | null | undefined,
  feeMap: BrandDeliveryFeeByCategoryMap | null | undefined
): number {
  const b = (brand || '').toLowerCase();
  if (!b || !category) return 0;
  const map = feeMap || {};
  let row: BrandDeliveryFeesByCategoryRow | undefined = map[b];
  if (!row) {
    for (const [k, v] of Object.entries(map)) {
      if (String(k).trim().toLowerCase() === b) {
        row = v;
        break;
      }
    }
  }
  if (!row) return 0;
  const fromReg = coerceNonNegativeNumber(row[category]);
  return fromReg !== undefined ? fromReg : 0;
}

export function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function getInventorPostageUnits(device: HeatPumpDevice): number {
  if ((device.brand || '').toLowerCase() !== 'inventor') return 0;
  const n = device.inventorPostageUnits;
  if (typeof n === 'number' && Number.isFinite(n) && n >= 0) return Math.round(n);
  return 1;
}

/**
 * Toimituslisä alv 0. Rekisterin `brandDeliveryFeesByCategory` (€/yksikkö) laitteen tyypin mukaan;
 * Inventor: × postitusyksiköt. Ei oletushintaa.
 */
export function getDeviceDeliveryFeeEuro(
  device: HeatPumpDevice | null | undefined,
  feeMap?: BrandDeliveryFeeByCategoryMap | null
): number {
  if (!device) return 0;
  const b = (device.brand || '').toLowerCase();
  const per = getResolvedBrandDeliveryFeePerUnit(b, device.category, feeMap);
  if (per <= 0) return 0;
  const units = b === 'inventor' ? getInventorPostageUnits(device) : 1;
  return round2(per * units);
}

/** Oletusalennus % valmistajan listasta (hankintaan). */
export function getDefaultDiscountFromListPercent(device: HeatPumpDevice): number {
  const b = (device.brand || '').toLowerCase();
  if (b === 'inventor') return DEVICE_BRAND_DEFAULTS.inventor.discountPercent;
  if (b === 'samsung') return DEVICE_BRAND_DEFAULTS.samsung.discountPercent;
  if (b === 'daikin') {
    if (typeof device.defaultDiscountPercent === 'number') return Number(device.defaultDiscountPercent);
    return DEVICE_BRAND_DEFAULTS.daikin.discountPercent;
  }
  return 0;
}

/**
 * Tehollinen listahinta (alv 0) tukkurin brändikorotuksen jälkeen.
 * @param catalogListPrice katalogin listahinta
 * @param brandBumpPercent yrityksen rekisteristä (voi olla 0)
 */
export function effectiveListAfterBrandBump(catalogListPrice: number, brandBumpPercent: number): number {
  const bump = Number(brandBumpPercent) || 0;
  const base = Number(catalogListPrice) || 0;
  return round2(base * (1 + bump / 100));
}

/**
 * Hankintahinta alv 0: listahinta × (1 − alennus/100) + toimituslisä.
 */
export function computePurchaseNetAlv0(
  device: HeatPumpDevice,
  effectiveListPriceAlv0: number,
  discountFromListPercent: number,
  feeMap?: BrandDeliveryFeeByCategoryMap | null,
  deliveryFeeNet?: number | null,
): number {
  const list = Number(effectiveListPriceAlv0) || 0;
  const d = Number(discountFromListPercent) || 0;
  const after = list * (1 - d / 100);
  const delivery =
    deliveryFeeNet != null
      ? round2(Number(deliveryFeeNet) || 0)
      : getDeviceDeliveryFeeEuro(device, feeMap);
  return round2(after + delivery);
}
