import type { KonvektoriRowData } from './types';

/** c_p kJ/(kg·K); vesipiirillä P(kW) ≈ c_p × V(l/s) × ΔT (°C) */
const JAAHDYTYSNESTE_CP: Record<string, number> = {
  vesi: 4.18,
  etyleeniglykoli_20: 3.65,
  etyleeniglykoli_30: 3.45,
  etyleeniglykoli_40: 3.25,
  propyleeniglykoli_20: 3.55,
  propyleeniglykoli_30: 3.35,
  propyleeniglykoli_40: 3.15,
};

/** Ilman näyttöhyöty: P ≈ 1,206 × V(m³/h) / 3600 × |ΔT| */
const AIR_SENSIBLE_FACTOR = 1.206;

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

function formatLs(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return rounded.toLocaleString('fi-FI', { maximumFractionDigits: 3 });
}

export type KonvektoriLaskettuTeho = {
  tehoKw: number;
  mode: 'jaahdytys' | 'lammitys';
  method?: 'vesi' | 'ilma' | 'mitattu';
};

function tehoModeFromDelta(delta: number): KonvektoriLaskettuTeho['mode'] {
  return delta > 0 ? 'jaahdytys' : 'lammitys';
}

/** Paluu- ja menoveden lämpötilat vaaditaan laskentariveihin */
export function konvektoriVesiLampotilatOk(row: KonvektoriRowData): boolean {
  const tulo = parseKonvektoriNumeric(row.tuloLampotila);
  const meno = parseKonvektoriNumeric(row.menoLampotila);
  return tulo != null && meno != null && Math.abs(meno - tulo) >= 0.01;
}

function waterDeltaT(row: KonvektoriRowData): number | null {
  if (!konvektoriVesiLampotilatOk(row)) return null;
  const tulo = parseKonvektoriNumeric(row.tuloLampotila)!;
  const meno = parseKonvektoriNumeric(row.menoLampotila)!;
  return Math.abs(meno - tulo);
}

function nesteCp(row: KonvektoriRowData): number | null {
  const neste = String(row.jaahdytysNeste ?? '').trim();
  if (!neste || neste === 'muu') return null;
  return JAAHDYTYSNESTE_CP[neste] ?? null;
}

/** Laskee vesipiirin teho kW kun virtaus ja lämpötilat tiedossa */
export function calculateKonvektoriVesipiirinTeho(row: KonvektoriRowData): KonvektoriLaskettuTeho | null {
  const cp = nesteCp(row);
  if (cp == null) return null;

  const virtaus = parseKonvektoriNumeric(row.virtausLs);
  const deltaT = waterDeltaT(row);
  if (virtaus == null || virtaus <= 0 || deltaT == null) return null;

  const tehoKw = cp * virtaus * deltaT;
  if (!Number.isFinite(tehoKw) || tehoKw <= 0) return null;

  const tulo = parseKonvektoriNumeric(row.tuloLampotila)!;
  const meno = parseKonvektoriNumeric(row.menoLampotila)!;
  return {
    tehoKw,
    mode: tehoModeFromDelta(meno - tulo),
    method: 'vesi',
  };
}

/** Ilmapuolen teho kun virtaus ja lämpötilat tiedossa (näyttöhyöty) */
export function calculateKonvektoriIlmapuolenTeho(row: KonvektoriRowData): KonvektoriLaskettuTeho | null {
  const huone = parseKonvektoriNumeric(row.huoneLampotila);
  const puhallus = parseKonvektoriNumeric(row.puhallusLampotila);
  const virtausM3h = parseKonvektoriNumeric(row.ilmanVirtausM3h);
  if (huone == null || puhallus == null || virtausM3h == null || virtausM3h <= 0) return null;

  const deltaT = Math.abs(huone - puhallus);
  if (deltaT < 0.01) return null;

  const tehoKw = AIR_SENSIBLE_FACTOR * (virtausM3h / 3600) * deltaT;
  if (!Number.isFinite(tehoKw) || tehoKw <= 0) return null;

  return {
    tehoKw,
    mode: tehoModeFromDelta(huone - puhallus),
    method: 'ilma',
  };
}

/** Arvioi ilmavirtaus m³/h mitatusta/lasketusta tehosta ja ilman lämpötiloista */
export function estimateKonvektoriIlmanVirtausM3h(
  row: KonvektoriRowData,
  tehoKw: number,
): number | null {
  const huone = parseKonvektoriNumeric(row.huoneLampotila);
  const puhallus = parseKonvektoriNumeric(row.puhallusLampotila);
  if (huone == null || puhallus == null || tehoKw <= 0) return null;

  const deltaT = Math.abs(huone - puhallus);
  if (deltaT < 0.01) return null;

  const virtausM3h = (tehoKw * 3600) / (AIR_SENSIBLE_FACTOR * deltaT);
  if (!Number.isFinite(virtausM3h) || virtausM3h <= 0) return null;
  return virtausM3h;
}

