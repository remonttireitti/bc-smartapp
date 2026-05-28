import type { RefrigerantCylinder } from '../types/inventory';

export const STANDARD_BOTTLE_CAPACITIES_KG = [5, 10, 11.3, 12, 20, 40, 62] as const;

export type BottleFillFilter = 'all' | 'empty' | 'filled';

export function bottleCapacityKg(c: Pick<RefrigerantCylinder, 'capacity_kg' | 'purchased_kg'>): number {
  const cap = Number(c.capacity_kg);
  if (cap > 0) return cap;
  return Number(c.purchased_kg) || 0;
}

export function isBottleEmpty(c: Pick<RefrigerantCylinder, 'remaining_kg' | 'status'>): boolean {
  if (c.status === 'empty') return true;
  return Number(c.remaining_kg) <= 0.0005;
}

export function bottleFillRatio(c: RefrigerantCylinder): number {
  const cap = bottleCapacityKg(c);
  if (cap <= 0) return 0;
  return Math.min(1, Math.max(0, Number(c.remaining_kg) / cap));
}

export function formatBottleContent(c: RefrigerantCylinder): string {
  if (isBottleEmpty(c)) return 'Tyhjä pullo';
  const type = (c.refrigerant_type || '').trim() || '—';
  const cap = bottleCapacityKg(c);
  const rem = Number(c.remaining_kg);
  if (cap > 0) return `${type} · ${rem.toFixed(1)} / ${cap.toFixed(1)} kg`;
  return `${type} · ${rem.toFixed(1)} kg`;
}

export function formatCapacityLabel(kg: number): string {
  return `${kg.toFixed(kg % 1 === 0 ? 0 : 1).replace('.', ',')} kg`;
}

export function groupBottlesByCapacity(bottles: RefrigerantCylinder[]): Map<number, RefrigerantCylinder[]> {
  const map = new Map<number, RefrigerantCylinder[]>();
  for (const b of bottles) {
    const cap = bottleCapacityKg(b) || 0;
    const key = cap > 0 ? cap : 0;
    const list = map.get(key) ?? [];
    list.push(b);
    map.set(key, list);
  }
  return new Map([...map.entries()].sort((a, b) => b[0] - a[0]));
}
