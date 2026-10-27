/** Ilmapuolen tehon laskenta (kostea ilma, merenpinnan paine 101,325 kPa). */
export const P_ATM_KPA = 101.325;

/** Kylläisen vesihöyryn paine kPa (Magnus: veden yllä T ≥ 0 °C, jään yllä T < 0 °C). */
export function saturationPressureKpa(t: number): number {
  return t >= 0
    ? 0.61094 * Math.exp((17.625 * t) / (t + 243.04))
    : 0.61115 * Math.exp((22.452 * t) / (272.55 + t));
}

/** Kosteussuhde kg vettä / kg kuivaa ilmaa. */
export function humidityRatio(t: number, rhPercent: number, p = P_ATM_KPA): number {
  const pv = (rhPercent / 100) * saturationPressureKpa(t);
  return (0.622 * pv) / (p - pv);
}

/** Entalpia kJ/kg kuivaa ilmaa. */
export function enthalpy(t: number, w: number): number {
  return 1.006 * t + w * (2501 + 1.86 * t);
}

/** Ominaistilavuus m³/kg kuivaa ilmaa. */
export function specificVolume(t: number, w: number, p = P_ATM_KPA): number {
  return (0.287042 * (t + 273.15) * (1 + 1.607858 * w)) / p;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export type AirCapacityResult = {
  /** Kokonaisteho kW (positiivinen = höyrystin jäähdyttää / lauhdutin lämmittää ilmaa). */
  totalKw: number;
  sensibleKw: number;
  latentKw: number;
  /** true = kosteutta ei annettu, vain tuntuva teho. */
  sensibleOnly: boolean;
  massFlowKgS: number;
};

/**
 * Ilmavirta mitataan sisääntulosta (m³/h). Höyrystin: suunta 'cooling' (h1 − h2), lauhdutin 'heating' (h2 − h1).
 * allowSensibleOnly: lauhdutin ilman kosteuksia → tuntuva teho.
 */
export function airCapacity(input: {
  tIn: unknown; rhIn: unknown; tOut: unknown; rhOut: unknown; airflowM3h: unknown;
  direction: 'cooling' | 'heating'; allowSensibleOnly?: boolean;
}): AirCapacityResult | null {
  const tIn = num(input.tIn), tOut = num(input.tOut), v = num(input.airflowM3h);
  const rhIn = num(input.rhIn), rhOut = num(input.rhOut);
  if (tIn === null || tOut === null || v === null || v <= 0) return null;
  const sign = input.direction === 'cooling' ? 1 : -1;
  if (rhIn === null || rhOut === null) {
    if (!input.allowSensibleOnly) return null;
    const m = v / 3600 / specificVolume(tIn, 0);
    const kw = sign * m * 1.006 * (tIn - tOut);
    return { totalKw: kw, sensibleKw: kw, latentKw: 0, sensibleOnly: true, massFlowKgS: m };
  }
  if (rhIn < 0 || rhIn > 100 || rhOut < 0 || rhOut > 100) return null;
  const w1 = humidityRatio(tIn, rhIn), w2 = humidityRatio(tOut, rhOut);
  const m = v / 3600 / specificVolume(tIn, w1);
  const total = sign * m * (enthalpy(tIn, w1) - enthalpy(tOut, w2));
  // Latentti (kuivatus) vain höyrystimelle; lauhdutin ei muuta kosteussuhdetta.
  const latent = input.direction === 'cooling' ? Math.max(0, m * (w1 - w2) * 2501) : 0;
  return { totalKw: total, sensibleKw: total - latent, latentKw: latent, sensibleOnly: false, massFlowKgS: m };
}

/** Staattisen ripakennon tyypillinen U-arvo luonnonkonvektiossa (märkä/huurteinen), W/m²K. */
export const STATIC_COIL_U_W_M2K = 7;
/** Oletus ripaväli mm, putkijako mm ja putken ulkohalkaisija m. */
export const STATIC_COIL_DEFAULT_FIN_PITCH_MM = 10;
const TUBE_PITCH_MM = 25;
const TUBE_OD_M = 0.012;

/**
 * Staattinen höyrystin (arvio): A = ripojen pinta + putkien pinta, Q = U × A × (T_huone − T_kenno).
 * Rivat: N = pituus / ripaväli, pinta N × 2 × korkeus × syvyys.
 * Putket: rivit (oletus syvyys/25 mm) × putket/rivi (korkeus/25 mm) × π × 12 mm × pituus.
 */
export function staticEvaporatorEstimate(input: {
  roomT: unknown; coilT: unknown; lengthMm: unknown; heightMm: unknown; depthMm: unknown; finPitchMm?: unknown; tubeRows?: unknown;
}): { kw: number; dtK: number; areaM2: number; uWm2K: number } | null {
  const tr = num(input.roomT), tc = num(input.coilT);
  const l = num(input.lengthMm), h = num(input.heightMm), d = num(input.depthMm);
  const s = num(input.finPitchMm) ?? STATIC_COIL_DEFAULT_FIN_PITCH_MM;
  if (tr === null || tc === null || !l || !h || !d || l <= 0 || h <= 0 || d <= 0 || s <= 0) return null;
  const dt = tr - tc;
  if (dt <= 0) return null;
  const rows = num(input.tubeRows) || Math.max(1, Math.round(d / TUBE_PITCH_MM));
  const tubesPerRow = Math.max(1, Math.round(h / TUBE_PITCH_MM));
  const finArea = (l / s) * 2 * (h / 1000) * (d / 1000);
  const tubeArea = rows * tubesPerRow * Math.PI * TUBE_OD_M * (l / 1000);
  const area = finArea + tubeArea;
  return { kw: (STATIC_COIL_U_W_M2K * area * dt) / 1000, dtK: dt, areaM2: area, uWm2K: STATIC_COIL_U_W_M2K };
}

export function formatKw(kw: number): string {
  return `${kw.toFixed(2).replace('.', ',')} kW`;
}

/** Höyrystimen tallennetuista kentistä staattisen arvion syöte. */
export function staticInput(ev: { kylmioLampotila?: string; kennoLampotila?: string; kennoPituusMm?: string; kennoKorkeusMm?: string; kennoSyvyysMm?: string; ripavaliMm?: string; putkirivit?: string }) {
  return { roomT: ev.kylmioLampotila, coilT: ev.kennoLampotila, lengthMm: ev.kennoPituusMm, heightMm: ev.kennoKorkeusMm, depthMm: ev.kennoSyvyysMm, finPitchMm: ev.ripavaliMm, tubeRows: ev.putkirivit };
}
