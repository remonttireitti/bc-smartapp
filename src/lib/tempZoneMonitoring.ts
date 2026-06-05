import type { TempEffectiveLimits, TempReading } from './tempMonitoring';

export const ZONE_KEYS = ['k1', 'k2', 'k3', 'pakastin'] as const;
export type ZoneKey = (typeof ZONE_KEYS)[number];

export type ZoneConfigEntry = {
  label: string;
  contents: string;
  min: number;
  max: number;
  sensor: number;
  kind: 'chilled' | 'freezer';
};

export type ZoneConfig = Record<ZoneKey, ZoneConfigEntry>;

export type ZoneLevel = 'ok' | 'warn' | 'bad' | 'none';

export type ZoneEval = { level: ZoneLevel; text: string; badge: string };

export const TIME_POLICY = {
  dangerFromBadSec: 25 * 60,
  spoilFromBadSec: 2 * 60 * 60,
} as const;

export const OFFLINE_ALERT_AFTER_SEC = 5 * 60;

const DEFAULT_ZONE_CONFIG: ZoneConfig = {
  k1: {
    label: 'Kylmiö 1',
    contents: '',
    min: 0,
    max: 6,
    sensor: 2,
    kind: 'chilled',
  },
  k2: {
    label: 'Kylmiö 2',
    contents: '',
    min: 0,
    max: 6,
    sensor: 0,
    kind: 'chilled',
  },
  k3: {
    label: 'Kylmiö 3',
    contents: '',
    min: 0,
    max: 6,
    sensor: 0,
    kind: 'chilled',
  },
  pakastin: {
    label: 'Pakastin',
    contents: '',
    min: -35,
    max: -18,
    sensor: 1,
    kind: 'freezer',
  },
};

export function zoneConfigToEffectiveLimits(entry: ZoneConfigEntry): TempEffectiveLimits {
  return {
    targetMin: entry.min,
    targetMax: entry.max,
    acceptableMin: entry.min,
    acceptableMax: entry.max,
    allowedDeviationMinutes: 0,
  };
}

export function filterReadingsForSensor(readings: TempReading[], sensor: number): TempReading[] {
  if (sensor !== 1 && sensor !== 2) return [];
  return readings.filter((row) => {
    const ch = row.sensor_channel ?? 0;
    if (sensor === 1) return ch === 1 || ch === 0;
    return ch === 2;
  });
}

export type ZoneTrendPreset = 'today' | '7d' | '30d';

export type ZoneTrendPeriod = {
  startMs: number;
  endMs: number;
  span: number;
};

export const ZONE_SENSOR_SERIES = [
  { sensor: 1 as const, label: 'Anturi 1', color: '#6366f1' },
  { sensor: 2 as const, label: 'Anturi 2', color: '#14b8a6' },
];

export function zoneTrendPeriodFromPreset(preset: ZoneTrendPreset, nowMs = Date.now()): ZoneTrendPeriod {
  const endMs = nowMs;
  let startMs: number;
  if (preset === 'today') {
    const d = new Date(nowMs);
    d.setHours(0, 0, 0, 0);
    startMs = d.getTime();
  } else if (preset === '7d') {
    startMs = nowMs - 7 * 24 * 3600_000;
  } else {
    startMs = nowMs - 30 * 24 * 3600_000;
  }
  return { startMs, endMs, span: Math.max(endMs - startMs, 1) };
}

