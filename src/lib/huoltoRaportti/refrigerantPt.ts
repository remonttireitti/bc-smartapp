/**
 * Kylmäaineen kyllästyslämpötila manometripaineesta (bar gauge).
 * Tulistus: T_imu − T_kaste(P_imu). Alijäähdytys: T_kupla(P_korkea) − T_neste.
 */
import {
  REFRIGERANT_PT_ALIASES,
  REFRIGERANT_PT_BAR,
  REFRIGERANT_PT_CHART_URLS,
  REFRIGERANT_PT_PSIG,
  REFRIGERANT_PT_ZEOTROPIC_BAR,
  REFRIGERANT_PT_ZEOTROPIC_PSIG,
  type BarTempRow,
  type PsigTempRow,
} from './refrigerantPtData';
import { REFRIGERANT_PT_COOLPROP_BAR, REFRIGERANT_PT_COOLPROP_ZEOTROPIC_BAR } from './refrigerantPtCoolProp';

function hasCoolProp(key: string): boolean {
  return !!(REFRIGERANT_PT_COOLPROP_BAR[key] || REFRIGERANT_PT_COOLPROP_ZEOTROPIC_BAR[key]);
}

export type PtBarPoint = { bar: number; temp: number };

/** psig → manometribar (gauge), sama kuin kenttälukemat. */
export const PSIG_TO_BAR_GAUGE = 0.06894757293178306;

export function resolveRefrigerantPtKey(refrigerant: string): string | null {
  let key = (refrigerant || '').trim();
  if (!key || key === 'Muu' || key === 'muu') return null;
  if (key.toUpperCase() === 'R-134A') key = 'R-134a';
  if (key === 'R-744') return 'R-744';
  if (hasCoolProp(key)) return key;
  if (
    REFRIGERANT_PT_PSIG[key] ||
    REFRIGERANT_PT_BAR[key] ||
    REFRIGERANT_PT_ZEOTROPIC_PSIG[key] ||
    REFRIGERANT_PT_ZEOTROPIC_BAR[key]
  ) {
    return key;
  }
  const alias = REFRIGERANT_PT_ALIASES[key];
  return alias ?? null;
}

export function hasRefrigerantPtData(refrigerant: string): boolean {
  return resolveRefrigerantPtKey(refrigerant) != null;
}

/** Onko laskenta vain likimääräinen (alias toiseen aineeseen). */
export function isRefrigerantPtApproximate(refrigerant: string): boolean {
  const key = (refrigerant || '').trim();
  if (!key || key === 'Muu' || key === 'muu') return false;
  if (hasCoolProp(key)) return false;
  if (hasRefrigerantPtData(key) && !REFRIGERANT_PT_ALIASES[key]) return false;
  return REFRIGERANT_PT_ALIASES[key] != null;
}

function rowsToBarPoints(rows: readonly PsigTempRow[]): PtBarPoint[] {
  return rows
    .map(([temp, psig]) => ({ bar: psig * PSIG_TO_BAR_GAUGE, temp }))
    .sort((a, b) => a.bar - b.bar);
}

function rowsBarToPoints(rows: readonly BarTempRow[]): PtBarPoint[] {
  return rows.map(([temp, bar]) => ({ bar, temp })).sort((a, b) => a.bar - b.bar);
}

export function interpolatePtBarAscending(table: readonly PtBarPoint[], pressure: number): number {
  if (table.length === 0) return NaN;
  if (pressure <= table[0].bar) {
    if (table.length < 2) return table[0].temp;
    const p0 = table[0].bar;
    const p1 = table[1].bar;
    if (p1 === p0) return table[0].temp;
    return table[0].temp + ((pressure - p0) / (p1 - p0)) * (table[1].temp - table[0].temp);
  }
  const last = table[table.length - 1];
  if (pressure >= last.bar) {
    if (table.length < 2) return last.temp;
    const prev = table[table.length - 2];
    if (last.bar === prev.bar) return last.temp;
    return prev.temp + ((pressure - prev.bar) / (last.bar - prev.bar)) * (last.temp - prev.temp);
  }
  for (let i = 0; i < table.length - 1; i++) {
    if (pressure >= table[i].bar && pressure <= table[i + 1].bar) {
      const p0 = table[i].bar;
      const p1 = table[i + 1].bar;
      const ratio = (pressure - p0) / (p1 - p0);
      return table[i].temp + ratio * (table[i + 1].temp - table[i].temp);
    }
  }
  return NaN;
}

