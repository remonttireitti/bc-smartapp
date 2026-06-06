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

/** ρ × c_p ilmalle huoneolosuhteissa, kJ/(m³·K) — vain näyttöhyöty */
const AIR_VOL_HEAT = 1.206;

export function parseKonvektoriNumeric(value: unknown): number | null {
  const raw = String(value ?? '').trim().replace(',', '.');
  if (!raw) return null;
  const n = Number.parseFloat(raw.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function formatKw(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded.toLocaleString('fi-FI', { maximumFractionDigits: 2 })} kW`;
}

function formatM3h(value: number): string {
  const rounded = Math.round(value);
  return rounded.toLocaleString('fi-FI', { maximumFractionDigits: 0 });
}

export type KonvektoriLaskettuTeho = {
  tehoKw: number;
  mode: 'jaahdytys' | 'lammitys';
};

function tehoModeFromDelta(delta: number): KonvektoriLaskettuTeho['mode'] {
  return delta > 0 ? 'jaahdytys' : 'lammitys';
}

function airTemperatureDelta(huone: number, puhallus: number): number | null {
  const delta = huone - puhallus;
  if (Math.abs(delta) < 0.01) return null;
  return Math.abs(delta);
}

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
    mode: tehoModeFromDelta(delta),
  };
}

/** Ilmapuolen näyttöhyöty: P ≈ 1,206 × virtaus(m³/h) / 3600 × |huone − puhallus| */
export function calculateKonvektoriIlmapuolenTeho(row: KonvektoriRowData): KonvektoriLaskettuTeho | null {
  const huone = parseKonvektoriNumeric(row.huoneLampotila);
  const puhallus = parseKonvektoriNumeric(row.puhallusLampotila);
  const virtausM3h = parseKonvektoriNumeric(row.ilmanVirtausM3h);
  if (huone == null || puhallus == null || virtausM3h == null || virtausM3h <= 0) return null;

  const deltaT = airTemperatureDelta(huone, puhallus);
  if (deltaT == null) return null;

  const tehoKw = AIR_VOL_HEAT * (virtausM3h / 3600) * deltaT;
  if (!Number.isFinite(tehoKw) || tehoKw <= 0) return null;

  return {
    tehoKw,
    mode: tehoModeFromDelta(huone - puhallus),
  };
}

/** Arvioi ilmavirtaus m³/h kun teho ja ilman lämpötilat tiedossa */
export function estimateKonvektoriIlmanVirtausM3h(
  tehoKw: number,
  huone: number,
  puhallus: number,
): number | null {
  if (tehoKw <= 0) return null;
  const deltaT = airTemperatureDelta(huone, puhallus);
  if (deltaT == null) return null;
  const virtausM3h = (tehoKw * 3600) / (AIR_VOL_HEAT * deltaT);
  if (!Number.isFinite(virtausM3h) || virtausM3h <= 0) return null;
  return virtausM3h;
}

export function resolveKonvektoriTehoKw(row: KonvektoriRowData): KonvektoriLaskettuTeho | null {
  const ves = calculateKonvektoriVesipiirinTeho(row);
  if (ves) return ves;
  const ilm = calculateKonvektoriIlmapuolenTeho(row);
  if (ilm) return ilm;
  const manual = parseKonvektoriNumeric(row.mitattuTeho);
  if (manual == null || manual <= 0) return null;
  const huone = parseKonvektoriNumeric(row.huoneLampotila);
  const puhallus = parseKonvektoriNumeric(row.puhallusLampotila);
  if (huone != null && puhallus != null && Math.abs(huone - puhallus) >= 0.01) {
    return { tehoKw: manual, mode: tehoModeFromDelta(huone - puhallus) };
  }
  return { tehoKw: manual, mode: 'jaahdytys' };
}

export function formatKonvektoriLaskettuTeho(result: KonvektoriLaskettuTeho | null, prefix = ''): string {
  if (!result) return '';
  const label = result.mode === 'jaahdytys' ? 'Lask. jäähdytysteho' : 'Lask. lämmitysteho';
  return `${prefix}${label} ${formatKw(result.tehoKw)}`.trim();
}

/** Kaikki laskennalliset rivit lomakkeeseen ja tulosteeseen */
export function getKonvektoriCalculationLines(row: KonvektoriRowData): string[] {
  const lines: string[] = [];

  const ves = calculateKonvektoriVesipiirinTeho(row);
  if (ves) lines.push(formatKonvektoriLaskettuTeho(ves, 'Vesi: '));

  const ilm = calculateKonvektoriIlmapuolenTeho(row);
  if (ilm) lines.push(formatKonvektoriLaskettuTeho(ilm, 'Ilma: '));

  const huone = parseKonvektoriNumeric(row.huoneLampotila);
  const puhallus = parseKonvektoriNumeric(row.puhallusLampotila);
  const ilmanVirtaus = parseKonvektoriNumeric(row.ilmanVirtausM3h);
  const tehoKw = ves?.tehoKw ?? ilm?.tehoKw ?? parseKonvektoriNumeric(row.mitattuTeho);

  if (
    tehoKw != null
    && tehoKw > 0
    && huone != null
    && puhallus != null
    && (ilmanVirtaus == null || ilmanVirtaus <= 0)
  ) {
    const arvio = estimateKonvektoriIlmanVirtausM3h(tehoKw, huone, puhallus);
    if (arvio != null) {
      lines.push(`Arvioitu ilmavirtaus ${formatM3h(arvio)} m³/h`);
    }
  }

  if (ves && ilm) {
    const ero = Math.abs(ves.tehoKw - ilm.tehoKw);
    const pct = Math.round((ero / Math.max(ves.tehoKw, ilm.tehoKw)) * 100);
    if (pct > 0) {
      lines.push(`Vesi vs. ilma − ero ${formatKw(ero)} (${pct} %)`);
    }
  }

  return lines;
}
