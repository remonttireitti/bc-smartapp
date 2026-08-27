import type { KonvektoriRowData } from './types';

/** Järjestä konvektorit tunnuksen mukaan (aakkoset + numerot luonnollisessa järjestyksessä). */
export function compareKonvektoriRowsByTunnus(a: KonvektoriRowData, b: KonvektoriRowData): number {
  const keyA = a.tunnus.trim();
  const keyB = b.tunnus.trim();
  if (!keyA && !keyB) return 0;
  if (!keyA) return 1;
  if (!keyB) return -1;
  return keyA.localeCompare(keyB, 'fi', { numeric: true, sensitivity: 'base' });
}

export function sortKonvektoriRowsByTunnus(rows: KonvektoriRowData[]): KonvektoriRowData[] {
  return [...rows].sort(compareKonvektoriRowsByTunnus);
}
