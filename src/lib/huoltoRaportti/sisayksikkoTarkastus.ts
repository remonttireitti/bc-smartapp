import type { SisayksikkoData } from './types';
import {
  normalizeLegacyInspectionStatus,
  type HuoltoInspectionStatus,
} from './huoltoInspectionStatus';

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

export function sisayksikkoTarkastusValue(row: SisayksikkoData, field: SisayksikkoTarkastusField): HuoltoInspectionStatus {
  return normalizeLegacyInspectionStatus(row[field]);
}

/** Tuotu raportti, kondenssikohta ilman rastia: ei tarkastettu (lasketaan vastatuksi, ei vika). */
export function sisayksikkoKohtaEiTarkastettu(row: SisayksikkoData, field: SisayksikkoTarkastusField): boolean {
  return field === 'kondenssiTestattu' && row.kondenssiEiTarkastettu === true && sisayksikkoTarkastusValue(row, field) === null;
}

export function sisayksikkoTarkastusSummary(row: SisayksikkoData): {
  answered: number;
  total: number;
  allOk: boolean;
  anyFaulty: boolean;
  complete: boolean;
} {
  const values = SISAYKSIKKO_TARKASTUS_ITEMS.map((item) => sisayksikkoTarkastusValue(row, item.field));
  const neutral = SISAYKSIKKO_TARKASTUS_ITEMS.map((item) => sisayksikkoKohtaEiTarkastettu(row, item.field));
  const answered = values.filter((v, i) => v !== null || neutral[i]).length;
  const relevant = values.filter((v, i) => v !== 'na' && !neutral[i]);
  const allOk = relevant.length > 0 && relevant.every((v) => v === 'ok');
  const anyFaulty = values.some((v) => v === 'faulty');
  return {
    answered,
    total: values.length,
    allOk,
    anyFaulty,
    complete: answered === values.length,
  };
}

/** Vanha tulostemuoto: ok → true, faulty → false, muut → undefined. */
export type LegacySisayksikkoPrintRow = Omit<
  SisayksikkoData,
  'asennettu' | 'kennoPuhdas' | 'eiAania' | 'kondenssiTestattu'
> & {
  asennettu?: boolean;
  kennoPuhdas?: boolean;
  eiAania?: boolean;
  kondenssiTestattu?: boolean;
};

export function mapSisayksikkoForLegacyPrint(row: SisayksikkoData): LegacySisayksikkoPrintRow {
  const toLegacy = (status: HuoltoInspectionStatus): boolean | undefined => {
    if (status === 'ok') return true;
    if (status === 'faulty') return false;
    return undefined;
  };
  const { asennettu, kennoPuhdas, eiAania, kondenssiTestattu, ...rest } = row;
  return {
    ...rest,
    asennettu: toLegacy(normalizeLegacyInspectionStatus(asennettu)),
    kennoPuhdas: toLegacy(normalizeLegacyInspectionStatus(kennoPuhdas)),
    eiAania: toLegacy(normalizeLegacyInspectionStatus(eiAania)),
    kondenssiTestattu: toLegacy(normalizeLegacyInspectionStatus(kondenssiTestattu)),
  };
}
