/** Ilman entalpia ja jäähdytysteho kosteus huomioiden (T + RH). */

const ATM_PRESSURE_PA = 101325;
const AIR_DENSITY_KG_M3 = 1.2;

/** Kosteus suhteellinen kJ/kg kuivaa ilmaa (n. ASHRAE / Magnus). */
export function moistAirEnthalpyKjPerKg(dryBulbC: number, rhPercent: number): number | null {
  if (!Number.isFinite(dryBulbC) || !Number.isFinite(rhPercent)) return null;
  if (rhPercent < 0 || rhPercent > 100) return null;

  const pws = 611.2 * Math.exp((17.67 * dryBulbC) / (dryBulbC + 243.5));
  const pw = (rhPercent / 100) * pws;
  if (pw <= 0 || pw >= ATM_PRESSURE_PA) return null;

  const humidityRatio = 0.622 * pw / (ATM_PRESSURE_PA - pw);
  return 1.006 * dryBulbC + humidityRatio * (2501 + 1.86 * dryBulbC);
}

export function moistAirEnthalpyDeltaKjPerKg(
  inTempC: number,
  inRh: number,
  outTempC: number,
  outRh: number,
): number | null {
  const hIn = moistAirEnthalpyKjPerKg(inTempC, inRh);
  const hOut = moistAirEnthalpyKjPerKg(outTempC, outRh);
  if (hIn == null || hOut == null) return null;
  return hIn - hOut;
}

/** Q(kW) = ṁ × Δh ≈ ρ × V(m³/s) × Δh(kJ/kg) */
export function coolingPowerFromEnthalpyKw(
  volumeFlowM3h: number,
  enthalpyDeltaKjPerKg: number,
): number | null {
  if (volumeFlowM3h <= 0 || !Number.isFinite(enthalpyDeltaKjPerKg)) return null;
  const tehoKw = (volumeFlowM3h / 3600) * AIR_DENSITY_KG_M3 * Math.abs(enthalpyDeltaKjPerKg);
  if (!Number.isFinite(tehoKw) || tehoKw <= 0) return null;
  return tehoKw;
}

export function volumeFlowFromEnthalpyM3h(
  tehoKw: number,
  enthalpyDeltaKjPerKg: number,
): number | null {
  if (tehoKw <= 0 || Math.abs(enthalpyDeltaKjPerKg) < 0.001) return null;
  const virtausM3h = (tehoKw * 3600) / (AIR_DENSITY_KG_M3 * Math.abs(enthalpyDeltaKjPerKg));
  if (!Number.isFinite(virtausM3h) || virtausM3h <= 0) return null;
  return virtausM3h;
}
