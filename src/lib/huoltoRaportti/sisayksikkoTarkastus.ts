import type { SisayksikkoData } from './types';

export const SISAYKSIKKO_TARKASTUS_ITEMS = [
  { field: 'asennettu', label: 'Asennettu vaatimusten mukaisesti' },
  { field: 'kennoPuhdas', label: 'Kenno ja siipipyörä puhdas/puhdistettu' },
  { field: 'eiAania', label: 'Ei kuulu sivuääniä' },
  { field: 'kondenssiTestattu', label: 'Kondenssiveden poisto testattu/kunnossa' },
] as const satisfies ReadonlyArray<{
  field: keyof Pick<SisayksikkoData, 'asennettu' | 'kennoPuhdas' | 'eiAania' | 'kondenssiTestattu'>;
  label: string;
}>;

export type SisayksikkoTarkastusField = (typeof SISAYKSIKKO_TARKASTUS_ITEMS)[number]['field'];

export function sisayksikkoTarkastusValue(row: SisayksikkoData, field: SisayksikkoTarkastusField): boolean | null {
  const value = row[field];
  if (value === true || value === false) return value;
  return null;
}

export function sisayksikkoTarkastusSummary(row: SisayksikkoData): {
  answered: number;
  total: number;
  allYes: boolean;
  anyNo: boolean;
  complete: boolean;
} {
  const values = SISAYKSIKKO_TARKASTUS_ITEMS.map((item) => sisayksikkoTarkastusValue(row, item.field));
  const answered = values.filter((v) => v !== null).length;
  const allYes = answered === values.length && values.every((v) => v === true);
  const anyNo = values.some((v) => v === false);
  return {
    answered,
    total: values.length,
    allYes,
    anyNo,
    complete: answered === values.length,
  };
}
