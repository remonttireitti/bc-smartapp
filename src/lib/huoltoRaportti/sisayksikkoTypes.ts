import type { SisayksikkoData } from './types';
import {
  formatKonvektoriLampotila,
  konvektoriImageUrl,
  konvektoriOverlayPositions,
  type KonvektoriAsennustyyppi,
} from './konvektoriTypes';

/** Sisäyksikön asennustyyppi (ilmalämpöpumppu). */
export type SisayksikkoAsennustyyppi = 'seina' | 'kattokasetti' | 'kanavoitava' | 'konsooli' | 'katto-pinta';

export const SISAYKSIKKO_TYYPPI_OPTIONS: ReadonlyArray<{
  value: SisayksikkoAsennustyyppi | '';
  label: string;
  schematic: boolean;
}> = [
  { value: 'seina', label: 'Seinä-asenteinen', schematic: true },
  { value: 'kattokasetti', label: 'Kattokasetti', schematic: true },
  { value: 'konsooli', label: 'Konsooli', schematic: false },
  { value: 'katto-pinta', label: 'Katto-pinta', schematic: false },
  { value: 'kanavoitava', label: 'Kanavoitava', schematic: true },
];

const TYYPPI_LABEL: Record<SisayksikkoAsennustyyppi, string> = {
  seina: 'Seinä-asenteinen',
  kattokasetti: 'Kattokasetti',
  konsooli: 'Konsooli',
  'katto-pinta': 'Katto-pinta',
  kanavoitava: 'Kanavoitava',
};

/** Sama pohjakuva kuin konvektorilla. */
function sisayksikkoKonvektoriImageTyyppi(tyyppi: SisayksikkoAsennustyyppi): KonvektoriAsennustyyppi {
  if (tyyppi === 'kattokasetti' || tyyppi === 'katto-pinta') return 'katto';
  if (tyyppi === 'kanavoitava') return 'kanavoitava';
  if (tyyppi === 'konsooli') return 'lattia';
  return 'seina';
}

export function normalizeSisayksikkoTyyppi(value: unknown): SisayksikkoAsennustyyppi | '' {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'seina' || raw === 'seinä' || raw === 'seinä-asenteinen') return 'seina';
  if (raw === 'kattokasetti' || raw === 'katto-kasetti') return 'kattokasetti';
  if (raw === 'konsooli') return 'konsooli';
  if (raw === 'katto-pinta' || raw === 'katto_pinta') return 'katto-pinta';
  if (raw === 'kanavoitava') return 'kanavoitava';
  return '';
}

export function sisayksikkoTyyppiLabel(tyyppi: unknown): string {
  const normalized = normalizeSisayksikkoTyyppi(tyyppi);
  return normalized ? TYYPPI_LABEL[normalized] : '';
}

export function sisayksikkoSupportsSchematic(tyyppi: unknown): boolean {
  const normalized = normalizeSisayksikkoTyyppi(tyyppi);
  if (!normalized) return false;
  return normalized === 'seina' || normalized === 'kattokasetti' || normalized === 'kanavoitava';
}

export function sisayksikkoImageUrl(tyyppi: unknown, origin = ''): string {
  const normalized = normalizeSisayksikkoTyyppi(tyyppi) || 'seina';
  return konvektoriImageUrl(sisayksikkoKonvektoriImageTyyppi(normalized), origin);
}

type OverlayAnchor = { top?: string; bottom?: string; left?: string; right?: string };

/** Sama kuva kuin konvektorilla — overlayt kohdistettu konvektorin imu/puhallus/vasen-pino -pisteisiin. */
export function sisayksikkoOverlayPositions(tyyppi: unknown): {
  huone: OverlayAnchor;
  puhallus: OverlayAnchor;
  paluu: OverlayAnchor;
} {
  const normalized = normalizeSisayksikkoTyyppi(tyyppi) || 'seina';
  const kPos = konvektoriOverlayPositions(sisayksikkoKonvektoriImageTyyppi(normalized));
  return {
    huone: kPos.imu,
    puhallus: kPos.output,
    paluu: kPos.water,
  };
}

export type SisayksikkoTempOverlay = {
  huone?: string;
  puhallus?: string;
  paluu?: string;
};

export function sisayksikkoTempOverlay(
  unit: Pick<SisayksikkoData, 'huoneLampotila'>,
  mittaus?: { sisalampotila?: string; puhallusLampotila?: string; paluuLampotila?: string },
): SisayksikkoTempOverlay {
  const huone = formatKonvektoriLampotila(mittaus?.sisalampotila || unit.huoneLampotila);
  const puhallus = formatKonvektoriLampotila(mittaus?.puhallusLampotila);
  const paluu = formatKonvektoriLampotila(mittaus?.paluuLampotila);
  return {
    ...(huone ? { huone } : {}),
    ...(puhallus ? { puhallus } : {}),
    ...(paluu ? { paluu } : {}),
  };
}
