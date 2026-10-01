/**
 * VRF-trendin akselit: siistit Y-asteikot ja aikavälin mukaan mukautuvat X-akselin aikamerkinnät
 * (suomalainen muoto, selaimen paikallinen aika).
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const WEEKDAYS_FI = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'];

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

export type NiceScale = {
  min: number;
  max: number;
  step: number;
  ticks: number[];
  decimals: number;
};

function niceStep(rough: number): number {
  if (!Number.isFinite(rough) || rough <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

/** Pienin siisti askel, jolla väliä tulee enintään targetTicks + 1. */
function pickNiceStep(lo: number, hi: number, targetTicks: number, fixedBounds: boolean): number {
  const range = hi - lo;
  const rough = range / Math.max(1, targetTicks);
  const exp = Math.floor(Math.log10(rough));
  const candidates: number[] = [];
  for (let e = exp - 1; e <= exp + 1; e += 1) {
    for (const f of e >= 1 ? [1, 2, 2.5, 5] : [1, 2, 5]) candidates.push(f * 10 ** e);
  }
  candidates.sort((a, b) => a - b);
  for (const step of candidates) {
    const intervals = fixedBounds ? range / step : Math.ceil(hi / step - 1e-9) - Math.floor(lo / step + 1e-9);
    if (intervals <= targetTicks + 1) return step;
  }
  return niceStep(rough);
}

export function decimalsForStep(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0;
  for (let d = 0; d <= 4; d += 1) {
    const scaled = step * 10 ** d;
    if (Math.abs(scaled - Math.round(scaled)) < 1e-6) return d;
  }
  return 4;
}

/**
 * Siisti asteikko: tasaväliset tikit (1/2/2,5/5 × 10^n).
 * fixedMin / fixedMax lukitsevat rajan (käsin asetettu Y-akseli).
 */
export function niceScale(
  dataMin: number,
  dataMax: number,
  targetTicks = 5,
  fixedMin?: number | null,
  fixedMax?: number | null,
): NiceScale {
  let lo = fixedMin ?? dataMin;
  let hi = fixedMax ?? dataMax;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    lo = 0;
    hi = 1;
  }
  if (hi < lo) [lo, hi] = [hi, lo];
  if (hi - lo < 1e-9) {
    const pad = Math.max(Math.abs(lo) * 0.05, 0.5);
    if (fixedMin == null) lo -= pad;
    if (fixedMax == null) hi += pad;
    if (hi - lo < 1e-9) hi = lo + 1;
  }
  const step = pickNiceStep(lo, hi, targetTicks, fixedMin != null && fixedMax != null);
  const min = fixedMin ?? Math.floor(lo / step + 1e-9) * step;
  const max = fixedMax ?? Math.ceil(hi / step - 1e-9) * step;
  const ticks: number[] = [];
  const first = Math.ceil(min / step - 1e-9) * step;
  for (let v = first; v <= max + step * 1e-6 && ticks.length < 50; v += step) {
    ticks.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toFixed(10)));
  }
  let decimals = decimalsForStep(step);
  // Käsin asetetut rajat näkyvät aina akselilla.
  for (const bound of [fixedMin, fixedMax]) {
    if (bound == null) continue;
    if (!ticks.some((t) => Math.abs(t - bound) < step * 0.35)) ticks.push(bound);
    decimals = Math.max(decimals, Math.min(2, decimalsForStep(Math.abs(bound) || 1)));
  }
  ticks.sort((a, b) => a - b);
  return { min, max, step, ticks, decimals };
}

