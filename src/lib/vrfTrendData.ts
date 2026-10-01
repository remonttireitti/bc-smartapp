/**
 * VRF-trendin datamalli: raakamittaukset → kevyet trendipisteet → aikaikkunakoosteet.
 * Puhdasta logiikkaa (ei Supabasea / Reactia), jotta sitä voi testata scripts/test-vrf-trend-data.mjs:llä.
 */
import {
  VRF_DEFROST_SUPPRESS_AFTER_PERMIT_ON_MS,
  VRF_TREND_SERIES,
  VrfDefrostTracker,
  vrfActivityStateFromSignals,
  vrfReadingSignals,
  type VrfActivityTrendState,
  type VrfBinaryLaneKey,
  type VrfReading,
  type VrfTrendSeriesKey,
} from './vrfMonitoring';
import type { VrfStateCounters } from './vrfStateCounters';

export type VrfTrendSignalKey = VrfTrendSeriesKey | 'refrigerant_delta_k';

export type VrfTrendSignal = {
  key: VrfTrendSignalKey;
  label: string;
  color: string;
  unit: string;
  decimals: number;
};

/** Trendin viivat yksiköineen. Eri yksiköt saavat oman Y-akselin. */
export const VRF_TREND_SIGNALS: VrfTrendSignal[] = [
  ...VRF_TREND_SERIES.map((series) => ({ ...series, unit: '°C', decimals: 1 })),
  { key: 'refrigerant_delta_k', label: 'Meno–paluu-ero', color: '#db2777', unit: 'K', decimals: 1 },
];

export const VRF_TREND_SIGNAL_KEYS = VRF_TREND_SIGNALS.map((s) => s.key);

export const VRF_TREND_LANE_KEYS: VrfBinaryLaneKey[] = ['control', 'compressor', 'defrost', 'alarm', 'unit_ready'];

export const VRF_ACTIVITY_STATES: VrfActivityTrendState[] = [
  'heating',
  'standby',
  'defrost',
  'off',
  'shutdown_wait',
  'alarm',
  'unknown',
];

export type VrfTrendPoint = {
  /** Mittausaika tai aikaikkunan alku (ms). */
  t: number;
  /** Aikaikkunan loppu (raakapisteellä = t). */
  tEnd: number;
  /** Montako mittausta pisteeseen sisältyy. */
  samples: number;
  /** Arvo (aikaikkunassa keskiarvo). */
  values: Partial<Record<VrfTrendSignalKey, number>>;
  /** Aikaikkunan min/max — null raakapisteillä. */
  mins: Partial<Record<VrfTrendSignalKey, number>> | null;
  maxs: Partial<Record<VrfTrendSignalKey, number>> | null;
  /** Tilaviivat 0…1 (raakapisteellä 0 tai 1, aikaikkunassa osuus mittauksista). */
  lanes: Record<VrfBinaryLaneKey, number>;
  state: VrfActivityTrendState;
};

export type VrfTrendSource = 'raw' | 'server' | 'client';

