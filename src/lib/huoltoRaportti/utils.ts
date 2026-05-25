// Utility functions for the HuoltoRaportti form

import {
  getBubblePointFromPressure,
  getSaturationTempFromPressure,
} from './refrigerantPt';

export {
  getSaturationTempFromPressure,
  getBubblePointFromPressure,
  hasRefrigerantPtData,
  isRefrigerantPtApproximate,
  getCo2PtLimitBarGauge,
} from './refrigerantPt';

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

/** Huoltotiedot: kylmäaine-/vuototarkastus (ei sama kuin mlp.kylmaaineVuotoja). */
export function renderVuototarkastusStatus(checked: boolean | undefined): string {
  if (checked === true) {
    return '<span style="color:#16a34a;font-weight:bold;">Vuototarkastus suoritettu, ei vuotoja ✓</span>';
  }
  if (checked === false) {
    return '<span style="color:#dc2626;font-weight:bold;">Ei tarkastettu tai vuotoja ✗</span>';
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
