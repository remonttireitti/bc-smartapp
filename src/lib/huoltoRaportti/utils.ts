// Utility functions for the HuoltoRaportti form

/** Manometripaineen (bar) ja lämpötilan (°C) piste; bar nouseva. */
type PtBarPoint = { bar: number; temp: number };

/** Yhdistää psig → manometribar (kenttämittarit). */
const PSIG_TO_BAR_GAUGE = 0.06894757293178306;

/**
 * R-410A kyllästyslämpötila vs. manometripaine (bar).
 * Lähde: yleiset R-410A °C / psig -taulukot (esim. HVAC Toolkit -tyyppiset); psig × muunnos = bar.
 * Lähes azeotrooppi → yksi käyrä riittää (tulistus ja alijäähdytys samasta P:stä kenttäkäytännössä).
 */
const R410A_SATURATION_BAR_GAUGE: PtBarPoint[] = [
  { bar: 1.5 * PSIG_TO_BAR_GAUGE, temp: -45 },
  { bar: 7.4 * PSIG_TO_BAR_GAUGE, temp: -40 },
  { bar: 14.2 * PSIG_TO_BAR_GAUGE, temp: -35 },
  { bar: 22.1 * PSIG_TO_BAR_GAUGE, temp: -30 },
  { bar: 31.1 * PSIG_TO_BAR_GAUGE, temp: -25 },
  { bar: 41.4 * PSIG_TO_BAR_GAUGE, temp: -20 },
  { bar: 53.1 * PSIG_TO_BAR_GAUGE, temp: -15 },
  { bar: 66.3 * PSIG_TO_BAR_GAUGE, temp: -10 },
  { bar: 81.1 * PSIG_TO_BAR_GAUGE, temp: -5 },
  { bar: 97.6 * PSIG_TO_BAR_GAUGE, temp: 0 },
  { bar: 116.0 * PSIG_TO_BAR_GAUGE, temp: 5 },
  { bar: 136.3 * PSIG_TO_BAR_GAUGE, temp: 10 },
  { bar: 158.7 * PSIG_TO_BAR_GAUGE, temp: 15 },
  { bar: 183.2 * PSIG_TO_BAR_GAUGE, temp: 20 },
  { bar: 210.1 * PSIG_TO_BAR_GAUGE, temp: 25 },
  { bar: 239.5 * PSIG_TO_BAR_GAUGE, temp: 30 },
  { bar: 271.4 * PSIG_TO_BAR_GAUGE, temp: 35 },
  { bar: 306.1 * PSIG_TO_BAR_GAUGE, temp: 40 },
  { bar: 343.7 * PSIG_TO_BAR_GAUGE, temp: 45 },
  { bar: 384.3 * PSIG_TO_BAR_GAUGE, temp: 50 },
];

