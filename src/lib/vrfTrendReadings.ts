import { supabase } from './supabase';
import { loadMonitorShareViewPublic } from './monitorReaderShares';
import {
  VRF_READING_QUERY_MAX,
  sortReadingsByTime,
  trendReadingLimit,
  type VrfReading,
} from './vrfMonitoring';
import {
  VRF_TREND_SLIM_SELECT,
  VRF_TREND_TAIL_CONTEXT_MS,
  slimRowToReading,
  type VrfTrendSlimRow as SlimRow,
  VrfTrendBucketAccumulator,
  VrfTrendPointBuilder,
  chooseVrfTrendBucketMs,
  mapVrfTrendBucketRows,
  mergeVrfTrendTail,
  vrfBucketStart,
  type VrfTrendBucketRow,
  type VrfTrendData,
  type VrfTrendPoint,
} from './vrfTrendData';
import {
  VRF_COUNTER_LOOKAHEAD_MS,
  VRF_COUNTER_LOOKBACK_MS,
  VrfStateCounterAccumulator,
  mapVrfStateCounterRows,
  type VrfStateCounterRow,
  type VrfStateCounters,
} from './vrfStateCounters';

/** PostgREST / Supabase oletus — yksi sivu kerrallaan. */
export const VRF_TREND_READ_PAGE_SIZE = 1000;

function isAbort(err: unknown) {
  return err instanceof DOMException && err.name === 'AbortError';
}

