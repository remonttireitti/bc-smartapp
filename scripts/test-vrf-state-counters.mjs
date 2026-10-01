import assert from 'node:assert/strict';
import { buildVrfTrendPoints, mergeVrfTrendTail } from '../src/lib/vrfTrendData.ts';
import {
  VRF_COUNTER_LANES,
  VRF_COUNTER_LOOKAHEAD_MS,
  VRF_COUNTER_LOOKBACK_MS,
  VRF_COUNTER_STATES,
  computeVrfStateCounters,
  formatVrfDuration,
  mapVrfStateCounterRows,
  vrfCounterAverageMs,
  vrfCounterPerHour,
} from '../src/lib/vrfStateCounters.ts';
import { makeVrfReadings } from './vrf-trend-fixtures.mjs';

process.env.TZ = process.env.TZ || 'Europe/Helsinki';

const MIN = 60_000;
const H = 60 * MIN;
const T0 = Date.UTC(2026, 4, 1, 8, 0, 0);

/** Kompressori-näyte minuutteina T0:sta. */
function s(min, compressor, state = compressor ? 'heating' : 'standby', extra = {}) {
  return {
    t: T0 + min * MIN,
    lanes: { control: 1, compressor: compressor ? 1 : 0, defrost: 0, alarm: 0, unit_ready: 1, ...extra },
    state,
  };
}

// --- Välin alussa jo käynnissä → ei käynnistys, mutta yksi jakso ---
{
  const pts = [s(-2, true), s(-1, true), s(0, true), s(1, true), s(2, false), s(3, false)];
  const c = computeVrfStateCounters(pts, T0, T0 + 3 * MIN);
  assert.equal(c.lanes.compressor.transitions, 0);
  assert.equal(c.lanes.compressor.episodes, 1);
  assert.equal(c.lanes.compressor.onMs, 2 * MIN); // 0→2 min (ennen alkua ei lasketa)
  assert.equal(c.coveredMs, 3 * MIN);
  assert.equal(c.samples, 4);
}

// --- Edellinen mittaus ennen alkua pois, ensimmäinen välillä päällä → käynnistys ---
{
  const pts = [s(-1, false), s(0, true), s(1, true), s(2, false)];
  const c = computeVrfStateCounters(pts, T0, T0 + 2 * MIN);
  assert.equal(c.lanes.compressor.transitions, 1);
  assert.equal(c.lanes.compressor.episodes, 1);
  assert.equal(c.lanes.compressor.onMs, 2 * MIN);
}

// --- Ei kontekstia ennen alkua (ensimmäinen mittaus päällä) → ei käynnistys ---
{
  const c = computeVrfStateCounters([s(0, true), s(1, true), s(2, false)], T0, T0 + 2 * MIN);
  assert.equal(c.lanes.compressor.transitions, 0);
  assert.equal(c.lanes.compressor.episodes, 1);
}

// --- Siirtymä ennen välin alkua ei lasketa; aika rajataan välin alkuun ---
{
  const pts = [s(-5, false), s(-4, true), s(0.5, true), s(2, false)];
  const c = computeVrfStateCounters(pts, T0, T0 + 3 * MIN);
  assert.equal(c.lanes.compressor.transitions, 0);
  assert.equal(c.lanes.compressor.episodes, 1);
  // -4 → 0.5 min: välillä 0…0.5 min; 0.5 → 2 min: 1.5 min
  assert.equal(c.lanes.compressor.onMs, 2 * MIN);
}

// --- Yli 15 min tauko: tauon jälkeen päällä ≠ käynnistys, taukoa ei lasketa aikaan ---
{
  const pts = [s(0, false), s(1, false), s(20, true), s(21, true), s(22, false), s(23, true), s(24, true)];
  const c = computeVrfStateCounters(pts, T0, T0 + 24 * MIN);
  assert.equal(c.lanes.compressor.transitions, 1); // vain 22 → 23
  assert.equal(c.lanes.compressor.episodes, 2); // 20–22 ja 23–24
  assert.equal(c.lanes.compressor.onMs, 3 * MIN); // 20–22 + 23–24
  assert.equal(c.coveredMs, 1 * MIN + 4 * MIN);
  assert.equal(vrfCounterAverageMs(c.lanes.compressor), 1.5 * MIN);
}

