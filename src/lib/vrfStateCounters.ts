/**
 * VRF-tilalaskurit valitulle aikavälille: pois → päälle -kerrat (kompressorin käynnistykset,
 * sulatukset, hälytykset, käyntilupa…), kokonaisaika ja keskimääräinen jakso.
 *
 * Lasketaan aina raakamittauksista — ei aikaikkunoiden keskiarvoista. Sama sääntö kuin SQL-funktiossa
 * vrf_state_counters (supabase/migrations/20261001200000_vrf_state_counters.sql):
 *  - kerta = siirtymä pois → päälle, jonka päälle-mittaus on välillä [startMs, endMs]; edellinen
 *    mittaus saa olla ennen välin alkua (siksi haetaan VRF_COUNTER_LOOKBACK_MS taaksepäin), joten jo
 *    valmiiksi päällä oleva ei ole uusi kerta
 *  - yli 15 min mittaustauko katkaisee: tauon jälkeen päällä oleva ei ole uusi kerta eikä taukoa
 *    lasketa aikaan
 *  - aika = mittaukselta seuraavalle (≤ 15 min), rajattuna väliin [startMs, endMs]
 */
import type { VrfActivityTrendState, VrfBinaryLaneKey } from './vrfMonitoring';
import { VRF_TREND_CONTEXT_GAP_MS } from './vrfTrendData';

const MINUTE = 60_000;

/** Ennen välin alkua haettava konteksti (edellinen tila + sulatusarvion historia). */
export const VRF_COUNTER_LOOKBACK_MS = 30 * MINUTE;
/** Välin lopun jälkeen haettava pala (viimeisen mittauksen kesto välin loppuun asti). */
export const VRF_COUNTER_LOOKAHEAD_MS = VRF_TREND_CONTEXT_GAP_MS;

export const VRF_COUNTER_LANES: VrfBinaryLaneKey[] = ['control', 'compressor', 'defrost', 'alarm', 'unit_ready'];

export type VrfCounterState = Exclude<VrfActivityTrendState, 'unknown'>;
export const VRF_COUNTER_STATES: VrfCounterState[] = ['heating', 'standby', 'defrost', 'off', 'shutdown_wait', 'alarm'];

export type VrfCounter = {
  /** Pois → päälle -siirtymät välillä. */
  transitions: number;
  /** Päälläolojaksot, jotka näkyvät välillä (myös alussa jo päällä / tauon jälkeen). */
  episodes: number;
  /** Päälläoloaika yhteensä (ms). */
  onMs: number;
};

export type VrfStateCountersSource = 'local' | 'server' | 'client';

export type VrfStateCounters = {
  startMs: number;
  endMs: number;
  /** Mittauksia välillä. */
  samples: number;
  /** Aika, jolta on mittausdataa (ms). */
  coveredMs: number;
  lanes: Record<VrfBinaryLaneKey, VrfCounter>;
  states: Record<VrfCounterState, VrfCounter>;
  source: VrfStateCountersSource;
};

/** Yksi raakamittaus laskuria varten (VrfTrendPoint käy sellaisenaan). */
export type VrfCounterSample = {
  t: number;
  lanes: Record<VrfBinaryLaneKey, number | boolean>;
  state: VrfActivityTrendState;
};

function emptyCounter(): VrfCounter {
  return { transitions: 0, episodes: 0, onMs: 0 };
}

export function emptyVrfStateCounters(startMs: number, endMs: number, source: VrfStateCountersSource): VrfStateCounters {
  return {
    startMs,
    endMs,
    samples: 0,
    coveredMs: 0,
    lanes: Object.fromEntries(VRF_COUNTER_LANES.map((k) => [k, emptyCounter()])) as Record<VrfBinaryLaneKey, VrfCounter>,
    states: Object.fromEntries(VRF_COUNTER_STATES.map((k) => [k, emptyCounter()])) as Record<VrfCounterState, VrfCounter>,
    source,
  };
}

function laneOn(sample: VrfCounterSample, key: VrfBinaryLaneKey): boolean {
  const v = sample.lanes[key];
  return typeof v === 'boolean' ? v : v > 0;
}

/** Laskuri virtana — mittaukset aikajärjestyksessä (mukana konteksti ennen ja jälkeen välin). */
export class VrfStateCounterAccumulator {
  private readonly result: VrfStateCounters;
  private prev: VrfCounterSample | null = null;

  constructor(
    private readonly startMs: number,
    private readonly endMs: number,
    source: VrfStateCountersSource = 'local',
  ) {
    this.result = emptyVrfStateCounters(startMs, endMs, source);
  }

