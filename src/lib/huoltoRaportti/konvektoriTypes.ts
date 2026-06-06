import type { KonvektoriRowData } from './types';

export type KonvektoriAsennustyyppi = 'katto' | 'seina' | 'lattia';

export const KONVEKTORI_TYYPPI_OPTIONS: ReadonlyArray<{
  value: KonvektoriAsennustyyppi;
  label: string;
  image: string;
}> = [
  { value: 'katto', label: 'Kattokonvektori', image: 'katto.png' },
  { value: 'seina', label: 'Seinäkonvektori', image: 'seina.png' },
  { value: 'lattia', label: 'Lattia-/koja-konvektori', image: 'lattia.png' },
];

const TYYPPI_LABEL: Record<KonvektoriAsennustyyppi, string> = {
  katto: 'Kattokonvektori',
  seina: 'Seinäkonvektori',
  lattia: 'Lattia-/koja-konvektori',
};

const TYYPPI_IMAGE: Record<KonvektoriAsennustyyppi, string> = {
  katto: 'katto.png',
  seina: 'seina.png',
  lattia: 'lattia.png',
};

export function normalizeKonvektoriTyyppi(value: unknown): KonvektoriAsennustyyppi | '' {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'katto' || raw === 'kattokonvektori') return 'katto';
  if (raw === 'seina' || raw === 'seinä' || raw === 'seinäkonvektori' || raw === 'seinakonvektori') return 'seina';
  if (raw === 'lattia' || raw === 'lattiakonvektori' || raw === 'koja') return 'lattia';
  return '';
}

export function konvektoriTyyppiLabel(tyyppi: unknown): string {
  const normalized = normalizeKonvektoriTyyppi(tyyppi);
  return normalized ? TYYPPI_LABEL[normalized] : '';
}

export function konvektoriImageFile(tyyppi: unknown): string {
  const normalized = normalizeKonvektoriTyyppi(tyyppi);
  return normalized ? TYYPPI_IMAGE[normalized] : TYYPPI_IMAGE.seina;
}

export function konvektoriImageUrl(tyyppi: unknown, origin = ''): string {
  const file = konvektoriImageFile(tyyppi);
  const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
  const path = `${base}assets/konvektorit/${file}`;
  if (origin) return `${origin.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  return path;
}

type OverlayPos = { top?: string; bottom?: string; left?: string; right?: string };

const OVERLAY_BY_TYYPPI: Record<KonvektoriAsennustyyppi, {
  tulo: OverlayPos;
  meno: OverlayPos;
  output: OverlayPos;
}> = {
  katto: {
    tulo: { top: '40%', left: '1%' },
    meno: { top: '56%', left: '1%' },
    output: { bottom: '6%', right: '4%' },
  },
  seina: {
    tulo: { top: '36%', left: '1%' },
    meno: { top: '52%', left: '1%' },
    output: { bottom: '10%', left: '32%' },
  },
  lattia: {
    tulo: { top: '30%', left: '1%' },
    meno: { top: '46%', left: '1%' },
    output: { top: '6%', left: '38%' },
  },
};

export function konvektoriOverlayPositions(tyyppi: unknown): typeof OVERLAY_BY_TYYPPI.seina {
  const normalized = normalizeKonvektoriTyyppi(tyyppi) || 'seina';
  return OVERLAY_BY_TYYPPI[normalized];
}

export function formatKonvektoriLampotila(value: unknown): string {
  const s = String(value ?? '').trim();
  if (!s) return '';
  if (/°|°c|c\b/i.test(s)) return s;
  return `${s} °C`;
}

export function formatKonvektoriTeho(value: unknown): string {
  const s = String(value ?? '').trim();
  if (!s) return '';
  if (/kw|w\b/i.test(s)) return s;
  return `${s} kW`;
}

export function konvektoriOutputMeasurement(row: KonvektoriRowData): { label: string; value: string } | null {
  const puh = formatKonvektoriLampotila(row.puhallusLampotila);
  if (puh) return { label: 'Puhallus', value: puh };
  const teho = formatKonvektoriTeho(row.mitattuTeho);
  if (teho) return { label: 'Teho', value: teho };
  return null;
}
