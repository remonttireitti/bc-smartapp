import { isChecklistCategory, type ChecklistCategoryKey } from './huoltoCategories';

/** Julkiset esimerkkitulosteet (ei kirjautumista): /esimerkit/<laji>. */
export const EXAMPLE_PRINTS = [
  { key: 'konvektori', title: 'Konvektorihuolto', lines: ['Huoltopöytäkirja, 35 konvektoria'], color: '#22c55e' },
  { key: 'lvi', title: 'LVI-huolto', lines: ['Käyttövesi ja lämmitysverkosto'], color: '#0ea5e9' },
  { key: 'iv', title: 'IV-huolto', lines: ['Ilmanvaihtokone, LTO ja ilmamäärät'], color: '#14b8a6' },
  { key: 'sahko', title: 'Sähkötarkastus', lines: ['Mittaukset ryhmittäin, SFS 6000'], color: '#f59e0b' },
] as const;

export type ExamplePrintKey = (typeof EXAMPLE_PRINTS)[number]['key'];

export function examplePrintHref(key: ExamplePrintKey): string {
  return `/esimerkit/${key}`;
}

export function isExamplePrintKey(v: unknown): v is ExamplePrintKey {
  return EXAMPLE_PRINTS.some((p) => p.key === v);
}

export function exampleChecklistCategory(key: ExamplePrintKey): ChecklistCategoryKey | null {
  return isChecklistCategory(key) ? key : null;
}
