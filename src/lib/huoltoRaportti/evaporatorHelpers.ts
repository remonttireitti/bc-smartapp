import type { EvaporatorData, EvaporatorType, HuoltoReportData } from './types';
import { isChillerLikeDevice, isSharedEvaporatorAcrossCircuits, isWaterCooledChiller } from './deviceModuleLogic';

/** Vedenjäähdytyskone / VAK: levy- tai putkilämmönvaihdin (ei puhaltimia eikä sulatusta). */
export function isHeatExchangerEvaporatorType(tyyppi: EvaporatorType | string | undefined): boolean {
  return tyyppi === 'levy' || tyyppi === 'putki';
}

export function evaporatorShowsFansAndDefrost(tyyppi: EvaporatorType | string | undefined): boolean {
  return tyyppi === 'puhallin' || tyyppi === 'staatinen' || tyyppi === 'suorahoyrystin';
}

export function defaultEvaporatorTypeForDevice(laiteTyyppi: string): EvaporatorType {
  return isChillerLikeDevice(laiteTyyppi) ? 'levy' : 'staatinen';
}

export function evapTyyppiLabel(value: string | undefined): string {
  if (value === 'puhallin') return 'Puhallinhöyrystin';
  if (value === 'staatinen') return 'Staattinen höyrystin';
  if (value === 'levy') return 'Levy lämmönvaihdin';
  if (value === 'putki') return 'Putkilämmönvaihdin';
  if (value === 'suorahoyrystin') return 'Suorahöyrystin';
  return value?.trim() || '—';
}

/** Kylmiö: käyttäjän ilmoittama höyrystimien määrä (tyhjä = vanha päättely). */
export function kylmioExplicitCount(laiteTyyppi: string, value: unknown): number | null {
  if (laiteTyyppi !== 'pakastin' && laiteTyyppi !== 'kylmäkoneikko') return null;
  const n = parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(10, n) : null;
}

/** Kylmiö: lauhduttimien määrä kysytään vain erillisellä ilmalauhduttimella. */
export function getCondenserCount(form: Pick<HuoltoReportData, 'laiteTyyppi' | 'kylmaainePiireja'> & { lauhduttimienMaara?: unknown; lauhdutinTyyppiLaite?: unknown }): number {
  const explicit = form.lauhdutinTyyppiLaite === 'erillinen_ilma' ? kylmioExplicitCount(form.laiteTyyppi, form.lauhduttimienMaara) : null;
  return explicit ?? Math.min(3, Math.max(1, parseInt(form.kylmaainePiireja, 10) || 1));
}

const MAX_EVAPORATORS = 10;

function kylmioCircuitCount(form: Pick<HuoltoReportData, 'kylmaainePiireja'>): number {
  return Math.min(3, Math.max(1, parseInt(form.kylmaainePiireja, 10) || 1));
}

function parseCircuitCounts(value: unknown): number[] | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parts = value.split(',').map((x) => parseInt(x.trim(), 10));
  return parts.some((n) => !Number.isFinite(n)) ? null : parts.map((n) => Math.max(0, Math.min(MAX_EVAPORATORS, n)));
}

/** Vanha (yksi kokonaismäärä) → piireittäin: ylimääräiset höyrystimet piirille 1, muille 1 kpl niin pitkälle kuin määrä riittää. */
export function splitEvaporatorTotal(total: number, circuits: number): number[] {
  const first = circuits <= 1 ? total : Math.max(1, total - (circuits - 1));
  const out = [first];
  let rest = total - first;
  for (let i = 1; i < circuits; i += 1) {
    out.push(rest > 0 ? 1 : 0);
    rest -= 1;
  }
  return out;
}

/**
 * Kylmiö: höyrystimien määrä kylmäainepiireittäin. Tallennettu `hoyrystimetPiireittain` voittaa;
 * vanhoissa raporteissa/laitekorteissa on vain kokonaismäärä (`hoyrystimienMaara`) → jaetaan piireille.
 */