function interpolatePtBarAscending(table: readonly PtBarPoint[], pressure: number): number {
  if (table.length === 0) return NaN;
  if (pressure <= table[0].bar) {
    if (table.length < 2) return table[0].temp;
    const p0 = table[0].bar;
    const p1 = table[1].bar;
    if (p1 === p0) return table[0].temp;
    const t0 = table[0].temp;
    const t1 = table[1].temp;
    return t0 + ((pressure - p0) / (p1 - p0)) * (t1 - t0);
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

// Returns temperature in °C for given pressure in bar (DEW point / vapor saturation)
// Paine = manometripaine bar (ei abs). Zeotrooppisilla seoksilla T_kaste > T_kupla samalla P:llä.
// Puhtailla yhdisteillä kaste ≈ kupla (yksi käyrä).
// Tulistus (SH) = T_imu − T_kaste(P_imu).
// Alijäähdytys (SC) = T_kupla(P_korkea) − T_nesteputki (getBubblePointFromPressure korkeapaineella).
export function getSaturationTempFromPressure(pressure: number, refrigerant: string): number {
  // R-410A: yksi kyllästyskäyrä (dew ≈ bubble)
  if (refrigerant === 'R-410A') {
    const t = interpolatePtBarAscending(R410A_SATURATION_BAR_GAUGE, pressure);
    return Number.isFinite(t) ? t : R410A_SATURATION_BAR_GAUGE[0].temp;
  }

  // R-134a DEW POINT — puhdas, dew = bubble
  if (refrigerant === 'R-134a') {
    const r134aData: PtBarPoint[] = [
      { bar: 0.3, temp: -37.2 },
      { bar: 0.7, temp: -31.1 },
      { bar: 1.0, temp: -26.1 },
      { bar: 2.0, temp: -15.6 },
      { bar: 3.0, temp: -8.9 },
      { bar: 5.0, temp: 1.7 },
      { bar: 7.0, temp: 9.4 },
      { bar: 10, temp: 20.0 },
      { bar: 15, temp: 30.6 },
      { bar: 20, temp: 39.4 },
      { bar: 30, temp: 54.4 },
    ];
    const t = interpolatePtBarAscending(r134aData, pressure);
    return Number.isFinite(t) ? t : r134aData[0].temp;
  }

  // R-404A DEW POINT (höyry) — zeotrooppinen
  if (refrigerant === 'R-404A') {
    const r404aData: PtBarPoint[] = [
      { bar: 0.3, temp: -55.6 },
      { bar: 0.7, temp: -49.4 },
      { bar: 1.0, temp: -45.0 },
      { bar: 2.0, temp: -33.3 },
      { bar: 3.0, temp: -24.4 },
      { bar: 5.0, temp: -10.6 },
      { bar: 7.0, temp: 1.1 },
      { bar: 10, temp: 15.6 },
      { bar: 15, temp: 29.4 },
      { bar: 20, temp: 40.6 },
      { bar: 30, temp: 59.4 },
    ];
    const t = interpolatePtBarAscending(r404aData, pressure);
    return Number.isFinite(t) ? t : r404aData[0].temp;
  }

  // R-407C DEW POINT (höyry / imulinja, tulistus) — paine bar (man), T höyryn kastepiste
  // Lähteet: R-407C höyrykäyrä (vapor/dew); 4.6 bar ≈ 6.3 °C (Testo). Ei välipisteitä jotka rikkoisivat monotonian.
  if (refrigerant === 'R-407C') {
    const r407cData: PtBarPoint[] = [
      { bar: 0.3, temp: -50.0 },
      { bar: 0.81, temp: -34.4 },
      { bar: 1.41, temp: -28.9 },
      { bar: 2.14, temp: -23.3 },
      { bar: 2.93, temp: -17.8 },
      { bar: 3.5, temp: -8.2 },
      { bar: 4.0, temp: 0.2 },
      { bar: 4.25, temp: 4.4 },
      { bar: 4.6, temp: 6.3 },
      { bar: 5.21, temp: 10.0 },
      { bar: 6.2, temp: 15.0 },
      { bar: 7.5, temp: 20.0 },
      { bar: 10, temp: 26.0 },
      { bar: 15, temp: 35.0 },
      { bar: 20, temp: 43.0 },
      { bar: 30, temp: 61.0 },
    ];
    const t = interpolatePtBarAscending(r407cData, pressure);
    return Number.isFinite(t) ? t : r407cData[0].temp;
  }

  // R-407F DEW POINT (höyry) — sama rakenne kuin R-407C (R-407F ei ole lomakkeissa)
  if (refrigerant === 'R-407F') {
    const r407fData: PtBarPoint[] = [
      { bar: 0.3, temp: -50.0 },
      { bar: 0.81, temp: -34.4 },
      { bar: 1.41, temp: -28.9 },
      { bar: 2.14, temp: -23.3 },
      { bar: 2.93, temp: -17.8 },
      { bar: 3.5, temp: -8.2 },
      { bar: 4.0, temp: 0.2 },
      { bar: 4.25, temp: 4.4 },
      { bar: 4.6, temp: 6.3 },
      { bar: 5.21, temp: 10.0 },
      { bar: 6.2, temp: 15.0 },
      { bar: 7.5, temp: 20.0 },
      { bar: 10, temp: 26.0 },
      { bar: 15, temp: 35.0 },
      { bar: 20, temp: 43.0 },
      { bar: 30, temp: 61.0 },
    ];
    const t = interpolatePtBarAscending(r407fData, pressure);
    return Number.isFinite(t) ? t : r407fData[0].temp;
  }

  // R-32 DEW POINT — puhdas
  if (refrigerant === 'R-32') {
    const r32Data: PtBarPoint[] = [
      { bar: 0.8, temp: -40.0 },
      { bar: 1.5, temp: -30.0 },
      { bar: 2.5, temp: -20.0 },
      { bar: 4.0, temp: -10.0 },
      { bar: 6.0, temp: 0.0 },
      { bar: 8.5, temp: 10.0 },
      { bar: 12, temp: 20.0 },
      { bar: 16, temp: 30.0 },
      { bar: 22, temp: 40.0 },
      { bar: 28, temp: 50.0 },
      { bar: 40, temp: 65.0 },
    ];
    const t = interpolatePtBarAscending(r32Data, pressure);
    return Number.isFinite(t) ? t : r32Data[0].temp;
  }

  // R-290 DEW POINT — puhdas
  if (refrigerant === 'R-290') {
    const r290Data: PtBarPoint[] = [
      { bar: 0.1, temp: -43.9 },
      { bar: 0.4, temp: -35.0 },
      { bar: 0.7, temp: -28.9 },
      { bar: 1.5, temp: -18.9 },
      { bar: 2.5, temp: -10.6 },
      { bar: 4.5, temp: 0.0 },
      { bar: 7.0, temp: 10.0 },
      { bar: 10, temp: 20.0 },
      { bar: 15, temp: 30.6 },
      { bar: 20, temp: 40.0 },
      { bar: 30, temp: 56.1 },
    ];
    const t = interpolatePtBarAscending(r290Data, pressure);
    return Number.isFinite(t) ? t : r290Data[0].temp;
  }

  // Default fallback tables for other refrigerants
  const pressureBars = [0.3, 0.5, 1.0, 2.0, 3.0, 5.0, 7.0, 10.0, 15.0, 20.0, 30.0];

  const tempMap: Record<string, number[]> = {
    // Zeotrooppiset: kaste (dew) korkeampi kuin kupla — rivit vaihdettu vanhoihin kuplakäyriin
    'R-407B': [-49.4, -44.4, -38.3, -27.2, -18.3, -4.4, 6.7, 19.4, 32.8, 43.9, 62.8],
    'R-422A': [-63.9, -57.8, -44.4, -30.6, -18.9, -4.4, 6.1, 18.3, 33.9, 46.1, 65.6],
    'R-448A': [-49.4, -43.3, -33.9, -22.8, -13.3, 4.4, 18.3, 32.2, 46.7, 58.3, 73.9],
    'R-449A': [-47.8, -41.1, -36.7, -25.0, -16.7, -3.9, 6.1, 18.9, 32.8, 44.4, 63.3],
    'R-452A': [-53.3, -47.2, -42.8, -31.1, -22.2, -8.3, 2.8, 16.1, 30.0, 41.7, 60.6],
    'R-513A': [-45.0, -38.9, -30.0, -19.4, -10.6, 2.2, 12.8, 26.7, 41.1, 52.8, 70.0],
    'R-744': [-56.1, -52.2, -47.2, -40.0, -35.0, -28.3, -22.2, -14.4, -3.3, 7.2, 21.1],
    // Puhtaat / yhdiste: sama käyrä
    'R-1234yf': [-32.8, -26.7, -18.3, -8.3, 0.0, 11.7, 21.7, 34.4, 48.3, 60.0, 76.1],
    'R-22': [-45.6, -41.1, -40.0, -26.1, -17.2, -2.2, 10.6, 26.7, 39.4, 51.1, 65.0],
    'R-600a': [-40.0, -34.4, -26.1, -15.0, -8.3, 3.9, 14.4, 28.9, 45.0, 58.3, 76.1],
    'R-1270': [-58.3, -52.2, -43.3, -30.6, -21.1, -7.2, 5.0, 20.0, 38.3, 52.2, 71.1],
    'default': [-45.0, -38.3, -30.0, -18.3, -8.3, 5.6, 17.8, 32.2, 47.2, 59.4, 75.0],
  };

  const map = tempMap[refrigerant] || tempMap['default'];
  const pts: PtBarPoint[] = pressureBars.map((bar, i) => ({ bar, temp: map[i] }));
  const t = interpolatePtBarAscending(pts, pressure);
  return Number.isFinite(t) ? t : pts[0].temp;
}

// Bubble Point (nesteen kuplapiste) — paine bar (man). Zeotrooppisilla T_kupla < T_kaste samalla P:llä.
export function getBubblePointFromPressure(pressure: number, refrigerant: string): number {
  // R-410A: sama kyllästyskäyrä kuin kaste (liuku ~0.5 K → kenttä-PT käytännössä yksi viiva)
  if (refrigerant === 'R-410A') {
    const t = interpolatePtBarAscending(R410A_SATURATION_BAR_GAUGE, pressure);
    return Number.isFinite(t) ? t : R410A_SATURATION_BAR_GAUGE[0].temp;
  }

  // R-134a BUBBLE POINT — puhdas, sama kuin dew
  if (refrigerant === 'R-134a') {
    const r134aData: PtBarPoint[] = [
      { bar: 0.3, temp: -37.2 },
      { bar: 0.7, temp: -31.1 },
      { bar: 1.0, temp: -26.1 },
      { bar: 2.0, temp: -15.6 },
      { bar: 3.0, temp: -8.9 },
      { bar: 5.0, temp: 1.7 },
      { bar: 7.0, temp: 9.4 },
      { bar: 10, temp: 20.0 },
      { bar: 15, temp: 30.6 },
      { bar: 20, temp: 39.4 },
      { bar: 30, temp: 54.4 },
    ];
    const t = interpolatePtBarAscending(r134aData, pressure);
    return Number.isFinite(t) ? t : r134aData[0].temp;
  }

  // R-404A BUBBLE POINT (neste)
  if (refrigerant === 'R-404A') {
    const r404aData: PtBarPoint[] = [
      { bar: 0.3, temp: -56.1 },
      { bar: 0.7, temp: -50.0 },
      { bar: 1.0, temp: -45.6 },
      { bar: 2.0, temp: -33.9 },
      { bar: 3.0, temp: -25.0 },
      { bar: 5.0, temp: -11.1 },
      { bar: 7.0, temp: 0.6 },
      { bar: 10, temp: 15.0 },
      { bar: 15, temp: 28.9 },
      { bar: 20, temp: 40.0 },
      { bar: 30, temp: 58.9 },
    ];
    const t = interpolatePtBarAscending(r404aData, pressure);
    return Number.isFinite(t) ? t : r404aData[0].temp;
  }

  // R-407C BUBBLE POINT (neste / alijäähdytys) — paine bar (man), T nesteen kuplapiste (alempi kuin dew samalla P:llä)
  if (refrigerant === 'R-407C') {
    const r407cData: PtBarPoint[] = [
      { bar: 0.3, temp: -51.0 },
      { bar: 0.7, temp: -44.0 },
      { bar: 1.0, temp: -39.5 },
      { bar: 2.0, temp: -28.5 },
      { bar: 3.0, temp: -20.0 },
      { bar: 3.5, temp: -14.0 },
      { bar: 4.0, temp: -8.0 },
      { bar: 4.6, temp: -0.7 },
      { bar: 4.72, temp: 0.0 },
      { bar: 6.14, temp: 10.0 },
      { bar: 7.5, temp: 16.0 },
      { bar: 10, temp: 24.0 },
      { bar: 15, temp: 33.0 },
      { bar: 20, temp: 41.5 },
      { bar: 30, temp: 59.0 },
    ];
    const t = interpolatePtBarAscending(r407cData, pressure);
    return Number.isFinite(t) ? t : r407cData[0].temp;
  }

  // R-407F BUBBLE POINT (neste) — R-407C:n kuplakäyrä (vastaava liuku)
  if (refrigerant === 'R-407F') {
    const r407fData: PtBarPoint[] = [
      { bar: 0.3, temp: -51.0 },
      { bar: 0.7, temp: -44.0 },
      { bar: 1.0, temp: -39.5 },
      { bar: 2.0, temp: -28.5 },
      { bar: 3.0, temp: -20.0 },
      { bar: 3.5, temp: -14.0 },
      { bar: 4.0, temp: -8.0 },
      { bar: 4.6, temp: -0.7 },
      { bar: 4.72, temp: 0.0 },
      { bar: 6.14, temp: 10.0 },
      { bar: 7.5, temp: 16.0 },
      { bar: 10, temp: 24.0 },
      { bar: 15, temp: 33.0 },
      { bar: 20, temp: 41.5 },
      { bar: 30, temp: 59.0 },
    ];
    const t = interpolatePtBarAscending(r407fData, pressure);
    return Number.isFinite(t) ? t : r407fData[0].temp;
  }

  // R-417A (ISCEON 59) BUBBLE POINT - from A-Gas chart
  if (refrigerant === 'R-417A' || refrigerant === 'ISCEON 59') {
    const r417aData: PtBarPoint[] = [
      { bar: 0.3, temp: -45.0 },
      { bar: 0.7, temp: -38.3 },
      { bar: 1.0, temp: -33.9 },
      { bar: 2.0, temp: -22.8 },
      { bar: 3.0, temp: -14.4 },
      { bar: 5.0, temp: -1.1 },
      { bar: 7.0, temp: 9.4 },
      { bar: 10, temp: 22.2 },
      { bar: 15, temp: 36.1 },
      { bar: 20, temp: 47.8 },
      { bar: 30, temp: 66.7 },
    ];
    const t = interpolatePtBarAscending(r417aData, pressure);
    return Number.isFinite(t) ? t : r417aData[0].temp;
  }

  // R-32 BUBBLE POINT — puhdas
  if (refrigerant === 'R-32') {
    const r32Data: PtBarPoint[] = [
      { bar: 0.8, temp: -40.0 },
      { bar: 1.5, temp: -30.0 },
      { bar: 2.5, temp: -20.0 },
      { bar: 4.0, temp: -10.0 },
      { bar: 6.0, temp: 0.0 },
      { bar: 8.5, temp: 10.0 },
      { bar: 12, temp: 20.0 },
      { bar: 16, temp: 30.0 },
      { bar: 22, temp: 40.0 },
      { bar: 28, temp: 50.0 },
      { bar: 40, temp: 65.0 },
    ];
    const t = interpolatePtBarAscending(r32Data, pressure);
    return Number.isFinite(t) ? t : r32Data[0].temp;
  }

  // R-290 BUBBLE POINT — puhdas
  if (refrigerant === 'R-290') {
    const r290Data: PtBarPoint[] = [
      { bar: 0.1, temp: -43.9 },
      { bar: 0.4, temp: -35.0 },
      { bar: 0.7, temp: -28.9 },
      { bar: 1.5, temp: -18.9 },
      { bar: 2.5, temp: -10.6 },
      { bar: 4.5, temp: 0.0 },
      { bar: 7.0, temp: 10.0 },
      { bar: 10, temp: 20.0 },
      { bar: 15, temp: 30.6 },
      { bar: 20, temp: 40.0 },
      { bar: 30, temp: 56.1 },
    ];
    const t = interpolatePtBarAscending(r290Data, pressure);
    return Number.isFinite(t) ? t : r290Data[0].temp;
  }

  // Default fallback tables for other refrigerants
  const pressureBars = [0.3, 0.5, 1.0, 2.0, 3.0, 5.0, 7.0, 10.0, 15.0, 20.0, 30.0];

  const tempMap: Record<string, number[]> = {
    'R-407B': [-50.0, -45.0, -38.9, -27.8, -18.9, -5.0, 6.1, 18.9, 32.2, 43.3, 62.2],
    'R-422A': [-64.4, -58.3, -44.4, -30.6, -18.9, -4.4, 6.1, 18.3, 33.9, 46.1, 65.6],
    'R-448A': [-50.0, -43.9, -34.4, -23.3, -13.9, 4.4, 17.8, 31.7, 46.1, 57.8, 73.9],
    'R-449A': [-48.9, -42.8, -33.3, -22.2, -12.8, 5.0, 18.3, 32.2, 46.7, 58.3, 74.4],
    'R-452A': [-53.9, -47.8, -38.9, -26.1, -16.7, -1.1, 11.1, 25.0, 40.0, 52.2, 70.0],
    'R-513A': [-45.0, -38.9, -30.0, -19.4, -10.6, 2.2, 12.8, 26.7, 41.1, 52.8, 70.0],
    'R-744': [-56.1, -52.2, -47.2, -40.0, -35.0, -28.3, -22.2, -14.4, -3.3, 7.2, 21.1],
    'R-1234yf': [-32.8, -26.7, -18.3, -8.3, 0.0, 11.7, 21.7, 34.4, 48.3, 60.0, 76.1],
    'R-22': [-45.6, -41.1, -40.0, -26.1, -17.2, -2.2, 10.6, 26.7, 39.4, 51.1, 65.0],
    'R-600a': [-40.0, -34.4, -26.1, -15.0, -8.3, 3.9, 14.4, 28.9, 45.0, 58.3, 76.1],
    'R-1270': [-58.3, -52.2, -43.3, -30.6, -21.1, -7.2, 5.0, 20.0, 38.3, 52.2, 71.1],
    'default': [-45.0, -38.3, -30.0, -18.3, -8.3, 5.6, 17.8, 32.2, 47.2, 59.4, 75.0],
  };

  const map = tempMap[refrigerant] || tempMap['default'];
  const pts: PtBarPoint[] = pressureBars.map((bar, i) => ({ bar, temp: map[i] }));
  const t = interpolatePtBarAscending(pts, pressure);
  return Number.isFinite(t) ? t : pts[0].temp;
}

/** Tulistus (K) = imukaasun lämpötila − kastelämpötila imupaineella (manometribar). */
export function calculateSuperheatFromMeasurements(
  suctionPressureBar: number,
  suctionTempC: number,
  refrigerant: string
): number | null {
  if (!(suctionPressureBar > 0) || !Number.isFinite(suctionTempC)) return null;
  const tDew = getSaturationTempFromPressure(suctionPressureBar, refrigerant);
  if (!Number.isFinite(tDew)) return null;
  return suctionTempC - tDew;
}

/**
 * Alijäähdytys (K) = kuplalämpötila korkeapaineella (manometribar) − nesteputken lämpötila.
 * Oletus: nesteputken paine ≈ korkeapaineen lukema (ei erillistä painehäviölukemaa).
 */
export function calculateSubcoolingFromMeasurements(
  highSidePressureBar: number,
  liquidLineTempC: number,
  refrigerant: string
): number | null {
  if (!(highSidePressureBar > 0) || !Number.isFinite(liquidLineTempC)) return null;
  const tBubble = getBubblePointFromPressure(highSidePressureBar, refrigerant);
  if (!Number.isFinite(tBubble)) return null;
  return tBubble - liquidLineTempC;
}

// Helper function to get specific heat capacity from fluid name
export function getSpecificHeatCapacity(fluidName: string): number {
  const fluidMap: Record<string, number> = {
    'vesi': 4.18,
    'naturet': 3.8,
    'etanoli 20%': 3.6,
    'etanoli 30%': 3.4,
    'etanoli 40%': 3.2,
    'etanoli 50%': 3.0,
    'propyleeniglykoli 20%': 3.4,
    'propyleeniglykoli 30%': 3.2,
    'propyleeniglykoli 40%': 3.0,
  };
  
  // Try to match fluid name (case insensitive, partial match)
  const lowerName = (fluidName || '').toLowerCase();
  for (const [key, value] of Object.entries(fluidMap)) {
    if (lowerName.includes(key)) {
      return value;
    }
  }
  
  // If fluidName is already a numeric value string, parse it
  const numericValue = parseFloat(fluidName);
  if (!isNaN(numericValue) && numericValue > 0) {
    return numericValue;
  }
  
  return 0;
}

// Helper function to render checkbox with label for print
/** true = Kyllä ✓, false = Ei ✗, undefined = ei tulosteta (kenttää ei ole täytetty) */
export function renderCheckbox(val: boolean | undefined, label: string = ''): string {
  if (val === true) {
    return '<span style="color: #16a34a; font-weight: bold;">Kyllä ✓' + (label ? ' ' + label : '') + '</span>';
  }
  if (val === false) {
    return '<span style="color: #dc2626; font-weight: bold;">Ei ✗' + (label ? ' ' + label : '') + '</span>';
  }
  return '';
}

// Calculate phase imbalance percentage
export function calculatePhaseImbalance(virtaL1: number, virtaL2: number, virtaL3: number): number {
  if (virtaL1 === 0 && virtaL2 === 0 && virtaL3 === 0) return 0;
  
  const avgVirta = (virtaL1 + virtaL2 + virtaL3) / 3;
  if (avgVirta === 0) return 0;
  
  const deviations = [Math.abs(virtaL1 - avgVirta), Math.abs(virtaL2 - avgVirta), Math.abs(virtaL3 - avgVirta)];
  return (Math.max(...deviations) / avgVirta) * 100;
}

// Get phase imbalance severity level
export function getPhaseImbalanceSeverity(imbalance: number): 'normal' | 'warning' | 'danger' {
  if (imbalance > 10) return 'danger';
  if (imbalance > 5) return 'warning';
  return 'normal';
}

// Calculate power from current (kW)
export function calculatePowerFromCurrent(virta1vaihe: number): number {
  return 0.23 * virta1vaihe;
}

export function calculateThreePhasePower(virtaL1: number, virtaL2: number, virtaL3: number): number {
  const avgVirta = (virtaL1 + virtaL2 + virtaL3) / 3;
  return 0.591 * avgVirta;
}

// Calculate flow rate in m³/h from l/s
export function convertLsToM3h(virtausLS: number): number {
  return virtausLS * 3.6;
}

// Calculate temperature difference
export function calculateDeltaT(meno: number, tulo: number): number {
  return Math.abs(meno - tulo);
}

// Calculate heating/cooling power (kW) = 1.163 × flow (m³/h) × ΔT (°C)
export function calculatePower(flowM3h: number, deltaT: number): number {
  return 1.163 * flowM3h * deltaT;
}

// Calculate power with specific heat capacity (kW) = c × flow (l/s) × ΔT
export function calculatePowerWithSpecificHeat(flowLS: number, deltaT: number, c: number): number {
  return c * flowLS * deltaT;
}

// Calculate COP
export function calculateCOP(outputPower: number, inputPower: number): number {
  if (inputPower <= 0) return 0;
  return outputPower / inputPower;
}

// Get COP efficiency rating
export function getCOPEfficiencyRating(cop: number): string {
  if (cop >= 5) return 'Erinomainen';
  if (cop >= 3.5) return 'Hyvä';
  if (cop >= 2.5) return 'Tyydyttävä';
  if (cop > 0) return 'Heikko';
  return 'Ei voida laskea';
}

// Get COP efficiency color
export function getCOPColor(cop: number): { bg: string; border: string; text: string } {
  if (cop >= 5) {
    return { bg: '#e8f5e9', border: '#4caf50', text: '#2e7d32' };
  }
  if (cop >= 3.5) {
    return { bg: '#fffde7', border: '#ffc107', text: '#f9a825' };
  }
  if (cop >= 2.5) {
    return { bg: '#fff3e0', border: '#ff9800', text: '#e65100' };
  }
  return { bg: '#ffebee', border: '#f44336', text: '#c62828' };
}

// Calculate CO2 equivalent in tonnes (t CO₂e) from refrigerant amount (kg) and GWP
export function calculateCO2Ekv(amountKg: number, gwp: number): number {
  return (amountKg * gwp) / 1000;
}

/** Yksi kylmäaine-kenttä: tyyppi (valinta) ja vanha "laatu" olivat sama tieto. */
export function resolveKylmaaineTyyppi(
  tyyppi?: string | null,
  laatu?: string | null,
): string {
  return String(tyyppi ?? '').trim() || String(laatu ?? '').trim();
}

// Get refrigerant GWP value
export function getRefrigerantGWP(refrigerantType: string): number {
  const gwpMap: Record<string, number> = {
    'R-134a': 1430,
    'R-404A': 3922,
    'R-407C': 1774,
    'R-410A': 2088,
    'R-448A': 1387,
    'R-449A': 1282,
    'R-452A': 2140,
    'R-744': 1,
    'R-1234yf': 4,
    'R-32': 675,
    'R-290': 3,
    'R-600a': 3,
  };
  return gwpMap[refrigerantType] ?? 0;
}

// Format number with given decimals
export function formatNumber(value: number, decimals: number = 2): string {
  return value.toFixed(decimals);
}

// Get current date in Finnish format
export function getCurrentDateFi(): string {
  const today = new Date();
  return today.toLocaleDateString('fi-FI');
}

// Validate email format
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Validate Finnish business ID (ytunnus)
export function isValidBusinessId(ytunnus: string): boolean {
  // Finnish business ID format: 8 digits with a hyphen (1234567-8)
  const businessIdRegex = /^\d{7}-\d$/;
  if (!businessIdRegex.test(ytunnus)) return false;
  
  // Calculate check digit
  const base = ytunnus.replace('-', '');
  const checkDigit = parseInt(ytunnus.charAt(8));
  const remainder = parseInt(base) % 11;
  const calculatedCheck = remainder === 0 ? 0 : 11 - remainder;
  
  return checkDigit === calculatedCheck;
}

// Generate unique ID
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}
