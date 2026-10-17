/** Finnish-friendly decimal: accepts "1,5" and "1.5". */
export function parseFiNumber(raw: string | number | null | undefined): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : Number.NaN;
  const t = String(raw ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(',', '.');
  if (!t) return Number.NaN;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
}

export function parseFiNumberOr(raw: string | number | null | undefined, fallback: number): number {
  const n = parseFiNumber(raw);
  return Number.isFinite(n) ? n : fallback;
}