/** Arvioi vesivirtaus l/s tehosta ja veden lämpötilaerosta */
export function estimateKonvektoriVesivirtausLs(
  row: KonvektoriRowData,
  tehoKw: number,
): number | null {
  const cp = nesteCp(row);
  const deltaT = waterDeltaT(row);
  if (cp == null || deltaT == null || tehoKw <= 0) return null;

  const virtausLs = tehoKw / (cp * deltaT);
  if (!Number.isFinite(virtausLs) || virtausLs <= 0) return null;
  return virtausLs;
}

export function resolveKonvektoriTehoKw(row: KonvektoriRowData): KonvektoriLaskettuTeho | null {
  const manual = parseKonvektoriNumeric(row.mitattuTeho);
  if (manual != null && manual > 0) {
    const huone = parseKonvektoriNumeric(row.huoneLampotila);
    const puhallus = parseKonvektoriNumeric(row.puhallusLampotila);
    if (huone != null && puhallus != null && Math.abs(huone - puhallus) >= 0.01) {
      return { tehoKw: manual, mode: tehoModeFromDelta(huone - puhallus), method: 'mitattu' };
    }
    return { tehoKw: manual, mode: 'jaahdytys', method: 'mitattu' };
  }

  const ves = calculateKonvektoriVesipiirinTeho(row);
  if (ves) return ves;

  return calculateKonvektoriIlmapuolenTeho(row);
}

function tehoLabel(result: KonvektoriLaskettuTeho, prefix: string): string {
  const mode = result.mode === 'jaahdytys' ? 'jäähdytysteho' : 'lämmitysteho';
  return `${prefix}${result.method === 'mitattu' ? 'Mitattu' : 'Lask.'} ${mode} ${formatKw(result.tehoKw)}`.trim();
}

export function formatKonvektoriLaskettuTeho(result: KonvektoriLaskettuTeho | null, prefix = ''): string {
  if (!result) return '';
  return tehoLabel(result, prefix);
}

/** Laskennalliset rivit — vaatii paluu- ja menoveden lämpötilat */
export function getKonvektoriCalculationLines(row: KonvektoriRowData): string[] {
  if (!konvektoriVesiLampotilatOk(row)) return [];

  const lines: string[] = [];
  const mitattu = parseKonvektoriNumeric(row.mitattuTeho);
  const ves = calculateKonvektoriVesipiirinTeho(row);
  const ilm = calculateKonvektoriIlmapuolenTeho(row);

  if (mitattu != null && mitattu > 0) {
    const resolved = resolveKonvektoriTehoKw(row);
    if (resolved?.method === 'mitattu') lines.push(tehoLabel(resolved, ''));
  }

  if (ves) lines.push(tehoLabel(ves, 'Vesi: '));
  if (ilm) lines.push(tehoLabel(ilm, 'Ilma: '));

  const tehoKw = (mitattu != null && mitattu > 0)
    ? mitattu
    : (ves?.tehoKw ?? ilm?.tehoKw ?? null);

  const ilmanVirtaus = parseKonvektoriNumeric(row.ilmanVirtausM3h);
  if (
    tehoKw != null
    && tehoKw > 0
    && parseKonvektoriNumeric(row.huoneLampotila) != null
    && parseKonvektoriNumeric(row.puhallusLampotila) != null
    && (ilmanVirtaus == null || ilmanVirtaus <= 0)
  ) {
    const arvio = estimateKonvektoriIlmanVirtausM3h(row, tehoKw);
    if (arvio != null) {
      lines.push(`Arvioitu ilmavirtaus ${formatM3h(arvio)} m³/h`);
    }
  }

  const vesivirtaus = parseKonvektoriNumeric(row.virtausLs);
  if (tehoKw != null && tehoKw > 0 && nesteCp(row) != null && (vesivirtaus == null || vesivirtaus <= 0)) {
    const arvioLs = estimateKonvektoriVesivirtausLs(row, tehoKw);
    if (arvioLs != null) {
      lines.push(`Arvioitu vesivirtaus ${formatLs(arvioLs)} l/s`);
    }
  }

  if (mitattu != null && mitattu > 0 && ves) {
    const ero = Math.abs(mitattu - ves.tehoKw);
    const pct = Math.round((ero / Math.max(mitattu, ves.tehoKw)) * 100);
    if (pct > 0) {
      lines.push(`Mittaus vs. vesi − ero ${formatKw(ero)} (${pct} %)`);
    }
  }

  return lines;
}
