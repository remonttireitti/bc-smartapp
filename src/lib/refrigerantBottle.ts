import type { RefrigerantCylinder } from '../types/inventory';

export type BottleSize = 'small' | 'medium' | 'large';

export type BottleFillFilter = 'all' | 'empty' | 'filled';

export const BOTTLE_SIZE_ORDER: BottleSize[] = ['large', 'medium', 'small'];

export const BOTTLE_SIZE_LABELS: Record<BottleSize, string> = {
  small: 'Pieni',
  medium: 'Keskikokoinen',
  large: 'Iso',
};

/** Sisäinen oletus kg (tyhjä pullo, työraportin yläraja) */
const DEFAULT_CAPACITY_KG: Record<BottleSize, number> = {
  small: 5,
  medium: 12,
  large: 40,
};

/** Karkea fyysinen yläraja sisällölle kokoluokan mukaan */
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

export function bottleSize(c: Pick<RefrigerantCylinder, 'capacity_kg' | 'purchased_kg'>): BottleSize {
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
  if (isBottleEmpty(c)) return 'Tyhjä pullo';
  const type = (c.refrigerant_type || '').trim() || '—';
  const rem = Number(c.remaining_kg);
  return `${type} · ${rem.toFixed(1)} kg`;
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
