import type { BottleSize, RefrigerantCylinder } from '../types/inventory';
import { BOTTLE_SIZE_LABELS } from '../types/inventory';
import { daysBetweenInclusive, formatDate, toLocalYmd } from '../types';

export type BottleFillFilter = 'all' | 'empty' | 'filled';

export const BOTTLE_SIZE_ORDER: BottleSize[] = ['large', 'medium', 'small'];

export { BOTTLE_SIZE_LABELS };

const DEFAULT_CAPACITY_KG: Record<BottleSize, number> = {
  small: 5,
  medium: 12,
  large: 40,
};

const MAX_CONTENT_KG: Record<BottleSize, number> = {
  small: 10,
  medium: 20,
  large: 65,
};

export function bottleCapacityKg(c: Pick<RefrigerantCylinder, 'capacity_kg' | 'purchased_kg'>): number {
  const cap = Number(c.capacity_kg);
  if (cap > 0) return cap;
  return Number(c.purchased_kg) || 0;
}

export function bottleSizeFromCapacityKg(capKg: number): BottleSize {
  if (!(capKg > 0)) return 'medium';
  if (capKg < 9) return 'small';
  if (capKg < 18) return 'medium';
  return 'large';
}

export function bottleSize(c: Pick<RefrigerantCylinder, 'bottle_size' | 'capacity_kg' | 'purchased_kg'>): BottleSize {
  if (c.bottle_size === 'small' || c.bottle_size === 'medium' || c.bottle_size === 'large') {
    return c.bottle_size;
  }
  return bottleSizeFromCapacityKg(bottleCapacityKg(c));
}

export function defaultCapacityKgForSize(size: BottleSize): number {
  return DEFAULT_CAPACITY_KG[size];
}

export function maxContentKgForSize(size: BottleSize): number {
  return MAX_CONTENT_KG[size];
}

export function bottleMaxContentKg(c: RefrigerantCylinder): number {
  const size = bottleSize(c);
  const stored = Math.max(bottleCapacityKg(c), Number(c.purchased_kg) || 0);
  return Math.max(maxContentKgForSize(size), stored);
}

export function formatBottleSizeLabel(size: BottleSize): string {
  return BOTTLE_SIZE_LABELS[size];
}

export function formatBottleLabel(
  c: Pick<RefrigerantCylinder, 'id' | 'serial_number' | 'notes'>,
): string {
  const serial = (c.serial_number || '').trim();
  if (serial) return serial;
  const note = (c.notes || '').trim();
  if (note) return note.length > 48 ? `${note.slice(0, 45)}…` : note;
  return `Pullo ${c.id.slice(0, 8)}`;
}

export function isBottleEmpty(c: Pick<RefrigerantCylinder, 'remaining_kg' | 'status'>): boolean {
  if (c.status === 'empty') return true;
  return Number(c.remaining_kg) <= 0.0005;
}

export function bottleFillRatio(c: RefrigerantCylinder): number {
  const max = bottleMaxContentKg(c);
  if (max <= 0) return 0;
  return Math.min(1, Math.max(0, Number(c.remaining_kg) / max));
}

export function formatBottleContent(c: RefrigerantCylinder): string {
  if (isBottleEmpty(c)) return 'Tyhjä';
  const type = (c.refrigerant_type || '').trim() || '—';
  const rem = Number(c.remaining_kg);
  const suffix = c.non_recyclable ? ' · ei kierrätyskelpoinen' : '';
  return `${type} · ${rem.toFixed(1)} kg${suffix}`;
}

/** Lyhyt teksti kortin alle (esim. "7 kg R-407C" tai "Tyhjä"). */
export function formatBottleContentShort(c: RefrigerantCylinder): string {
  if (isBottleEmpty(c)) return 'Tyhjä';
  const type = (c.refrigerant_type || '').trim() || '—';
  return `${Number(c.remaining_kg).toFixed(1)} kg ${type}`;
}

export function groupBottlesBySize(bottles: RefrigerantCylinder[]): Map<BottleSize, RefrigerantCylinder[]> {
  const map = new Map<BottleSize, RefrigerantCylinder[]>();
  for (const b of bottles) {
    const size = bottleSize(b);
    const list = map.get(size) ?? [];
    list.push(b);
    map.set(size, list);
  }
  const ordered = new Map<BottleSize, RefrigerantCylinder[]>();
  for (const size of BOTTLE_SIZE_ORDER) {
    const list = map.get(size);
    if (list?.length) ordered.set(size, list);
  }
  return ordered;
}

export function rentalRegisteredDate(
  c: Pick<RefrigerantCylinder, 'purchase_date' | 'created_at'>,
): string {
  if (c.purchase_date) return c.purchase_date.slice(0, 10);
  return c.created_at.slice(0, 10);
}

export function rentalDayCount(
  c: Pick<RefrigerantCylinder, 'ownership_type' | 'purchase_date' | 'created_at' | 'returned_at'>,
  asOf: Date = new Date(),
): number | null {
  if (c.ownership_type !== 'rental') return null;
  const start = new Date(`${rentalRegisteredDate(c)}T12:00:00`);
  const endYmd = c.returned_at?.slice(0, 10) ?? toLocalYmd(asOf);
  const end = new Date(`${endYmd}T12:00:00`);
  return daysBetweenInclusive(start, end).length;
}

export function formatFinnishDayCount(count: number): string {
  return count === 1 ? '1 päivä' : `${count} päivää`;
}

export function formatRentalDaysShort(
  c: Pick<RefrigerantCylinder, 'ownership_type' | 'purchase_date' | 'created_at' | 'returned_at'>,
  asOf: Date = new Date(),
): string | null {
  const days = rentalDayCount(c, asOf);
  if (days == null) return null;
  return formatFinnishDayCount(days);
}

export function formatRentalPeriodLabel(
  c: Pick<RefrigerantCylinder, 'ownership_type' | 'purchase_date' | 'created_at' | 'returned_at'>,
  asOf: Date = new Date(),
): string | null {
  if (c.ownership_type !== 'rental') return null;
  const days = rentalDayCount(c, asOf);
  if (days == null) return null;
  const startLabel = formatDate(rentalRegisteredDate(c));
  if (c.returned_at) {
    return `${formatFinnishDayCount(days)} vuokralla · ${startLabel} – ${formatDate(c.returned_at.slice(0, 10))}`;
  }
  return `${formatFinnishDayCount(days)} vuokralla · varastoon ${startLabel}`;
}