export function kylmioEvaporatorCircuitCounts(
  form: Pick<HuoltoReportData, 'laiteTyyppi' | 'kylmaainePiireja' | 'hoyrystimienMaara' | 'evaporatorData'> & { hoyrystimetPiireittain?: string },
): number[] {
  const circuits = kylmioCircuitCount(form);
  const stored = parseCircuitCounts(form.hoyrystimetPiireittain);
  if (stored) {
    const out = Array.from({ length: circuits }, (_, i) => stored[i] ?? (i === 0 ? 1 : 0));
    out[0] = Math.max(1, out[0]);
    return out;
  }
  const explicit = kylmioExplicitCount(form.laiteTyyppi, form.hoyrystimienMaara);
  const total = explicit ?? (form.laiteTyyppi === 'kylmäkoneikko' ? Math.max(1, form.evaporatorData.length) : circuits);
  return splitEvaporatorTotal(total, circuits);
}

/** Höyrystimen kuuluminen kylmäainepiiriin: (piiri 0-pohjaisena, järjestysnumero piirissä 1-pohjaisena, piirin höyrystimien määrä). */
export function kylmioEvaporatorPosition(
  counts: number[],
  index: number,
): { circuit: number; nth: number; inCircuit: number } {
  let start = 0;
  for (let c = 0; c < counts.length; c += 1) {
    if (index < start + counts[c]) return { circuit: c, nth: index - start + 1, inCircuit: counts[c] };
    start += counts[c];
  }
  return { circuit: Math.max(0, counts.length - 1), nth: 1, inCircuit: 1 };
}

/** Kylmiön höyrystimen otsikko: usealla piirillä "Piiri 2 — Höyrystin 1", yhdellä "Höyrystin 2" (tai pelkkä "Höyrystin"). */
export function kylmioEvaporatorTitle(form: HuoltoReportData, index: number): string {
  const counts = kylmioEvaporatorCircuitCounts(form);
  const total = counts.reduce((a, b) => a + b, 0);
  if (counts.length > 1) {
    const pos = kylmioEvaporatorPosition(counts, index);
    return `Piiri ${pos.circuit + 1} — Höyrystin${pos.inCircuit > 1 ? ` ${pos.nth}` : ''}`;
  }
  return total > 1 ? `Höyrystin ${index + 1}` : 'Höyrystin';
}

export function getEvaporatorCircuitCount(form: HuoltoReportData): number {
  if (form.laiteTyyppi === 'pakastin' || form.laiteTyyppi === 'kylmäkoneikko') {
    if (parseCircuitCounts(form.hoyrystimetPiireittain)) {
      return Math.min(MAX_EVAPORATORS, kylmioEvaporatorCircuitCounts(form).reduce((a, b) => a + b, 0));
    }
  }
  const explicit = kylmioExplicitCount(form.laiteTyyppi, form.hoyrystimienMaara);
  if (explicit != null) return explicit;
  if (form.laiteTyyppi === 'kylmäkoneikko') return form.evaporatorData.length;
  if (isSharedEvaporatorAcrossCircuits(form.laiteTyyppi, form.hoyrystinYhteinenPiireissa)) {
    return 1;
  }
  return Math.min(3, Math.max(1, parseInt(form.kylmaainePiireja, 10) || 1));
}

export function evaporatorSnapshotRowIsMeaningful(ev: {
  valmistaja?: string;
  malli?: string;
  sarjanumero?: string;
  tyyppi?: string;
  huoneenTunnus?: string;
}): boolean {
  const t = String(ev.tyyppi ?? '').trim();
  if (isHeatExchangerEvaporatorType(t)) return true;
  const nonEmpty = (s?: string) => String(s ?? '').trim().length > 0;
  return (
    nonEmpty(ev.valmistaja) ||
    nonEmpty(ev.malli) ||
    nonEmpty(ev.sarjanumero) ||
    nonEmpty(ev.huoneenTunnus) ||
    (t !== '' && t !== 'staatinen')
  );
}

export function normalizeEvaporatorForDevice(
  ev: EvaporatorData,
  laiteTyyppi: string,
): EvaporatorData {
  if (!isChillerLikeDevice(laiteTyyppi)) return ev;
  if (isHeatExchangerEvaporatorType(ev.tyyppi) || ev.tyyppi === 'suorahoyrystin') {
    if (isWaterCooledChiller(laiteTyyppi) && ev.tyyppi === 'suorahoyrystin') {
      return { ...ev, tyyppi: defaultEvaporatorTypeForDevice(laiteTyyppi), puhaltimienMaara: 0, puhaltimet: [] };
    }
    return ev;
  }
  return {
    ...ev,
    tyyppi: defaultEvaporatorTypeForDevice(laiteTyyppi),
    puhaltimienMaara: 0,
    puhaltimet: [],
  };
}