export function formatZoneTrendTimeLabel(ms: number, spanMs: number): string {
  const date = new Date(ms);
  if (spanMs <= 6 * 3600_000) {
    return date.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
  }
  if (spanMs <= 48 * 3600_000) {
    return date.toLocaleString('fi-FI', {
      day: 'numeric',
      month: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return date.toLocaleString('fi-FI', { day: 'numeric', month: 'numeric', hour: '2-digit' });
}

/** Mittausvälien mediaani → raja, milloin jakson väliä ei yhdistetä viivalla. */
export function tempReadingGapThresholdMs(sorted: TempReading[], spanMs: number): number {
  const minGap = 15 * 60_000;
  const maxGap = Math.max(spanMs / 20, minGap);
  if (sorted.length < 2) return Math.min(Math.max(spanMs / 200, minGap), maxGap);
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    intervals.push(
      new Date(sorted[i].recorded_at).getTime() - new Date(sorted[i - 1].recorded_at).getTime(),
    );
  }
  intervals.sort((a, b) => a - b);
  const median = intervals[Math.floor(intervals.length / 2)];
  return Math.min(Math.max(median * 3, minGap), maxGap);
}

/** Mittausryhmät, joita ei erota dataton aukko (kuten VRF-trendissä). */
export function splitTempReadingsByGaps(readings: TempReading[], gapThreshold: number): TempReading[][] {
  const sorted = [...readings].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );
  if (sorted.length === 0) return [];
  const groups: TempReading[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i += 1) {
    const prevT = new Date(sorted[i - 1].recorded_at).getTime();
    const currT = new Date(sorted[i].recorded_at).getTime();
    if (currT - prevT > gapThreshold) {
      groups.push([sorted[i]]);
    } else {
      groups[groups.length - 1].push(sorted[i]);
    }
  }
  return groups;
}

export function trendPresetSinceIso(preset: ZoneTrendPreset, nowMs = Date.now()): string {
  return new Date(zoneTrendPeriodFromPreset(preset, nowMs).startMs).toISOString();
}

/** Yhdistä useita lukumääriä — myöhemmät joukot voittavat (live-puskuri viimeisenä). */
export function mergeTrendReadingSets(...sets: TempReading[][]): TempReading[] {
  const map = new Map<string, TempReading>();
  for (const rows of sets) {
    for (const row of rows) {
      const key =
        row.id >= 0
          ? `id:${row.id}`
          : `t:${row.recorded_at}|${row.sensor_channel ?? 0}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, row);
        continue;
      }
      const rowMs = new Date(row.recorded_at).getTime();
      const existingMs = new Date(existing.recorded_at).getTime();
      if (rowMs >= existingMs) map.set(key, row);
    }
  }
  return [...map.values()].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );
}

/** Kerää jokaisesta laitteen päivityksestä trendipisteet (kun DB ei ehdi tallentaa). */
export function appendLiveTrendSample(
  samples: TempReading[],
  device: {
    id: string;
    last_seen_at: string | null;
    last_temp_c: number | null;
    last_temp_c2?: number | null;
  },
  sessionId: string | null,
): TempReading[] {
  if (!device.last_seen_at) return samples;

  const at = device.last_seen_at;
  const channelAt = (channel: number) =>
    samples.findIndex((row) => row.recorded_at === at && (row.sensor_channel ?? 0) === channel);

  const next = [...samples];
  let syntheticId = -Date.now();

  const upsertChannel = (channel: number, temp: number | null | undefined) => {
    if (temp == null || !Number.isFinite(temp)) return;
    const idx = channelAt(channel);
    if (idx >= 0) {
      if (next[idx].temp_c === temp) return;
      next[idx] = { ...next[idx], temp_c: temp };
      return;
    }
    next.push({
      id: syntheticId,
      device_id: device.id,
      session_id: sessionId,
      recorded_at: at,
      temp_c: temp,
      sensor_channel: channel,
    });
    syntheticId -= 1;
  };

  upsertChannel(1, device.last_temp_c);
  upsertChannel(2, device.last_temp_c2);

  const cutoff = Date.now() - 3 * 24 * 3600_000;
  return next
    .filter((row) => new Date(row.recorded_at).getTime() >= cutoff)
    .slice(-5000);
}

/** Graafin aika-akseli — tänään zoomaa viimeisiin 12 h kun data on tuoretta. */
export function zoneTrendChartPeriod(
  preset: ZoneTrendPreset,
  readings: TempReading[],
  activeSensor: number,
  nowMs = Date.now(),
): ZoneTrendPeriod {
  const base = zoneTrendPeriodFromPreset(preset, nowMs);
  if (preset !== 'today' || activeSensor <= 0) return base;

  const rows = filterReadingsForSensor(readings, activeSensor);
  if (rows.length === 0) return base;

  const lastMs = new Date(rows[rows.length - 1].recorded_at).getTime();
  const recentWindowMs = 12 * 3600_000;

  if (nowMs - lastMs <= 2 * 3600_000) {
    const startMs = Math.max(base.startMs, nowMs - recentWindowMs);
    return { startMs, endMs: nowMs, span: Math.max(nowMs - startMs, 60_000) };
  }

  return base;
}

/** Kun pisteitä on vähän, zoomaa aika-akseli datan ympärille — yksi piste ei jää nurkkaan. */
export function fitZoneChartPeriod(
  period: ZoneTrendPeriod,
  times: number[],
  nowMs = Date.now(),
): ZoneTrendPeriod {
  if (times.length === 0) return period;

  const dataSpan = times.length === 1 ? 0 : times[times.length - 1] - times[0];
  if (times.length >= 3 && dataSpan >= period.span * 0.08) {
    return period;
  }

  if (times.length === 1) {
    const center = times[0];
    const half = 3 * 3600_000;
    return { startMs: center - half, endMs: center + half, span: 2 * half };
  }

  const min = Math.min(...times);
  const max = Math.max(...times);
  const span = Math.max(max - min, 45 * 60_000);
  const pad = Math.max(span * 0.12, 15 * 60_000);
  const startMs = Math.max(period.startMs, min - pad);
  const endMs = Math.min(Math.max(max + pad, startMs + 60_000), nowMs);
  return { startMs, endMs, span: Math.max(endMs - startMs, 60_000) };
}

export function downsampleZoneChartReadings(readings: TempReading[]): TempReading[] {
  if (readings.length <= 100) return readings;
  return collapseChartReadings(readings);
}

export function filterReadingsByTrendPreset(readings: TempReading[], preset: ZoneTrendPreset): TempReading[] {
  const now = Date.now();
  let startMs: number;
  if (preset === 'today') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    startMs = d.getTime();
  } else if (preset === '7d') {
    startMs = now - 7 * 24 * 3600 * 1000;
  } else {
    startMs = now - 30 * 24 * 3600 * 1000;
  }
  return readings.filter((row) => new Date(row.recorded_at).getTime() >= startMs);
}

function readingMatchesSensor(row: TempReading, sensor: number): boolean {
  const ch = row.sensor_channel ?? 0;
  if (sensor === 1) return ch === 1 || ch === 0;
  if (sensor === 2) return ch === 2;
  return false;
}

/** DB-rivit + viimeisin live-mittaus (kuten pohjapiirros), jotta trendi ei jää tyhjäksi. */
export function buildZoneTrendReadings(
  readings: TempReading[],
  device: {
    id: string;
    last_seen_at: string | null;
    last_temp_c: number | null;
    last_temp_c2?: number | null;
  } | null,
  activeSessionId: string | null,
): TempReading[] {
  const sorted = [...readings]
    .filter((row) => row.id >= 0)
    .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
  if (!device?.last_seen_at) return sorted;

  const liveAt = device.last_seen_at;
  const base = sorted.filter((row) => {
    if (row.recorded_at !== liveAt) return true;
    if (device.last_temp_c != null && Number.isFinite(device.last_temp_c) && readingMatchesSensor(row, 1)) {
      return false;
    }
    if (device.last_temp_c2 != null && Number.isFinite(device.last_temp_c2) && readingMatchesSensor(row, 2)) {
      return false;
    }
    return true;
  });

  const extras: TempReading[] = [];
  if (device.last_temp_c != null && Number.isFinite(device.last_temp_c)) {
    extras.push({
      id: -1,
      device_id: device.id,
      session_id: activeSessionId,
      recorded_at: liveAt,
      temp_c: device.last_temp_c,
      sensor_channel: 1,
    });
  }
  if (device.last_temp_c2 != null && Number.isFinite(device.last_temp_c2)) {
    extras.push({
      id: -2,
      device_id: device.id,
      session_id: activeSessionId,
      recorded_at: liveAt,
      temp_c: device.last_temp_c2,
      sensor_channel: 2,
    });
  }

  return [...base, ...extras].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );
}

/** Yhdistä tiheät live-päivitykset yhdeksi pisteeksi minuutin välein. */
export function collapseChartReadings(readings: TempReading[], bucketMs = 60_000): TempReading[] {
  if (readings.length <= 1) return readings;
  const sorted = [...readings].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );
  const out: TempReading[] = [];
  let bucketStart = 0;
  for (const row of sorted) {
    const ts = new Date(row.recorded_at).getTime();
    if (out.length === 0) {
      out.push(row);
      bucketStart = ts;
      continue;
    }
    if (ts - bucketStart < bucketMs) {
      out[out.length - 1] = row;
    } else {
      out.push(row);
      bucketStart = ts;
    }
  }
  return out;
}

export type ZoneTrendSummary = {
  latestTemp: number | null;
  latestAt: string | null;
  inRange: boolean;
  statusLabel: string;
  statusTone: 'ok' | 'warn' | 'none';
  pointCount: number;
  isSparse: boolean;
};

export function summarizeZoneTrend(
  readings: TempReading[],
  zone: ZoneConfigEntry,
): ZoneTrendSummary {
  const pointCount = readings.length;
  const latest = readings.length ? readings[readings.length - 1] : null;
  const latestTemp = latest != null ? Number(latest.temp_c) : null;
  if (latestTemp == null || !Number.isFinite(latestTemp)) {
    return {
      latestTemp: null,
      latestAt: null,
      inRange: false,
      statusLabel: 'Ei mittausta',
      statusTone: 'none',
      pointCount,
      isSparse: true,
    };
  }
  const inRange = isTempInRange(latestTemp, zone);
  let statusLabel = 'Lämpötila tavoitealueella';
  let statusTone: ZoneTrendSummary['statusTone'] = 'ok';
  if (!inRange) {
    statusTone = 'warn';
    if (zone.kind === 'freezer') {
      statusLabel = latestTemp > zone.max ? 'Liian lämmin' : 'Liian kylmä';
    } else if (latestTemp < zone.min) {
      statusLabel = 'Liian kylmä';
    } else {
      statusLabel = 'Liian lämmin';
    }
  }
  return {
    latestTemp,
    latestAt: latest?.recorded_at ?? null,
    inRange,
    statusLabel,
    statusTone,
    pointCount,
    isSparse: pointCount < 3,
  };
}

export function serializeZoneConfig(config: ZoneConfig): Record<string, unknown> {
  return { ...config };
}

export type HistoryPoint = {
  ts: number;
  t1: number | null;
  t2: number | null;
};

export function parseZoneConfig(raw: unknown): ZoneConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const out = {} as ZoneConfig;
  for (const z of ZONE_KEYS) {
    const entry = obj[z];
    if (!entry || typeof entry !== 'object') {
      out[z] = { ...DEFAULT_ZONE_CONFIG[z] };
      continue;
    }
    const e = entry as Record<string, unknown>;
    const d = DEFAULT_ZONE_CONFIG[z];
    out[z] = {
      label: typeof e.label === 'string' ? e.label : d.label,
      contents: typeof e.contents === 'string' ? e.contents : d.contents,
      min: Number.isFinite(Number(e.min)) ? Number(e.min) : d.min,
      max: Number.isFinite(Number(e.max)) ? Number(e.max) : d.max,
      sensor: parseInt(String(e.sensor), 10) || 0,
      kind: e.kind === 'freezer' ? 'freezer' : 'chilled',
    };
  }
  return out;
}

export function isTempInRange(t: number, cfg: ZoneConfigEntry) {
  return t >= cfg.min && t <= cfg.max;
}

export function buildHistoryPoints(readings: TempReading[]): HistoryPoint[] {
  const byTs = new Map<string, HistoryPoint>();
  for (const row of readings) {
    const key = row.recorded_at;
    const ts = Math.floor(new Date(key).getTime() / 1000);
    const existing = byTs.get(key) ?? { ts, t1: null, t2: null };
    const channel = row.sensor_channel ?? 0;
    if (channel === 1) existing.t1 = Number(row.temp_c);
    else if (channel === 2) existing.t2 = Number(row.temp_c);
    else if (existing.t1 == null) existing.t1 = Number(row.temp_c);
    else if (existing.t2 == null) existing.t2 = Number(row.temp_c);
    byTs.set(key, existing);
  }
  return [...byTs.values()].sort((a, b) => a.ts - b.ts);
}

function consecutiveBadDurationSec(
  points: HistoryPoint[],
  sensorKey: 't1' | 't2',
  cfg: ZoneConfigEntry,
): number {
  if (points.length === 0) return 0;
  const last = points[points.length - 1];
  const temp = last[sensorKey];
  if (temp == null || isTempInRange(temp, cfg)) return 0;

  let lastOkIdx = -1;
  for (let i = points.length - 1; i >= 0; i--) {
    const t = points[i][sensorKey];
    if (t != null && isTempInRange(t, cfg)) {
      lastOkIdx = i;
      break;
    }
  }
  if (lastOkIdx === points.length - 1) return 0;
  if (lastOkIdx < 0) {
    return Math.max(0, last.ts - points[0].ts);
  }
  return Math.max(0, last.ts - points[lastOkIdx].ts);
}

function timeBasedLevelFromBadDuration(badDurSec: number): ZoneLevel {
  if (badDurSec <= 0) return 'ok';
  if (badDurSec >= TIME_POLICY.spoilFromBadSec) return 'bad';
  if (badDurSec >= TIME_POLICY.dangerFromBadSec) return 'warn';
  return 'ok';
}

function formatMinSec(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return '0 min';
  const m = Math.floor(sec / 60);
  if (m < 120) return `${m} min`;
  return `${(sec / 3600).toFixed(1).replace('.', ',')} h`;
}

export function evalZone(
  t: number | null,
  cfg: ZoneConfigEntry,
  recentPoints: HistoryPoint[],
  sensorIdx: number,
): ZoneEval {
  if (t == null || !Number.isFinite(t)) {
    return { level: 'none', text: 'Ei mittausta', badge: 'Ei anturia' };
  }

  const key = sensorIdx === 1 ? 't1' : 't2';
  if (isTempInRange(t, cfg)) {
    return { level: 'ok', text: 'OK', badge: 'OK' };
  }

  const badDur = consecutiveBadDurationSec(recentPoints, key, cfg);
  const level = timeBasedLevelFromBadDuration(badDur);

  let dev = 0;
  if (cfg.kind === 'freezer') {
    dev = t - cfg.max;
  } else if (t < cfg.min) {
    dev = cfg.min - t;
  } else {
    dev = t - cfg.max;
  }

  let text: string;
  if (level === 'ok') {
    text = `Hetkellinen poikkeama (ei hälytysrajaa). Yhtäjaksoisesti ${formatMinSec(badDur)} · Δ ${dev.toFixed(1)} °C`;
  } else if (level === 'warn') {
    text = `Vaara: ${formatMinSec(badDur)} rajauksen ulkopuolella. Δ ${dev.toFixed(1)} °C`;
  } else {
    text = `Todennäköinen pilaantuminen: yhtäjaksoinen poikkeama ${formatMinSec(badDur)} (yli ${Math.round(TIME_POLICY.spoilFromBadSec / 60)} min ohje). Δ ${dev.toFixed(1)} °C`;
  }

  const badge =
    level === 'ok' ? 'OK' : level === 'warn' ? 'Varoitus' : level === 'bad' ? 'Hälytys' : '—';

  return { level, text, badge };
}

export function liveTempsFromDevice(
  lastTempC: number | null | undefined,
  lastTempC2: number | null | undefined,
): { t1: number | null; t2: number | null } {
  return {
    t1: lastTempC ?? null,
    t2: lastTempC2 ?? null,
  };
}

export function secondsSinceLastSample(lastSeenAt: string | null | undefined): number | null {
  if (!lastSeenAt) return null;
  return Math.max(0, (Date.now() - new Date(lastSeenAt).getTime()) / 1000);
}

export function connectionBadgeLabel(lastSeenAt: string | null | undefined, online: boolean) {
  const age = secondsSinceLastSample(lastSeenAt);
  if (!online || (age != null && age > OFFLINE_ALERT_AFTER_SEC)) {
    return { text: 'Ei tuoretta dataa', warn: true };
  }
  return { text: 'Yhdistetty', warn: false };
}
