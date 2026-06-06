import type { KonvektoriRowData } from './types';

export const KONVEKTORI_TARKASTUS_ITEMS = [
  {
    field: 'suodatinPuhdistettu',
    label: 'Suodatin puhdistettu ja ehjä',
  },
  {
    field: 'kennoPuhdistettu',
    label: 'Kenno puhdas',
  },
  {
    field: 'kondenssiTarkastettu',
    label: 'Kondenssiveden poisto testattu',
  },
  {
    field: 'puhallinTarkastettu',
    label: 'Puhallin nopeudet toimii eikä ole sivuääniä',
  },
  {
    field: 'venttiiliTarkastettu',
    label: 'Venttiili ja toimilaite testattu ja toimii',
  },
  {
    field: 'lisaaOhjausToimii',
    label: 'Lisäohjaus toimii tarkoituksenmukaisesti',
  },
] as const satisfies ReadonlyArray<{
  field: keyof KonvektoriRowData;
  label: string;
}>;

export type KonvektoriTarkastusField = (typeof KONVEKTORI_TARKASTUS_ITEMS)[number]['field'];

export function konvektoriTarkastusValue(row: KonvektoriRowData, field: KonvektoriTarkastusField): boolean | null {
  const value = row[field];
  if (value === true || value === false) return value;
  return null;
}

export function konvektoriTarkastusSummary(row: KonvektoriRowData): {
  answered: number;
  total: number;
  allYes: boolean;
  anyNo: boolean;
  complete: boolean;
} {
  const values = KONVEKTORI_TARKASTUS_ITEMS.map((item) => konvektoriTarkastusValue(row, item.field));
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
