import type { KonvektoriRowData } from './types';

/** c_p kJ/(kg·K); vesipiirillä P(kW) ≈ c_p × V(l/s) × ΔT (°C) kun ρ ≈ 1000 kg/m³ */
const JAAHDYTYSNESTE_CP: Record<string, number> = {
  vesi: 4.18,
  etyleeniglykoli_20: 3.65,
  etyleeniglykoli_30: 3.45,
  etyleeniglykoli_40: 3.25,
  propyleeniglykoli_20: 3.55,
  propyleeniglykoli_30: 3.35,
  propyleeniglykoli_40: 3.15,
};

export function parseKonvektoriNumeric(value: unknown): number | null {
  const raw = String(value ?? '').trim().replace(',', '.');
  if (!raw) return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

export type KonvektoriLaskettuTeho = {
  tehoKw: number;
  mode: 'jaahdytys' | 'lammitys';
};

/** Laskee vesipiirin teho kW: P ≈ c_p × virtaus(l/s) × |meno − tulo| */
export function calculateKonvektoriVesipiirinTeho(row: KonvektoriRowData): KonvektoriLaskettuTeho | null {
  const neste = String(row.jaahdytysNeste ?? '').trim();
  if (!neste || neste === 'muu') return null;

  const cp = JAAHDYTYSNESTE_CP[neste];
  if (cp == null) return null;

  const virtaus = parseKonvektoriNumeric(row.virtausLs);
  const tulo = parseKonvektoriNumeric(row.tuloLampotila);
  const meno = parseKonvektoriNumeric(row.menoLampotila);
  if (virtaus == null || virtaus <= 0 || tulo == null || meno == null) return null;

  const delta = meno - tulo;
  if (Math.abs(delta) < 0.01) return null;

  const tehoKw = cp * virtaus * Math.abs(delta);
  if (!Number.isFinite(tehoKw) || tehoKw <= 0) return null;

  return {
    tehoKw,
    mode: delta > 0 ? 'jaahdytys' : 'lammitys',
  };
}

export function formatKonvektoriLaskettuTeho(result: KonvektoriLaskettuTeho | null): string {
  if (!result) return '';
  const rounded = Math.round(result.tehoKw * 100) / 100;
  const value = rounded.toLocaleString('fi-FI', { maximumFractionDigits: 2 });
  const label = result.mode === 'jaahdytys' ? 'Lask. jäähdytysteho' : 'Lask. lämmitysteho';
  return `${label} ${value} kW`;
}