  push(sample: VrfCounterSample) {
    const t = sample.t;
    if (!Number.isFinite(t)) return;
    const prev = this.prev;
    if (prev && t < prev.t) return; // ei aikajärjestyksessä → ohitetaan
    const same = prev != null && t - prev.t <= VRF_TREND_CONTEXT_GAP_MS ? prev : null;

    if (same) {
      const dur = Math.max(0, Math.min(t, this.endMs) - Math.max(same.t, this.startMs));
      if (dur > 0) {
        this.result.coveredMs += dur;
        for (const key of VRF_COUNTER_LANES) if (laneOn(same, key)) this.result.lanes[key].onMs += dur;
        if (same.state !== 'unknown') this.result.states[same.state].onMs += dur;
      }
    }

    if (t >= this.startMs && t <= this.endMs) {
      this.result.samples += 1;
      const prevInRange = same != null && same.t >= this.startMs;
      for (const key of VRF_COUNTER_LANES) {
        if (!laneOn(sample, key)) continue;
        const prevOn = same != null && laneOn(same, key);
        const c = this.result.lanes[key];
        if (same && !prevOn) c.transitions += 1;
        if (!(prevOn && prevInRange)) c.episodes += 1;
      }
      if (sample.state !== 'unknown') {
        const prevSame = same != null && same.state === sample.state;
        const c = this.result.states[sample.state];
        if (same && !prevSame) c.transitions += 1;
        if (!(prevSame && prevInRange)) c.episodes += 1;
      }
    }
    this.prev = sample;
  }

  finish(): VrfStateCounters {
    return this.result;
  }
}

/** Laskurit raakapisteistä (pisteissä saa olla kontekstia välin ulkopuolelta). */
export function computeVrfStateCounters(
  samples: VrfCounterSample[],
  startMs: number,
  endMs: number,
  source: VrfStateCountersSource = 'local',
): VrfStateCounters {
  const acc = new VrfStateCounterAccumulator(startMs, endMs, source);
  // vain tarvittava osuus: konteksti ennen + väli + lopun jälkeen
  let lo = 0;
  let hi = samples.length;
  const from = startMs - VRF_COUNTER_LOOKBACK_MS;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (samples[mid].t < from) lo = mid + 1;
    else hi = mid;
  }
  const until = endMs + VRF_COUNTER_LOOKAHEAD_MS;
  for (let i = lo; i < samples.length && samples[i].t <= until; i += 1) acc.push(samples[i]);
  return acc.finish();
}

/** Supabase RPC vrf_state_counters -rivi. */
export type VrfStateCounterRow = {
  signal: string;
  transitions: number;
  episodes: number;
  on_ms: number;
  covered_ms: number;
  samples: number;
};

function num(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function mapVrfStateCounterRows(rows: VrfStateCounterRow[], startMs: number, endMs: number): VrfStateCounters {
  const out = emptyVrfStateCounters(startMs, endMs, 'server');
  for (const row of rows) {
    out.coveredMs = Math.max(out.coveredMs, num(row.covered_ms));
    out.samples = Math.max(out.samples, num(row.samples));
    const counter: VrfCounter = { transitions: num(row.transitions), episodes: num(row.episodes), onMs: num(row.on_ms) };
    if (row.signal.startsWith('state:')) {
      const key = row.signal.slice(6) as VrfCounterState;
      if (VRF_COUNTER_STATES.includes(key)) out.states[key] = counter;
    } else if ((VRF_COUNTER_LANES as string[]).includes(row.signal)) {
      out.lanes[row.signal as VrfBinaryLaneKey] = counter;
    }
  }
  return out;
}

/** Keskimääräinen päälläolojakso (ms) tai null. */
export function vrfCounterAverageMs(counter: VrfCounter): number | null {
  return counter.episodes > 0 && counter.onMs > 0 ? counter.onMs / counter.episodes : null;
}

/** Kerrat tunnissa mittausajasta, null jos dataa alle 10 min. */
export function vrfCounterPerHour(counter: VrfCounter, coveredMs: number): number | null {
  if (coveredMs < 10 * MINUTE) return null;
  return counter.transitions / (coveredMs / 3600_000);
}

/** Kesto suomeksi: 45 s · 12 min · 3 h 05 min · 2 vrk 4 h. */
export function formatVrfDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0 min';
  const totalMin = Math.round(ms / MINUTE);
  if (ms < MINUTE) return `${Math.max(1, Math.round(ms / 1000))} s`;
  if (totalMin < 60) return `${totalMin} min`;
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return hours > 0 ? `${days} vrk ${hours} h` : `${days} vrk`;
  return `${hours} h ${String(mins).padStart(2, '0')} min`;
}
