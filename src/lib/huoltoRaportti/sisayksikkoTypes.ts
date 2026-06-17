import type { SisayksikkoData } from './types';
import { formatKonvektoriLampotila } from './konvektoriTypes';

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

const TYYPPI_IMAGE: Record<SisayksikkoAsennustyyppi, string> = {
  seina: 'seina.svg',
  kattokasetti: 'kattokasetti.svg',
  konsooli: 'seina.svg',
  'katto-pinta': 'kattokasetti.svg',
  kanavoitava: 'kanavoitava.svg',
};

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

export function sisayksikkoImageFile(tyyppi: unknown): string {
  const normalized = normalizeSisayksikkoTyyppi(tyyppi);
  return normalized ? TYYPPI_IMAGE[normalized] : TYYPPI_IMAGE.seina;
}

export function sisayksikkoImageUrl(tyyppi: unknown, origin = ''): string {
  const file = sisayksikkoImageFile(tyyppi);
  const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
  const path = `${base}assets/sisayksikot/${file}`;
  if (origin) return `${origin.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  return path;
}

type OverlayAnchor = { top?: string; bottom?: string; left?: string; right?: string };

/** Ilma-ilmalämpö: ei vesipiiriä — vain huone, puhallus ja paluu. */
const OVERLAY_BY_TYYPPI: Record<SisayksikkoAsennustyyppi, {
  huone: OverlayAnchor;
  puhallus: OverlayAnchor;
  paluu: OverlayAnchor;
}> = {
  seina: {
    huone: { top: '8%', right: '6%' },
    puhallus: { bottom: '18%', left: '32%' },
    paluu: { top: '36%', left: '8%' },
  },
  kattokasetti: {
    huone: { top: '6%', left: '38%' },
    puhallus: { bottom: '8%', left: '28%' },
    paluu: { top: '28%', right: '8%' },
  },
  kanavoitava: {
    huone: { bottom: '6%', left: '34%' },
    puhallus: { top: '8%', right: '10%' },
    paluu: { top: '32%', left: '6%' },
  },
  konsooli: {
    huone: { top: '8%', right: '6%' },
    puhallus: { bottom: '18%', left: '32%' },
    paluu: { top: '36%', left: '8%' },
  },
  'katto-pinta': {
    huone: { top: '6%', left: '38%' },
    puhallus: { bottom: '8%', left: '28%' },
    paluu: { top: '28%', right: '8%' },
  },
};

export function sisayksikkoOverlayPositions(tyyppi: unknown): typeof OVERLAY_BY_TYYPPI.seina {
  const normalized = normalizeSisayksikkoTyyppi(tyyppi) || 'seina';
  return OVERLAY_BY_TYYPPI[normalized];
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