export class VrfTrendAbortError extends Error {
  constructor() {
    super('Peruttu');
    this.name = 'AbortError';
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new VrfTrendAbortError();
}

export function isVrfTrendAbort(err: unknown) {
  return isAbort(err) || (err instanceof Error && err.name === 'AbortError');
}

/** Yhden aikapalan rivit nousevassa järjestyksessä (sivutetaan jos >1000). */
async function fetchSlimChunk(
  deviceId: string,
  fromIso: string,
  toIso: string,
  inclusiveEnd: boolean,
  signal?: AbortSignal,
): Promise<VrfReading[]> {
  const out: VrfReading[] = [];
  for (let page = 0; page < 200; page += 1) {
    throwIfAborted(signal);
    const from = page * VRF_TREND_READ_PAGE_SIZE;
    let query = supabase
      .from('vrf_readings')
      .select(VRF_TREND_SLIM_SELECT)
      .eq('device_id', deviceId)
      .gte('recorded_at', fromIso);
    query = inclusiveEnd ? query.lte('recorded_at', toIso) : query.lt('recorded_at', toIso);
    let ordered = query.order('recorded_at', { ascending: true }).range(from, from + VRF_TREND_READ_PAGE_SIZE - 1);
    if (signal) ordered = ordered.abortSignal(signal);
    const { data, error } = await ordered;
    throwIfAborted(signal);
    if (error) throw new Error(error.message);
    const batch = (data as unknown as SlimRow[] | null) ?? [];
    for (const row of batch) out.push(slimRowToReading(row));
    if (batch.length < VRF_TREND_READ_PAGE_SIZE) break;
  }
  return out;
}

/** Aikapalat: ~12 h (≈720 mittausta) → yleensä yksi pyyntö per pala, palat rinnakkain. */
const CHUNK_MS = 12 * 3600_000;
const CHUNK_CONCURRENCY = 6;

function buildChunks(startMs: number, endMs: number): Array<[number, number]> {
  const chunks: Array<[number, number]> = [];
  for (let a = startMs; a < endMs; a += CHUNK_MS) chunks.push([a, Math.min(a + CHUNK_MS, endMs)]);
  if (chunks.length === 0) chunks.push([startMs, endMs]);
  return chunks;
}

/**
 * Hakee aikavälin rivit rinnakkain (enintään 6 pyyntöä kerrallaan) ja luovuttaa palat
 * aikajärjestyksessä onChunk-kutsulle — muistiin ei tarvitse kerätä kaikkia rivejä.
 */
export async function streamVrfReadingsRange(opts: {
  deviceId: string;
  startMs: number;
  endMs: number;
  signal?: AbortSignal;
  newestFirst?: boolean;
  onChunk: (rows: VrfReading[]) => boolean | void;
  onProgress?: (done: number, total: number) => void;
}): Promise<void> {
  const chunks = buildChunks(opts.startMs, opts.endMs);
  if (opts.newestFirst) chunks.reverse();
  const promises: Array<Promise<VrfReading[]>> = [];
  let next = 0;
  const launch = () => {
    if (next >= chunks.length) return;
    const i = next;
    next += 1;
    const [a, b] = chunks[i];
    const inclusive = b === opts.endMs;
    const p = fetchSlimChunk(opts.deviceId, new Date(a).toISOString(), new Date(b).toISOString(), inclusive, opts.signal);
    p.catch(() => undefined);
    promises[i] = p;
  };
  for (let k = 0; k < CHUNK_CONCURRENCY; k += 1) launch();
  for (let i = 0; i < chunks.length; i += 1) {
    const rows = await promises[i];
    throwIfAborted(opts.signal);
    opts.onProgress?.(i + 1, chunks.length);
    const stop = opts.onChunk(rows) === false;
    if (stop) return;
    launch();
  }
}

/**
 * Raakamittaukset aikaväliltä (raportti / tulostus). Kevyt select + rinnakkaiset palat.
 * maxRows rajaa uusimpiin riveihin kuten ennenkin.
 */
export async function fetchVrfTrendReadings(opts: {
  deviceId: string;
  sinceIso: string;
  untilIso?: string;
  hours?: number;
  maxRows?: number;
  signal?: AbortSignal;
}): Promise<VrfReading[]> {
  const startMs = new Date(opts.sinceIso).getTime();
  const endMs = opts.untilIso ? new Date(opts.untilIso).getTime() : Date.now();
  const maxRows = opts.maxRows ?? (opts.hours != null ? trendReadingLimit(opts.hours) : VRF_READING_QUERY_MAX);
  const parts: VrfReading[][] = [];
  let total = 0;
  await streamVrfReadingsRange({
    deviceId: opts.deviceId,
    startMs,
    endMs,
    signal: opts.signal,
    newestFirst: true,
    onChunk: (rows) => {
      parts.push(rows);
      total += rows.length;
      return total < maxRows;
    },
  });
  const all = parts.reverse().flat();
  return sortReadingsByTime(all.length > maxRows ? all.slice(all.length - maxRows) : all);
}

/** Viimeisimmät mittaukset (laitesivun sulatusarvio) — ei enää koko vuorokautta 10 s välein. */
export async function fetchVrfRecentReadings(deviceId: string, minutes = 20): Promise<VrfReading[]> {
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const { data, error } = await supabase
    .from('vrf_readings')
    .select(VRF_TREND_SLIM_SELECT)
    .eq('device_id', deviceId)
    .gte('recorded_at', since)
    .order('recorded_at', { ascending: true })
    .limit(400);
  if (error) throw new Error(error.message);
  return ((data as unknown as SlimRow[] | null) ?? []).map(slimRowToReading);
}

export type VrfTrendDataSource = { kind: 'db'; deviceId: string } | { kind: 'share'; token: string };

function sourceKey(source: VrfTrendDataSource) {
  return source.kind === 'db' ? `db:${source.deviceId}` : `share:${source.token}`;
}

/** null = ei vielä tiedossa, false = RPC puuttuu tietokannasta (migraatio ajamatta). */
let rpcAvailable: boolean | null = null;

function isMissingRpcError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === 'PGRST202' || error.code === '42883') return true;
  return /could not find the function|does not exist/i.test(error.message ?? '');
}

async function fetchBucketsViaRpc(
  deviceId: string,
  startMs: number,
  endMs: number,
  bucketMs: number,
  signal?: AbortSignal,
): Promise<VrfTrendPoint[] | null> {
  if (rpcAvailable === false) return null;
  let call = supabase.rpc('vrf_trend_buckets', {
    p_device_id: deviceId,
    p_start: new Date(startMs).toISOString(),
    p_end: new Date(endMs).toISOString(),
    p_bucket_seconds: Math.round(bucketMs / 1000),
  });
  if (signal) call = call.abortSignal(signal);
  const { data, error } = await call;
  throwIfAborted(signal);
  if (error) {
    if (isMissingRpcError(error)) {
      rpcAvailable = false;
      return null;
    }
    throw new Error(error.message);
  }
  rpcAvailable = true;
  return mapVrfTrendBucketRows((data as VrfTrendBucketRow[] | null) ?? [], bucketMs);
}

async function shareReadings(token: string, startMs: number, endMs: number): Promise<VrfReading[]> {
  const bundle = await loadMonitorShareViewPublic(token, {
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
  });
  return sortReadingsByTime((bundle.readings as VrfReading[]) ?? []);
}

