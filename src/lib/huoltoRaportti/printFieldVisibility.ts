export function normalizePrintText(val: unknown): string {
  if (val == null) return '';
  return String(val).replace(/\s+/g, ' ').trim();
}

export function hasPrintableValue(val: unknown): boolean {
  const s = normalizePrintText(val);
  if (!s || s === '-' || s === '—' || s === '–') return false;
  return !/^[-–—]\s*(A|V|bar|°C|K|kg|g|mbar|micron|m³\/h)?$/i.test(s);
}
