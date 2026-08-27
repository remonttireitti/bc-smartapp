import type { KonvektoriRowData } from './types';
import { sortKonvektoriRowsByTunnus } from './konvektoriRows';

export const KONVEKTORI_TARKASTUS_ITEMS = [
  {
    field: 'suodatinPuhdistettu',
    label: 'Suodatin puhdistettu ja ehjä',
    faultLabel: 'Suodatin ei puhdas tai ei ehjä',
  },
  {
    field: 'kennoPuhdistettu',
    label: 'Kenno puhdas',
    faultLabel: 'Kenno ei puhdas',
  },
  {
    field: 'kondenssiTarkastettu',
    label: 'Kondenssiveden poisto testattu',
    faultLabel: 'Kondenssiveden poisto ei kunnossa',
  },
  {
    field: 'puhallinTarkastettu',
    label: 'Puhallin nopeudet toimii eikä ole sivuääniä',
    faultLabel: 'Puhallin ei toimi kunnolla tai sivuääniä',
  },
  {
    field: 'venttiiliTarkastettu',
    label: 'Venttiili ja toimilaite testattu ja toimii',
    faultLabel: 'Venttiili tai toimilaite ei toimi',
  },
  {
    field: 'ohjausToimii',
    label: 'Ohjaus toimii tarkoituksenmukaisesti',
    faultLabel: 'Ohjaus ei toimi tarkoituksenmukaisesti',
  },
] as const satisfies ReadonlyArray<{
  field: keyof KonvektoriRowData;
  label: string;
  faultLabel: string;
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

/** Konvektori on viallinen jos huomio on merkitty vikaksi tai jokin tarkastuskohta on Ei. */
export function konvektoriRowIsFaulty(row: KonvektoriRowData): boolean {
  const summary = konvektoriTarkastusSummary(row);
  return row.huomioTyyppi === 'vika' || summary.anyNo;
}

/** Poistaa HTML/markdown-muotoilun vikalistaa varten. */
function huomioPlainForFaultList(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Luettelo viallisista kohdista tulostetta varten. */
export function konvektoriFaultLabels(row: KonvektoriRowData): string[] {
  const huomio = row.huomio?.trim();
  if (row.huomioTyyppi === 'vika' && huomio) {
    return [huomioPlainForFaultList(huomio)];
  }

  const labels: string[] = [];
  for (const item of KONVEKTORI_TARKASTUS_ITEMS) {
    if (konvektoriTarkastusValue(row, item.field) === false) {
      labels.push(item.faultLabel);
    }
  }
  if (labels.length === 0 && row.huomioTyyppi === 'vika') {
    labels.push('Vika merkitty');
  }
  return labels;
}

export function filterFaultyKonvektoriRows(
  rows: KonvektoriRowData[] | undefined | null,
): KonvektoriRowData[] {
  return sortKonvektoriRowsByTunnus(
    (rows ?? []).filter((row) => row && typeof row === 'object' && konvektoriRowIsFaulty(row)),
  );
}