/**
 * Raakarivit → pisteet (+ aikaikkunat) virtana.
 * withContext: haetaan myös 30 min ennen ja 15 min jälkeen välin, jotta tilalaskurit ovat tarkkoja
 * välin reunoilla (jo käynnissä oleva kompressori ei ole käynnistys). Raakapisteissä konteksti
 * jätetään mukaan (zoomaus ladatun datan sisällä laskee laskurit niistä), aikaikkunoihin vain väli.
 */
async function buildPointsFromRows(
  source: VrfTrendDataSource,
  startMs: number,
  endMs: number,
  bucketMs: number,
  signal?: AbortSignal,
  onProgress?: (fraction: number) => void,
  withContext = false,
): Promise<{ points: VrfTrendPoint[]; sampleCount: number; counters: VrfStateCounters | null }> {
  const builder = new VrfTrendPointBuilder();
  const acc = bucketMs > 0 ? new VrfTrendBucketAccumulator(bucketMs) : null;
  const counter = withContext ? new VrfStateCounterAccumulator(startMs, endMs, bucketMs > 0 ? 'client' : 'local') : null;
  const fetchStart = withContext ? startMs - VRF_COUNTER_LOOKBACK_MS : startMs;
  const fetchEnd = withContext ? endMs + VRF_COUNTER_LOOKAHEAD_MS : endMs;
  const raw: VrfTrendPoint[] = [];
  let rawInRange = 0;
  const consume = (rows: VrfReading[]) => {
    for (const row of rows) {
      const point = builder.push(row);
      if (!point) continue;
      counter?.push(point);
      const inRange = point.t >= startMs && point.t <= endMs;
      if (acc) {
        if (inRange) acc.push(point);
      } else {
        raw.push(point);
        if (inRange) rawInRange += 1;
      }
    }
  };

  if (source.kind === 'share') {
    consume(await shareReadings(source.token, fetchStart, fetchEnd));
    throwIfAborted(signal);
  } else {
    await streamVrfReadingsRange({
      deviceId: source.deviceId,
      startMs: fetchStart,
      endMs: fetchEnd,
      signal,
      onChunk: consume,
      onProgress: (done, total) => onProgress?.(done / total),
    });
  }

  const counters = counter ? counter.finish() : null;
  if (acc) {
    const points = acc.finish();
    return { points, sampleCount: acc.sampleCount, counters };
  }
  return { points: raw, sampleCount: rawInRange, counters };
}

type CacheEntry = { data: VrfTrendData; at: number };
const cache = new Map<string, CacheEntry>();
const CACHE_MAX = 24;

function cacheGet(key: string, endMs: number): VrfTrendData | null {
  const entry = cache.get(key);
  if (!entry) return null;
  const live = Date.now() - endMs < 3 * 60_000;
  const ttl = live ? 60_000 : 10 * 60_000;
  if (Date.now() - entry.at > ttl) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function cacheSet(key: string, data: VrfTrendData) {
  cache.delete(key);
  cache.set(key, { data, at: Date.now() });
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest == null) break;
    cache.delete(oldest);
  }
}

export function clearVrfTrendCache() {
  cache.clear();
}

/**
 * Trendidata näkyvälle välille: ≤36 h jokainen mittaus (kevyt select), pidemmät välit
 * aikaikkunoina palvelimella (RPC vrf_trend_buckets) tai — jos migraatiota ei ole ajettu —
 * selaimessa virtana koottuna.
 */
export async function loadVrfTrendData(opts: {
  source: VrfTrendDataSource;
  startMs: number;
  endMs: number;
  signal?: AbortSignal;
  force?: boolean;
  onProgress?: (fraction: number) => void;
}): Promise<VrfTrendData> {
  const { source, startMs, endMs, signal } = opts;
  const bucketMs = chooseVrfTrendBucketMs(endMs - startMs);
  const key = `${sourceKey(source)}|${startMs}|${endMs}|${bucketMs}`;
  if (!opts.force) {
    const hit = cacheGet(key, endMs);
    if (hit) return hit;
  }

  let data: VrfTrendData | null = null;
  if (source.kind === 'db' && bucketMs > 0) {
    const points = await fetchBucketsViaRpc(source.deviceId, startMs, endMs, bucketMs, signal);
    if (points) {
      data = {
        startMs,
        endMs,
        bucketMs,
        points,
        sampleCount: points.reduce((sum, p) => sum + p.samples, 0),
        source: 'server',
      };
    }
  }
  if (!data) {
    const built = await buildPointsFromRows(source, startMs, endMs, bucketMs, signal, opts.onProgress, true);
    data = {
      startMs,
      endMs,
      bucketMs,
      points: built.points,
      sampleCount: built.sampleCount,
      source: bucketMs > 0 ? 'client' : 'raw',
      // raakapisteistä laskurit lasketaan näkymän mukaan; aikaikkunoista ei voi → talteen nyt
      counters: bucketMs > 0 ? built.counters : null,
    };
  }
  cacheSet(key, data);
  return data;
}