// --- Tasan 15 min väli on vielä sama jakso ---
{
  const c = computeVrfStateCounters([s(0, false), s(15, true), s(16, false)], T0, T0 + 16 * MIN);
  assert.equal(c.lanes.compressor.transitions, 1);
  assert.equal(c.coveredMs, 16 * MIN);
  assert.equal(c.lanes.compressor.onMs, 1 * MIN);
}

// --- Välin lopun jälkeinen mittaus: viimeisen mittauksen aika rajataan loppuun; ei laskea siirtymää lopun jälkeen ---
{
  const pts = [s(0, false), s(1, true), s(2, true), s(4, false), s(5, true)];
  const c = computeVrfStateCounters(pts, T0, T0 + 3 * MIN);
  assert.equal(c.lanes.compressor.transitions, 1);
  assert.equal(c.lanes.compressor.onMs, 2 * MIN); // 1 → 3 (rajattu)
  assert.equal(c.coveredMs, 3 * MIN);
  assert.equal(c.samples, 3);
}

// --- Usea käynnistys + tilat ---
{
  const pts = [];
  for (let m = 0; m < 60; m += 1) pts.push(s(m, Math.floor(m / 5) % 2 === 1)); // pois 0–4, päällä 5–9, ...
  const c = computeVrfStateCounters(pts, T0, T0 + 59 * MIN);
  assert.equal(c.lanes.compressor.transitions, 6); // 5, 15, 25, 35, 45, 55
  assert.equal(c.lanes.compressor.episodes, 6);
  assert.equal(c.lanes.compressor.onMs, 6 * 5 * MIN - MIN); // viimeinen jakso 55–59
  assert.equal(c.states.heating.transitions, 6);
  assert.equal(c.states.standby.transitions, 5); // 10, 20, …, 50 (alku ei ole siirtymä)
  assert.equal(c.states.standby.episodes, 6);
  assert.equal(c.lanes.control.transitions, 0);
  assert.equal(c.lanes.control.episodes, 1);
  assert.equal(c.lanes.control.onMs, 59 * MIN);
  assert.ok(Math.abs(vrfCounterPerHour(c.lanes.compressor, c.coveredMs) - 6 / (59 / 60)) < 1e-9);
}

// --- Viite (suora toteutus) = virta-laskuri satunnaisdatalla, myös zoomaus ladatun datan sisällä ---
function reference(points, startMs, endMs) {
  const GAP = 15 * MIN;
  const pts = points.filter((p) => p.t >= startMs - VRF_COUNTER_LOOKBACK_MS && p.t <= endMs + VRF_COUNTER_LOOKAHEAD_MS);
  const keys = [
    ...VRF_COUNTER_LANES.map((k) => ({ id: k, on: (p) => p.lanes[k] > 0 })),
    ...VRF_COUNTER_STATES.map((st) => ({ id: `state:${st}`, on: (p) => p.state === st })),
  ];
  const out = {};
  let covered = 0;
  for (let i = 0; i + 1 < pts.length; i += 1) {
    if (pts[i + 1].t - pts[i].t > GAP) continue;
    covered += Math.max(0, Math.min(pts[i + 1].t, endMs) - Math.max(pts[i].t, startMs));
  }
  for (const key of keys) {
    let transitions = 0;
    let episodes = 0;
    let onMs = 0;
    for (let i = 0; i < pts.length; i += 1) {
      const p = pts[i];
      const prev = i > 0 && p.t - pts[i - 1].t <= GAP ? pts[i - 1] : null;
      const next = i + 1 < pts.length && pts[i + 1].t - p.t <= GAP ? pts[i + 1] : null;
      if (next && key.on(p)) onMs += Math.max(0, Math.min(next.t, endMs) - Math.max(p.t, startMs));
      if (p.t < startMs || p.t > endMs || !key.on(p)) continue;
      if (prev && !key.on(prev)) transitions += 1;
      if (!(prev && key.on(prev) && prev.t >= startMs)) episodes += 1;
    }
    out[key.id] = { transitions, episodes, onMs };
  }
  return { out, covered };
}