export type VrfTrendData = {
  startMs: number;
  endMs: number;
  /** 0 = jokainen mittaus, muuten aikaikkunan pituus. */
  bucketMs: number;
  points: VrfTrendPoint[];
  /** Mittausten määrä yhteensä (aikaikkunoissa summa). */
  sampleCount: number;
  source: VrfTrendSource;
  /**
   * Tilalaskurit täsmälleen väliltä startMs–endMs, kun ne saatiin samasta raakadatavirrasta
   * (selaimessa koottu pitkä väli ilman vrf_state_counters-funktiota).
   */
  counters?: VrfStateCounters | null;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Tätä lyhyemmät välit näytetään jokaisena mittauksena (≈1 mittaus / min → ≤ ~2200 pistettä). */
export const VRF_TREND_RAW_MAX_SPAN_MS = 36 * HOUR;
/** Pisteitä per viiva enintään (pidemmät välit kootaan aikaikkunoiksi). */
export const VRF_TREND_TARGET_POINTS = 720;
/** Pisin valittava aikaväli. */
export const VRF_TREND_MAX_SPAN_MS = 90 * DAY;
/** Yli tämän mittaustauko katkaisee viivan ja nollaa sulatusarvion kontekstin. */
export const VRF_TREND_CONTEXT_GAP_MS = 15 * MINUTE;

const BUCKET_STEPS_MS = [1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440].map((m) => m * MINUTE);

/** Valitse aikaikkunan pituus aikavälin mukaan (0 = raakadata). */
export function chooseVrfTrendBucketMs(spanMs: number, targetPoints = VRF_TREND_TARGET_POINTS): number {
  if (spanMs <= VRF_TREND_RAW_MAX_SPAN_MS) return 0;
  for (const step of BUCKET_STEPS_MS) {
    if (spanMs / step <= targetPoints) return step;
  }
  return BUCKET_STEPS_MS[BUCKET_STEPS_MS.length - 1];
}

/** Aikaikkunan alku — epoch-tasattu, sama kuin SQL-funktiossa vrf_trend_buckets. */
export function vrfBucketStart(timeMs: number, bucketMs: number): number {
  return Math.floor(timeMs / bucketMs) * bucketMs;
}

function emptyLanes(): Record<VrfBinaryLaneKey, number> {
  return { control: 0, compressor: 0, defrost: 0, alarm: 0, unit_ready: 0 };
}

/** Raakamittaukset → trendipisteet, yksi kerrallaan (virtana, O(n)). */
export class VrfTrendPointBuilder {
  private tracker = new VrfDefrostTracker();
  private lastT: number | null = null;

  push(reading: VrfReading): VrfTrendPoint | null {
    const signals = vrfReadingSignals(reading);
    const t = signals.timeMs;
    if (!Number.isFinite(t)) return null;
    if (this.lastT != null && t - this.lastT > VRF_TREND_CONTEXT_GAP_MS) this.tracker.reset();
    this.lastT = t;

    const temps = signals.telemetry?.temperatures ?? {};
    const values: Partial<Record<VrfTrendSignalKey, number>> = {};
    for (const series of VRF_TREND_SERIES) {
      const v = temps[series.key];
      if (v != null && Number.isFinite(v)) values[series.key] = v;
    }
    if (values.refrigerant_supply_c != null && values.refrigerant_return_c != null) {
      values.refrigerant_delta_k = values.refrigerant_supply_c - values.refrigerant_return_c;
    }

    const defrost = this.tracker.push({
      timeMs: t,
      permit: signals.permit,
      compressor: signals.compressor,
      firmwareDefrost: signals.firmwareDefrost,
      coil: temps.outdoor_coil_c ?? null,
      supply: temps.refrigerant_supply_c ?? null,
      outdoor: temps.outdoor_c ?? null,
    });

    return {
      t,
      tEnd: t,
      samples: 1,
      values,
      mins: null,
      maxs: null,
      lanes: {
        control: signals.permit ? 1 : 0,
        compressor: signals.compressor ? 1 : 0,
        defrost: defrost ? 1 : 0,
        alarm: signals.externalAlarm ? 1 : 0,
        unit_ready: signals.unitReady ? 1 : 0,
      },
      state: vrfActivityStateFromSignals(signals, defrost),
    };
  }
}

/** Mittaukset (aikajärjestyksessä) → trendipisteet. */
export function buildVrfTrendPoints(readings: VrfReading[]): VrfTrendPoint[] {
  const builder = new VrfTrendPointBuilder();
  const out: VrfTrendPoint[] = [];
  for (const reading of readings) {
    const point = builder.push(reading);
    if (point) out.push(point);
  }
  return out;
}

export type VrfActivityStateCounts = Record<VrfActivityTrendState, number>;

export function emptyActivityCounts(): VrfActivityStateCounts {
  return { heating: 0, standby: 0, defrost: 0, off: 0, shutdown_wait: 0, alarm: 0, unknown: 0 };
}

/**
 * Aikaikkunan tila: hälytysviive / hälytys näkyy aina jos sitä esiintyi,
 * muuten yleisin tila (lyhyet sulatukset näkyvät tilaviivoilla osuutena).
 */
export function resolveBucketActivityState(counts: VrfActivityStateCounts): VrfActivityTrendState {
  if (counts.shutdown_wait > 0) return 'shutdown_wait';
  if (counts.alarm > 0) return 'alarm';
  const order: VrfActivityTrendState[] = ['heating', 'standby', 'defrost', 'off'];
  let best: VrfActivityTrendState = 'unknown';
  let bestCount = 0;
  for (const state of order) {
    if (counts[state] > bestCount) {
      best = state;
      bestCount = counts[state];
    }
  }
  return best;
}

type BucketAcc = {
  t: number;
  samples: number;
  sums: Partial<Record<VrfTrendSignalKey, number>>;
  counts: Partial<Record<VrfTrendSignalKey, number>>;
  mins: Partial<Record<VrfTrendSignalKey, number>>;
  maxs: Partial<Record<VrfTrendSignalKey, number>>;
  laneOn: Record<VrfBinaryLaneKey, number>;
  states: VrfActivityStateCounts;
};

function newAcc(t: number): BucketAcc {
  return { t, samples: 0, sums: {}, counts: {}, mins: {}, maxs: {}, laneOn: emptyLanes(), states: emptyActivityCounts() };
}

function accToPoint(acc: BucketAcc, bucketMs: number): VrfTrendPoint {
  const values: Partial<Record<VrfTrendSignalKey, number>> = {};
  for (const key of VRF_TREND_SIGNAL_KEYS) {
    const n = acc.counts[key];
    if (n) values[key] = (acc.sums[key] ?? 0) / n;
  }
  const lanes = emptyLanes();
  for (const key of VRF_TREND_LANE_KEYS) lanes[key] = acc.samples > 0 ? acc.laneOn[key] / acc.samples : 0;
  return {
    t: acc.t,
    tEnd: acc.t + bucketMs,
    samples: acc.samples,
    values,
    mins: acc.mins,
    maxs: acc.maxs,
    lanes,
    state: resolveBucketActivityState(acc.states),
  };
}

/** Kokoaa raakapisteet aikaikkunoihin virtana (pisteiden on tultava aikajärjestyksessä). */
export class VrfTrendBucketAccumulator {
  private current: BucketAcc | null = null;
  readonly points: VrfTrendPoint[] = [];
  sampleCount = 0;

  constructor(private readonly bucketMs: number) {}

  push(point: VrfTrendPoint) {
    const start = vrfBucketStart(point.t, this.bucketMs);
    if (!this.current || this.current.t !== start) {
      if (this.current) this.points.push(accToPoint(this.current, this.bucketMs));
      this.current = newAcc(start);
    }
    const acc = this.current;
    acc.samples += point.samples;
    this.sampleCount += point.samples;
    for (const key of VRF_TREND_SIGNAL_KEYS) {
      const v = point.values[key];
      if (v == null) continue;
      acc.sums[key] = (acc.sums[key] ?? 0) + v * point.samples;
      acc.counts[key] = (acc.counts[key] ?? 0) + point.samples;
      const lo = point.mins?.[key] ?? v;
      const hi = point.maxs?.[key] ?? v;
      acc.mins[key] = acc.mins[key] == null ? lo : Math.min(acc.mins[key]!, lo);
      acc.maxs[key] = acc.maxs[key] == null ? hi : Math.max(acc.maxs[key]!, hi);
    }
    for (const key of VRF_TREND_LANE_KEYS) acc.laneOn[key] += point.lanes[key] * point.samples;
    acc.states[point.state] += point.samples;
  }

  finish(): VrfTrendPoint[] {
    if (this.current) {
      this.points.push(accToPoint(this.current, this.bucketMs));
      this.current = null;
    }
    return this.points;
  }
}

export function bucketVrfTrendPoints(points: VrfTrendPoint[], bucketMs: number): VrfTrendPoint[] {
  if (bucketMs <= 0) return points;
  const acc = new VrfTrendBucketAccumulator(bucketMs);
  for (const point of points) acc.push(point);
  return acc.finish();
}

/** Supabase RPC vrf_trend_buckets -rivi. */
export type VrfTrendBucketRow = {
  bucket_start: string;
  samples: number;
  outdoor_avg: number | null;
  outdoor_min: number | null;
  outdoor_max: number | null;
  coil_avg: number | null;
  coil_min: number | null;
  coil_max: number | null;
  supply_avg: number | null;
  supply_min: number | null;
  supply_max: number | null;
  return_avg: number | null;
  return_min: number | null;
  return_max: number | null;
  hot_gas_avg: number | null;
  hot_gas_min: number | null;
  hot_gas_max: number | null;
  delta_avg: number | null;
  delta_min: number | null;
  delta_max: number | null;
  permit_on: number;
  compressor_on: number;
  defrost_on: number;
  alarm_on: number;
  unit_ready_on: number;
  st_heating: number;
  st_standby: number;
  st_defrost: number;
  st_off: number;
  st_shutdown_wait: number;
  st_alarm: number;
};

const ROW_SIGNAL_PREFIX: Record<VrfTrendSignalKey, string> = {
  outdoor_c: 'outdoor',
  outdoor_coil_c: 'coil',
  refrigerant_supply_c: 'supply',
  refrigerant_return_c: 'return',
  hot_gas_c: 'hot_gas',
  refrigerant_delta_k: 'delta',
};

function num(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function mapVrfTrendBucketRows(rows: VrfTrendBucketRow[], bucketMs: number): VrfTrendPoint[] {
  const out: VrfTrendPoint[] = [];
  for (const row of rows) {
    const t = new Date(row.bucket_start).getTime();
    const samples = num(row.samples) ?? 0;
    if (!Number.isFinite(t) || samples <= 0) continue;
    const values: Partial<Record<VrfTrendSignalKey, number>> = {};
    const mins: Partial<Record<VrfTrendSignalKey, number>> = {};
    const maxs: Partial<Record<VrfTrendSignalKey, number>> = {};
    const record = row as unknown as Record<string, unknown>;
    for (const key of VRF_TREND_SIGNAL_KEYS) {
      const prefix = ROW_SIGNAL_PREFIX[key];
      const avg = num(record[`${prefix}_avg`]);
      if (avg == null) continue;
      values[key] = avg;
      mins[key] = num(record[`${prefix}_min`]) ?? avg;
      maxs[key] = num(record[`${prefix}_max`]) ?? avg;
    }
    const frac = (v: unknown) => Math.min(1, Math.max(0, (num(v) ?? 0) / samples));
    const states = emptyActivityCounts();
    states.heating = num(row.st_heating) ?? 0;
    states.standby = num(row.st_standby) ?? 0;
    states.defrost = num(row.st_defrost) ?? 0;
    states.off = num(row.st_off) ?? 0;
    states.shutdown_wait = num(row.st_shutdown_wait) ?? 0;
    states.alarm = num(row.st_alarm) ?? 0;
    out.push({
      t,
      tEnd: t + bucketMs,
      samples,
      values,
      mins,
      maxs,
      lanes: {
        control: frac(row.permit_on),
        compressor: frac(row.compressor_on),
        defrost: frac(row.defrost_on),
        alarm: frac(row.alarm_on),
        unit_ready: frac(row.unit_ready_on),
      },
      state: resolveBucketActivityState(states),
    });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

/** Ensimmäinen indeksi, jonka t >= timeMs. */
export function lowerBoundPoint(points: VrfTrendPoint[], timeMs: number): number {
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (points[mid].t < timeMs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Lähin piste ajanhetkeen (binäärihaku). Aikaikkunassa osuma jos hetki on ikkunan sisällä. */
export function nearestVrfTrendPointIndex(points: VrfTrendPoint[], timeMs: number): number {
  if (points.length === 0) return -1;
  const idx = lowerBoundPoint(points, timeMs);
  if (idx <= 0) return 0;
  if (idx >= points.length) return points.length - 1;
  const prev = points[idx - 1];
  if (prev.tEnd > prev.t && timeMs < prev.tEnd) return idx - 1;
  const prevMid = (prev.t + prev.tEnd) / 2;
  const next = points[idx];
  const nextMid = (next.t + next.tEnd) / 2;
  return timeMs - prevMid <= nextMid - timeMs ? idx - 1 : idx;
}

/** Näkyvän välin pisteet + yksi kummallakin puolella viivan jatkuvuuden vuoksi. */
export function visibleVrfTrendRange(points: VrfTrendPoint[], startMs: number, endMs: number): [number, number] {
  if (points.length === 0) return [0, 0];
  let from = lowerBoundPoint(points, startMs);
  let to = lowerBoundPoint(points, endMs + 1);
  if (from > 0) from -= 1;
  if (to < points.length) to += 1;
  return [Math.max(0, from), Math.min(points.length, to)];
}

/** Raja, jota pidemmät tauot pisteiden välillä näytetään "ei tietoa" -jaksona. */
export function vrfTrendGapThresholdMs(points: VrfTrendPoint[], bucketMs: number): number {
  if (bucketMs > 0) return Math.max(bucketMs, VRF_TREND_CONTEXT_GAP_MS) + 1;
  if (points.length < 3) return VRF_TREND_CONTEXT_GAP_MS;
  const step = Math.max(1, Math.floor(points.length / 400));
  const intervals: number[] = [];
  for (let i = step; i < points.length; i += step) intervals.push((points[i].t - points[i - step].t) / step);
  intervals.sort((a, b) => a - b);
  const median = intervals[Math.floor(intervals.length / 2)] ?? 0;
  return Math.max(VRF_TREND_CONTEXT_GAP_MS, median * 3);
}

/** Pisteen kattama aikaväli (tilaviivat): aikaikkuna tai seuraavaan mittaukseen asti. */
export function vrfTrendPointCoverEnd(
  points: VrfTrendPoint[],
  index: number,
  gapThresholdMs: number,
  typicalStepMs: number,
): number {
  const point = points[index];
  if (point.tEnd > point.t) return point.tEnd;
  const next = points[index + 1];
  if (next && next.t - point.t <= gapThresholdMs) return next.t;
  return point.t + Math.min(typicalStepMs, gapThresholdMs);
}

/** Datattomat jaksot [alku, loppu] näkyvällä välillä. */
export function vrfTrendCoverageGaps(
  points: VrfTrendPoint[],
  startMs: number,
  endMs: number,
  gapThresholdMs: number,
): Array<[number, number]> {
  if (points.length === 0) return [[startMs, endMs]];
  const gaps: Array<[number, number]> = [];
  const [from, to] = visibleVrfTrendRange(points, startMs, endMs);
  const first = points[from];
  if (first && first.t - startMs > gapThresholdMs) gaps.push([startMs, first.t]);
  for (let i = from; i < to - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const aEnd = Math.max(a.t, a.tEnd);
    if (b.t - a.t > gapThresholdMs && b.t > startMs && aEnd < endMs) gaps.push([Math.max(aEnd, startMs), Math.min(b.t, endMs)]);
  }
  const last = points[to - 1];
  if (last) {
    const lastEnd = Math.max(last.t, last.tEnd);
    if (endMs - lastEnd > gapThresholdMs) gaps.push([Math.max(lastEnd, startMs), endMs]);
  }
  return gaps.filter(([a, b]) => b > a);
}

/** Tilaviivan osuus mittauksista näkyvällä välillä (0…1), null jos ei dataa. */
export function vrfLaneShare(
  points: VrfTrendPoint[],
  lane: VrfBinaryLaneKey,
  startMs: number,
  endMs: number,
): number | null {
  let on = 0;
  let total = 0;
  const from = lowerBoundPoint(points, startMs);
  for (let i = from; i < points.length && points[i].t <= endMs; i += 1) {
    on += points[i].lanes[lane] * points[i].samples;
    total += points[i].samples;
  }
  return total > 0 ? on / total : null;
}

/** Arvojen min/max näkyvillä viivoilla (aikaikkunoissa min/max-kaista mukaan). */
export function vrfTrendValueExtent(
  points: VrfTrendPoint[],
  keys: VrfTrendSignalKey[],
  startMs: number,
  endMs: number,
): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  const [from, to] = visibleVrfTrendRange(points, startMs, endMs);
  for (let i = from; i < to; i += 1) {
    const p = points[i];
    if (p.tEnd < startMs || p.t > endMs) continue;
    for (const key of keys) {
      const v = p.values[key];
      if (v == null) continue;
      const lo = p.mins?.[key] ?? v;
      const hi = p.maxs?.[key] ?? v;
      if (lo < min) min = lo;
      if (hi > max) max = hi;
    }
  }
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null;
}

/**
 * Live-päivityksen yhdistys: vanhat pisteet ennen mergeFromMs + uudet pisteet siitä eteenpäin,
 * ja liukuvan ikkunan alusta pudotetaan vanhat pois.
 */
export function mergeVrfTrendTail(
  data: VrfTrendData,
  tail: VrfTrendPoint[],
  mergeFromMs: number,
  startMs: number,
  endMs: number,
  /** Raakapisteillä säilytettävä konteksti ennen välin alkua (tilalaskurit). */
  contextMs = 0,
): VrfTrendData {
  const keepFrom = startMs - Math.max(data.bucketMs || 0, contextMs);
  const kept = data.points.filter((p) => p.t < mergeFromMs && p.tEnd >= keepFrom);
  const fresh = tail.filter((p) => p.t >= mergeFromMs && p.t <= endMs);
  const points = [...kept, ...fresh];
  return {
    ...data,
    startMs,
    endMs,
    points,
    sampleCount: points.reduce((sum, p) => (p.t >= startMs && p.t <= endMs ? sum + p.samples : sum), 0),
    counters: null,
  };
}

/** Raakapisteiden live-päivityksessä mukaan otettava konteksti (sulatusarvio tarvitsee edelliset mittaukset). */
export const VRF_TREND_TAIL_CONTEXT_MS = Math.max(VRF_DEFROST_SUPPRESS_AFTER_PERMIT_ON_MS * 3, 15 * MINUTE);

/**
 * Trendiin tarvittavat kentät — ei koko telemetria-JSONia (verkko, diagnostiikka, asetukset,
 * sähköpostilistat…), joka teki jokaisesta rivistä moninkertaisen kokoisen.
 */
export const VRF_TREND_SLIM_SELECT = [
  'id',
  'device_id',
  'recorded_at',
  'heat_enabled',
  'any_alarm',
  'temperatures:payload->temperatures',
  'control_enabled:payload->control->enabled',
  'st_shutdown:payload->status->alarm_shutdown_active',
  'st_compressor:payload->status->compressor_likely_running',
  'digital_inputs:payload->digital_inputs',
  'alarms:payload->alarms',
  'defrost_active:payload->defrost->active',
  'diag_bus:payload->diagnostics->di_bus_energized',
  's_di3:payload->settings->di3_trigger_raw_level',
  's_alarm_in:payload->settings->alarm_input_trigger_raw_level',
  's_di3_shutdown:payload->settings->di3_alarm_shutdown_enabled',
].join(', ');

export type VrfTrendSlimRow = {
  id: number;
  device_id: string;
  recorded_at: string;
  heat_enabled: boolean | null;
  any_alarm: boolean | null;
  temperatures: unknown;
  control_enabled: unknown;
  st_shutdown: unknown;
  st_compressor: unknown;
  digital_inputs: unknown;
  alarms: unknown;
  defrost_active: unknown;
  diag_bus: unknown;
  s_di3: unknown;
  s_alarm_in: unknown;
  s_di3_shutdown: unknown;
};

function defined(entries: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entries)) if (value !== undefined && value !== null) out[key] = value;
  return out;
}

/** Kevyt rivi → VrfReading, jonka payload sisältää vain trendin tarvitsemat osat. */
export function slimRowToReading(row: VrfTrendSlimRow): VrfReading {
  return {
    id: row.id,
    device_id: row.device_id,
    recorded_at: row.recorded_at,
    outdoor_c: null,
    heat_enabled: row.heat_enabled,
    operating_state: null,
    any_alarm: row.any_alarm === true,
    payload: {
      temperatures: row.temperatures ?? {},
      control: defined({ enabled: row.control_enabled }),
      status: defined({
        alarm_shutdown_active: row.st_shutdown,
        compressor_likely_running: row.st_compressor,
      }),
      ...(row.digital_inputs != null ? { digital_inputs: row.digital_inputs } : {}),
      alarms: row.alarms ?? {},
      defrost: defined({ active: row.defrost_active }),
      diagnostics: defined({ di_bus_energized: row.diag_bus }),
      settings: defined({
        di3_trigger_raw_level: row.s_di3,
        alarm_input_trigger_raw_level: row.s_alarm_in,
        di3_alarm_shutdown_enabled: row.s_di3_shutdown,
      }),
    },
  };
}