/**
 * Live-päivitys: haetaan vain uusin pää (viimeisestä aikaikkunasta / mittauksesta eteenpäin)
 * ja liu'utetaan ikkunaa — ei koko historiaa uudelleen.
 */
export async function refreshVrfTrendTail(opts: {
  source: VrfTrendDataSource;
  data: VrfTrendData;
  startMs: number;
  endMs: number;
  signal?: AbortSignal;
}): Promise<VrfTrendData> {
  const { source, data, startMs, endMs, signal } = opts;
  const last = data.points[data.points.length - 1];
  const bucketMs = data.bucketMs;
  let next: VrfTrendData;

  if (!last) {
    return loadVrfTrendData({ source, startMs, endMs, signal, force: true });
  }

  if (bucketMs > 0) {
    const mergeFrom = vrfBucketStart(last.t, bucketMs);
    let tail: VrfTrendPoint[] | null = null;
    if (source.kind === 'db' && data.source === 'server') {
      tail = await fetchBucketsViaRpc(source.deviceId, mergeFrom, endMs, bucketMs, signal);
    }
    if (!tail) {
      const built = await buildPointsFromRows(source, mergeFrom - VRF_TREND_TAIL_CONTEXT_MS, endMs, bucketMs, signal);
      tail = built.points;
    }
    next = mergeVrfTrendTail(data, tail, mergeFrom, startMs, endMs);
  } else {
    const built = await buildPointsFromRows(source, last.t - VRF_TREND_TAIL_CONTEXT_MS, endMs, 0, signal);
    next = mergeVrfTrendTail(data, built.points, last.t + 1, startMs, endMs, VRF_COUNTER_LOOKBACK_MS);
  }

  const bucketForSpan = chooseVrfTrendBucketMs(endMs - startMs);
  cacheSet(`${sourceKey(source)}|${startMs}|${endMs}|${bucketForSpan}`, next);
  return next;
}

/** null = ei vielä tiedossa, false = vrf_state_counters puuttuu (migraatio ajamatta). */
let countersRpcAvailable: boolean | null = null;

type CounterCacheEntry = { promise: Promise<VrfStateCounters | null>; at: number; endMs: number };
const counterCache = new Map<string, CounterCacheEntry>();

/**
 * Tilalaskurit palvelimelta (vrf_state_counters) — tarkat raakamittauksista koko välille.
 * null = funktiota ei ole (tai jakolinkki) → kutsuja käyttää selaimen laskentaa jos mahdollista.
 * Sama väli jaetaan käynnissä olevan pyynnön kanssa (ei päällekkäisiä hakuja).
 */
export function loadVrfStateCounters(opts: {
  source: VrfTrendDataSource;
  startMs: number;
  endMs: number;
  force?: boolean;
}): Promise<VrfStateCounters | null> {
  const { source, startMs, endMs } = opts;
  if (source.kind !== 'db' || countersRpcAvailable === false) return Promise.resolve(null);
  const key = `${source.deviceId}|${startMs}|${endMs}`;
  const hit = opts.force ? undefined : counterCache.get(key);
  if (hit) {
    const live = Date.now() - hit.endMs < 3 * 60_000;
    if (Date.now() - hit.at < (live ? 60_000 : 10 * 60_000)) return hit.promise;
    counterCache.delete(key);
  }
  const promise = (async () => {
    const { data, error } = await supabase.rpc('vrf_state_counters', {
      p_device_id: source.deviceId,
      p_start: new Date(startMs).toISOString(),
      p_end: new Date(endMs).toISOString(),
    });
    if (error) {
      if (isMissingRpcError(error)) {
        countersRpcAvailable = false;
        return null;
      }
      throw new Error(error.message);
    }
    countersRpcAvailable = true;
    return mapVrfStateCounterRows((data as VrfStateCounterRow[] | null) ?? [], startMs, endMs);
  })();
  counterCache.set(key, { promise, at: Date.now(), endMs });
  promise.catch(() => counterCache.delete(key));
  while (counterCache.size > 24) {
    const oldest = counterCache.keys().next().value;
    if (oldest == null) break;
    counterCache.delete(oldest);
  }
  return promise;
}