for (const seed of [1, 2, 3, 7, 42]) {
  const readings = makeVrfReadings({ startMs: T0, count: 3000, seed });
  const all = buildVrfTrendPoints(readings);
  const first = all[0].t;
  const last = all[all.length - 1].t;
  for (let k = 0; k < 6; k += 1) {
    const a = first + Math.floor(((last - first) * (k + 1)) / 9);
    const b = Math.min(last + 10 * MIN, a + (k + 1) * 3 * H);
    const c = computeVrfStateCounters(all, a, b);
    const ref = reference(all, a, b);
    assert.ok(Math.abs(c.coveredMs - ref.covered) < 1e-6, `seed ${seed} covered`);
    for (const key of VRF_COUNTER_LANES) assert.deepEqual(c.lanes[key], ref.out[key], `seed ${seed} ${key}`);
    for (const st of VRF_COUNTER_STATES) assert.deepEqual(c.states[st], ref.out[`state:${st}`], `seed ${seed} ${st}`);

    // Haku vain väliltä [a − 30 min, b + 15 min] (kuten palvelin) antaa saman tuloksen kuin pidempi ladattu data
    const fetched = readings.filter((r) => {
      const t = Date.parse(r.recorded_at);
      return t >= a - VRF_COUNTER_LOOKBACK_MS && t <= b + VRF_COUNTER_LOOKAHEAD_MS;
    });
    const narrow = computeVrfStateCounters(buildVrfTrendPoints(fetched), a, b);
    assert.deepEqual(narrow.lanes, c.lanes, `seed ${seed} k ${k} context-independent lanes`);
    assert.deepEqual(narrow.states, c.states, `seed ${seed} k ${k} context-independent states`);
  }
}

// --- RPC-rivit → laskurit ---
{
  const rows = [
    { signal: 'compressor', transitions: 12, episodes: 13, on_ms: 7_200_000, covered_ms: 86_400_000, samples: 1440 },
    { signal: 'state:defrost', transitions: 3, episodes: 3, on_ms: '540000', covered_ms: 86_400_000, samples: 1440 },
    { signal: 'bogus', transitions: 1, episodes: 1, on_ms: 1, covered_ms: 86_400_000, samples: 1440 },
  ];
  const c = mapVrfStateCounterRows(rows, T0, T0 + 24 * H);
  assert.equal(c.source, 'server');
  assert.deepEqual(c.lanes.compressor, { transitions: 12, episodes: 13, onMs: 7_200_000 });
  assert.deepEqual(c.states.defrost, { transitions: 3, episodes: 3, onMs: 540_000 });
  assert.deepEqual(c.lanes.alarm, { transitions: 0, episodes: 0, onMs: 0 });
  assert.equal(c.coveredMs, 86_400_000);
  assert.equal(c.samples, 1440);
  assert.equal(vrfCounterAverageMs(c.lanes.compressor), 7_200_000 / 13);
  assert.equal(vrfCounterPerHour(c.lanes.compressor, c.coveredMs), 0.5);
  assert.equal(vrfCounterPerHour(c.lanes.compressor, 5 * MIN), null);
}

// --- Kestojen muotoilu ---
assert.equal(formatVrfDuration(0), '0 min');
assert.equal(formatVrfDuration(45_000), '45 s');
assert.equal(formatVrfDuration(12 * MIN), '12 min');
assert.equal(formatVrfDuration(3 * H + 5 * MIN), '3 h 05 min');
assert.equal(formatVrfDuration(2 * 24 * H + 4 * H + 10 * MIN), '2 vrk 4 h');
assert.equal(formatVrfDuration(3 * 24 * H), '3 vrk');

// --- Live-yhdistys säilyttää kontekstin välin alun edeltä ---
{
  const mk = (min) => ({ ...s(min, false), tEnd: T0 + min * MIN, samples: 1, values: {}, mins: null, maxs: null });
  const data = { startMs: T0, endMs: T0 + 60 * MIN, bucketMs: 0, source: 'raw', sampleCount: 0, points: Array.from({ length: 61 }, (_, i) => mk(i)) };
  const merged = mergeVrfTrendTail(data, [mk(60), mk(61)], T0 + 60 * MIN + 1, T0 + 40 * MIN, T0 + 61 * MIN, VRF_COUNTER_LOOKBACK_MS);
  assert.equal(merged.points[0].t, T0 + 10 * MIN);
  assert.equal(merged.sampleCount, 22);
  assert.equal(merged.counters, null);
}

console.log('vrf-state-counters: ok');