function getDewTable(key: string): PtBarPoint[] | null {
  const cpZe = REFRIGERANT_PT_COOLPROP_ZEOTROPIC_BAR[key];
  if (cpZe) return rowsBarToPoints(cpZe.dew);
  const cp = REFRIGERANT_PT_COOLPROP_BAR[key];
  if (cp) return rowsBarToPoints(cp);
  const barZe = REFRIGERANT_PT_ZEOTROPIC_BAR[key];
  if (barZe) return rowsBarToPoints(barZe.dew);
  const bar = REFRIGERANT_PT_BAR[key];
  if (bar) return rowsBarToPoints(bar);
  const psigZe = REFRIGERANT_PT_ZEOTROPIC_PSIG[key];
  if (psigZe) return rowsToBarPoints(psigZe.dew);
  const psig = REFRIGERANT_PT_PSIG[key];
  if (psig) return rowsToBarPoints(psig);
  return null;
}

function getBubbleTable(key: string): PtBarPoint[] | null {
  const cpZe = REFRIGERANT_PT_COOLPROP_ZEOTROPIC_BAR[key];
  if (cpZe) return rowsBarToPoints(cpZe.bubble);
  const cp = REFRIGERANT_PT_COOLPROP_BAR[key];
  if (cp) return rowsBarToPoints(cp);
  const barZe = REFRIGERANT_PT_ZEOTROPIC_BAR[key];
  if (barZe) return rowsBarToPoints(barZe.bubble);
  const bar = REFRIGERANT_PT_BAR[key];
  if (bar) return rowsBarToPoints(bar);
  const psigZe = REFRIGERANT_PT_ZEOTROPIC_PSIG[key];
  if (psigZe) return rowsToBarPoints(psigZe.bubble);
  const psig = REFRIGERANT_PT_PSIG[key];
  if (psig) return rowsToBarPoints(psig);
  return null;
}

/** Höyryn kastepiste / puhtaan aineen kyllästys (°C) @ bar gauge. */
export function getSaturationTempFromPressure(pressure: number, refrigerant: string): number {
  if (!(pressure > 0)) return NaN;
  const key = resolveRefrigerantPtKey(refrigerant);
  if (!key) return NaN;
  if (refrigerant.trim() === 'R-744' || key === 'R-744') {
    return interpolateCo2Dew(pressure);
  }
  const table = getDewTable(key);
  if (!table) return NaN;
  const t = interpolatePtBarAscending(table, pressure);
  return Number.isFinite(t) ? t : NaN;
}

/** Nesteen kuplapiste (°C) @ bar gauge — alijäähdytys. */
export function getBubblePointFromPressure(pressure: number, refrigerant: string): number {
  if (!(pressure > 0)) return NaN;
  const key = resolveRefrigerantPtKey(refrigerant);
  if (!key) return NaN;
  if (refrigerant.trim() === 'R-744' || key === 'R-744') {
    return interpolateCo2Bubble(pressure);
  }
  const table = getBubbleTable(key);
  if (!table) return NaN;
  const t = interpolatePtBarAscending(table, pressure);
  return Number.isFinite(t) ? t : NaN;
}

/** CO₂ (R-744) subkriittinen: bar gauge → °C (ei transkriittistä aluetta). */
// CO₂ kyllästys (NIST, bar abs − 1,01325).
const CO2_SUBCRITICAL: PtBarPoint[] = [
  { bar: 5.807, temp: -50 },
  { bar: 9.037, temp: -40 },
  { bar: 13.267, temp: -30 },
  { bar: 18.687, temp: -20 },
  { bar: 25.477, temp: -10 },
  { bar: 33.837, temp: 0 },
  { bar: 38.677, temp: 5 },
  { bar: 44.007, temp: 10 },
  { bar: 49.847, temp: 15 },
  { bar: 56.277, temp: 20 },
  { bar: 63.327, temp: 25 },
  { bar: 71.127, temp: 30 },
];

const CO2_LIMIT_BAR_GAUGE = 71;

function interpolateCo2Dew(pressure: number): number {
  if (pressure > CO2_LIMIT_BAR_GAUGE) return NaN;
  return interpolatePtBarAscending(CO2_SUBCRITICAL, pressure);
}

function interpolateCo2Bubble(pressure: number): number {
  return interpolateCo2Dew(pressure);
}

export function getCo2PtLimitBarGauge(): number {
  return CO2_LIMIT_BAR_GAUGE;
}

export { REFRIGERANT_PT_CHART_URLS };

export function getRefrigerantPtChartUrl(refrigerant: string): string | null {
  const key = resolveRefrigerantPtKey(refrigerant);
  if (!key) return null;
  return REFRIGERANT_PT_CHART_URLS[key] ?? REFRIGERANT_PT_CHART_URLS[refrigerant.trim()] ?? null;
}
