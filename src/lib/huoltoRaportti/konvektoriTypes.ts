import type { KonvektoriRowData } from './types';
import { calculateKonvektoriVesipiirinTeho } from './konvektoriTeho';

export type KonvektoriAsennustyyppi = 'katto' | 'seina' | 'lattia' | 'kanavoitava';

export const KONVEKTORI_TYYPPI_OPTIONS: ReadonlyArray<{
  value: KonvektoriAsennustyyppi;
  label: string;
  image: string;
}> = [
  { value: 'katto', label: 'Kattokonvektori', image: 'katto.png' },
  { value: 'seina', label: 'Seinäkonvektori', image: 'seina.png' },
  { value: 'lattia', label: 'Lattia-/koja-konvektori', image: 'lattia.png' },
  { value: 'kanavoitava', label: 'Kanavoitava jäähdytysyksikkö', image: 'kanavoitava.png' },
];

const TYYPPI_LABEL: Record<KonvektoriAsennustyyppi, string> = {
  katto: 'Kattokonvektori',
  seina: 'Seinäkonvektori',
  lattia: 'Lattia-/koja-konvektori',
  kanavoitava: 'Kanavoitava jäähdytysyksikkö',
};

const TYYPPI_IMAGE: Record<KonvektoriAsennustyyppi, string> = {
  katto: 'katto.png',
  seina: 'seina.png',
  lattia: 'lattia.png',
  kanavoitava: 'kanavoitava.png',
};

export function normalizeKonvektoriTyyppi(value: unknown): KonvektoriAsennustyyppi | '' {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'katto' || raw === 'kattokonvektori') return 'katto';
  if (raw === 'seina' || raw === 'seinä' || raw === 'seinäkonvektori' || raw === 'seinakonvektori') return 'seina';
  if (raw === 'lattia' || raw === 'lattiakonvektori' || raw === 'koja') return 'lattia';
  if (raw === 'kanavoitava' || raw === 'kanavoitava jaahdytysyksikko' || raw === 'kanavoitava jäähdytysyksikkö') {
    return 'kanavoitava';
  }
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

type OverlayAnchor = { top?: string; bottom?: string; left?: string; right?: string };

const OVERLAY_BY_TYYPPI: Record<KonvektoriAsennustyyppi, {
  /** Vasemman reunan pino: tulo, virtaus, meno */
  water: OverlayAnchor;
  imu: OverlayAnchor;
  output: OverlayAnchor;
}> = {
  katto: {
    water: { top: '22%', left: '1%' },
    imu: { top: '4%', left: '38%' },
    output: { bottom: '4%', right: '2%' },
  },
  seina: {
    water: { top: '28%', left: '1%' },
    imu: { top: '2%', right: '4%' },
    output: { bottom: '8%', left: '28%' },
  },
  lattia: {
    water: { top: '24%', left: '1%' },
    imu: { bottom: '6%', left: '30%' },
    output: { top: '4%', left: '36%' },
  },
  kanavoitava: {
    water: { top: '26%', left: '1%' },
    imu: { bottom: '4%', left: '34%' },
    output: { top: '2%', right: '2%' },
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
  const calc = calculateKonvektoriVesipiirinTeho(row);
  if (calc) {
    const rounded = Math.round(calc.tehoKw * 100) / 100;
    const value = `${rounded.toLocaleString('fi-FI', { maximumFractionDigits: 2 })} kW`;
    const label = calc.mode === 'jaahdytys' ? 'Lask. jäähdytysteho' : 'Lask. lämmitysteho';
    return { label, value };
  }
  const puh = formatKonvektoriLampotila(row.puhallusLampotila);
  if (puh) return { label: 'Puhallus', value: puh };
  const teho = formatKonvektoriTeho(row.mitattuTeho);
  if (teho) return { label: 'Teho', value: teho };
  return null;
}

export const KONVEKTORI_JAAHDYTYSNESTE_OPTIONS = [
  { value: '', label: 'Valitse…' },
  { value: 'vesi', label: 'Vesi' },
  { value: 'etyleniglykoli_20', label: 'Etyleniglykoli 20 %' },
  { value: 'etyleniglykoli_30', label: 'Etyleniglykoli 30 %' },
  { value: 'etyleniglykoli_40', label: 'Etyleniglykoli 40 %' },
  { value: 'propyleeniglykoli_20', label: 'Propyleeniglykoli 20 %' },
  { value: 'propyleeniglykoli_30', label: 'Propyleeniglykoli 30 %' },
  { value: 'propyleeniglykoli_40', label: 'Propyleeniglykoli 40 %' },
  { value: 'muu', label: 'Muu' },
] as const;

export function konvektoriJaahdytysNesteLabel(value: unknown, muu?: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (raw === 'muu') {
    const custom = String(muu ?? '').trim();
    return custom || 'Muu';
  }
  return KONVEKTORI_JAAHDYTYSNESTE_OPTIONS.find((opt) => opt.value === raw)?.label ?? raw;
}

export function formatKonvektoriVirtaus(value: unknown): string {
  const s = String(value ?? '').trim();
  if (!s) return '';
  if (/l\s*\/\s*s|l\/s/i.test(s)) return s.replace(/\s+/g, '');
  return `${s} l/s`;
}