/** Lukuarvo suomalaisittain (desimaalipilkku). */
export function formatVrfNumber(value: number, decimals: number): string {
  return value.toLocaleString('fi-FI', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatVrfValue(value: number | null | undefined, unit: string, decimals: number): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${formatVrfNumber(value, decimals)} ${unit}`;
}

export function formatClock(ms: number, withSeconds = false): string {
  const d = new Date(ms);
  const base = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return withSeconds ? `${base}:${pad2(d.getSeconds())}` : base;
}

export function formatShortDate(ms: number, withWeekday = true, withYear = false): string {
  const d = new Date(ms);
  const date = `${d.getDate()}.${d.getMonth() + 1}.${withYear ? d.getFullYear() : ''}`;
  return withWeekday ? `${WEEKDAYS_FI[d.getDay()]} ${date}` : date;
}

function sameLocalDay(a: number, b: number) {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

export type TimeTick = {
  t: number;
  /** Ylärivi: kellonaika (tai päivämäärä päiväaskelilla). */
  primary: string;
  /** Alarivi: päivämäärä kun päivä vaihtuu / ensimmäinen tikki. */
  secondary: string | null;
};

const TIME_STEPS_MS = [
  1, 2, 5, 10, 15, 30,
].map((m) => m * MINUTE).concat([1, 2, 3, 6, 12].map((h) => h * HOUR), [1, 2, 7, 14].map((d) => d * DAY));

/** Aika-akselin tikit: tasattu paikalliseen kelloon (täysi tunti, keskiyö, maanantai). */
export function buildTimeTicks(startMs: number, endMs: number, targetCount = 6): { ticks: TimeTick[]; stepMs: number } {
  const span = Math.max(endMs - startMs, 1);
  const target = Math.max(2, targetCount);
  let stepMs = TIME_STEPS_MS[TIME_STEPS_MS.length - 1];
  for (const step of TIME_STEPS_MS) {
    if (span / step <= target) {
      stepMs = step;
      break;
    }
  }

  const times: number[] = [];
  const startDate = new Date(startMs);
  if (stepMs < DAY) {
    const stepMin = stepMs / MINUTE;
    const midnight = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const minutesFromMidnight = Math.floor((startMs - midnight.getTime()) / MINUTE);
    let k = Math.max(0, Math.floor(minutesFromMidnight / stepMin) - 1);
    for (let guard = 0; guard < 500; guard += 1, k += 1) {
      const t = new Date(midnight.getFullYear(), midnight.getMonth(), midnight.getDate(), 0, k * stepMin).getTime();
      if (t > endMs) break;
      if (t >= startMs) times.push(t);
    }
  } else {
    const stepDays = stepMs / DAY;
    const first = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    if (stepDays >= 7) {
      const toMonday = (first.getDay() + 6) % 7;
      first.setDate(first.getDate() - toMonday);
    }
    for (let k = 0, guard = 0; guard < 500; guard += 1, k += stepDays) {
      const t = new Date(first.getFullYear(), first.getMonth(), first.getDate() + k).getTime();
      if (t > endMs) break;
      if (t >= startMs) times.push(t);
    }
  }

  const multiYear = new Date(startMs).getFullYear() !== new Date(endMs).getFullYear();
  const ticks: TimeTick[] = times.map((t, i) => {
    if (stepMs >= DAY) {
      return { t, primary: formatShortDate(t, stepMs < 7 * DAY, multiYear), secondary: null };
    }
    const showDate = span > 20 * HOUR && (i === 0 || !sameLocalDay(times[i - 1], t));
    return { t, primary: formatClock(t), secondary: showDate ? formatShortDate(t, true, multiYear) : null };
  });
  return { ticks, stepMs };
}

/** Kohdistimen aika: tarkka mittausaika tai aikaikkunan väli. */
export function formatTrendPointTime(t: number, tEnd: number, spanMs: number): string {
  if (tEnd > t) {
    const bucket = tEnd - t;
    if (bucket >= DAY) return `${formatShortDate(t)}–${formatShortDate(tEnd - 1, false)}`;
    const endLabel = sameLocalDay(t, tEnd - 1) ? formatClock(tEnd) : `${formatShortDate(tEnd, false)} ${formatClock(tEnd)}`;
    return `${formatShortDate(t)} ${formatClock(t)}–${endLabel}`;
  }
  const withSeconds = spanMs <= 6 * HOUR;
  return `${formatShortDate(t, true, true)} klo ${formatClock(t, withSeconds)}`;
}

/** Aikavälin otsikko, esim. "ti 29.9. 14:00 – ke 30.9. 14:00". */
export function formatTrendRangeLabel(startMs: number, endMs: number): string {
  if (sameLocalDay(startMs, endMs)) {
    return `${formatShortDate(startMs)} ${formatClock(startMs)}–${formatClock(endMs)}`;
  }
  const multiYear = new Date(startMs).getFullYear() !== new Date(endMs).getFullYear();
  return `${formatShortDate(startMs, true, multiYear)} ${formatClock(startMs)} – ${formatShortDate(endMs, true, multiYear)} ${formatClock(endMs)}`;
}

/** Tarkkuuden kuvaus käyttäjälle. */
export function describeTrendResolution(bucketMs: number): string {
  if (bucketMs <= 0) return 'jokainen mittaus';
  if (bucketMs < HOUR) return `${Math.round(bucketMs / MINUTE)} min keskiarvot`;
  if (bucketMs < DAY) return `${Math.round(bucketMs / HOUR)} h keskiarvot`;
  return `${Math.round(bucketMs / DAY)} vrk keskiarvot`;
}

export function formatSpanLabel(spanMs: number): string {
  if (spanMs < HOUR) return `${Math.round(spanMs / MINUTE)} min`;
  if (spanMs < 2 * DAY) {
    const h = spanMs / HOUR;
    return `${Number.isInteger(Math.round(h * 10) / 10) ? Math.round(h) : formatVrfNumber(h, 1)} h`;
  }
  const days = spanMs / DAY;
  const whole = Math.abs(days - Math.round(days)) < 0.05;
  return `${formatVrfNumber(days, whole || days >= 10 ? 0 : 1)} vrk`;
}

/** <input type="datetime-local"> -arvo paikallisessa ajassa. */
export function toDateTimeLocalValue(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function parseDateTimeLocalValue(value: string): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}
