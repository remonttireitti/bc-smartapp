import assert from 'node:assert/strict';
import {
  inferDefrostLikely,
  resolveReadingActivityTrendState,
  buildBinaryLaneFlags,
  readingCompressorOn,
  readingHeatPermit,
  readingAlarmActive,
  readingUnitReady,
} from '../src/lib/vrfMonitoring.ts';
import {
  VRF_TREND_RAW_MAX_SPAN_MS,
  VRF_TREND_TARGET_POINTS,
  bucketVrfTrendPoints,
  buildVrfTrendPoints,
  chooseVrfTrendBucketMs,
  mapVrfTrendBucketRows,
  mergeVrfTrendTail,
  nearestVrfTrendPointIndex,
  resolveBucketActivityState,
  emptyActivityCounts,
  visibleVrfTrendRange,
  vrfLaneShare,
  vrfTrendCoverageGaps,
  vrfTrendGapThresholdMs,
  vrfTrendValueExtent,
  slimRowToReading,
} from '../src/lib/vrfTrendData.ts';
import {
  buildTimeTicks,
  describeTrendResolution,
  formatTrendPointTime,
  formatVrfValue,
  niceScale,
} from '../src/lib/vrfTrendAxis.ts';

import { makeVrfReadings } from './vrf-trend-fixtures.mjs';

process.env.TZ = process.env.TZ || 'Europe/Helsinki';

const H = 3600_000;
const D = 24 * H;

// --- Aikaikkunan valinta: ≤36 h raakadata, pidemmät ≤ 720 pistettä ---
assert.equal(chooseVrfTrendBucketMs(H), 0);
assert.equal(chooseVrfTrendBucketMs(24 * H), 0);
assert.equal(chooseVrfTrendBucketMs(VRF_TREND_RAW_MAX_SPAN_MS), 0);
assert.equal(chooseVrfTrendBucketMs(7 * D), 15 * 60_000);
assert.equal(chooseVrfTrendBucketMs(30 * D), 60 * 60_000);
assert.equal(chooseVrfTrendBucketMs(90 * D), 180 * 60_000);
for (const span of [2 * D, 3 * D, 7 * D, 14 * D, 30 * D, 60 * D, 90 * D]) {
  const b = chooseVrfTrendBucketMs(span);
  assert.ok(span / b <= VRF_TREND_TARGET_POINTS, `span ${span / D} d → ${span / b} pistettä`);
}

// --- O(n) sulatus- ja tilalaskenta = vanha (O(n²)) toteutus ---
for (const seed of [1, 2, 3, 7, 42]) {
  // ilman yli 15 min taukoja vertailu koko taulukolle on suora
  const readings = makeVrfReadings({ startMs: Date.UTC(2026, 0, 5), count: 900, seed }).map((r, i, arr) => r);
  // tasaa ajat 60 s välein, jotta taukoja ei ole (tauot nollaavat kontekstin uudessa mallissa)
  const base = Date.UTC(2026, 0, 5);
  readings.forEach((r, i) => (r.recorded_at = new Date(base + i * 60_000).toISOString()));

  const oldDefrost = readings.map((_, i) => inferDefrostLikely(readings, i));
  const newDefrost = buildBinaryLaneFlags(readings, 'defrost');
  assert.deepEqual(newDefrost, oldDefrost, `defrost seed ${seed}`);
  assert.ok(oldDefrost.some(Boolean), 'fixture sisältää sulatuksia');

  const points = buildVrfTrendPoints(readings);
  assert.equal(points.length, readings.length);
  points.forEach((p, i) => {
    assert.equal(p.lanes.defrost, oldDefrost[i] ? 1 : 0);
    assert.equal(p.lanes.control, readingHeatPermit(readings[i]) ? 1 : 0);
    assert.equal(p.lanes.compressor, readingCompressorOn(readings[i]) ? 1 : 0);
    assert.equal(p.lanes.alarm, readingAlarmActive(readings[i]) ? 1 : 0);
    assert.equal(p.lanes.unit_ready, readingUnitReady(readings[i]) ? 1 : 0);
    assert.equal(p.state, resolveReadingActivityTrendState(readings, i), `state ${seed}/${i}`);
  });
}

// --- Kevyt select → sama tulkinta kuin täysi payload ---
{
  const readings = makeVrfReadings({ startMs: Date.UTC(2026, 1, 1), count: 600, seed: 9 });
  const slim = readings.map((r) =>
    slimRowToReading({
      id: r.id,
      device_id: r.device_id,
      recorded_at: r.recorded_at,
      heat_enabled: r.heat_enabled,
      any_alarm: r.any_alarm,
      temperatures: r.payload.temperatures,
      control_enabled: r.payload.control?.enabled ?? null,
      st_shutdown: r.payload.status?.alarm_shutdown_active ?? null,
      st_compressor: r.payload.status?.compressor_likely_running ?? null,
      digital_inputs: r.payload.digital_inputs ?? null,
      alarms: r.payload.alarms ?? null,
      defrost_active: r.payload.defrost?.active ?? null,
      diag_bus: r.payload.diagnostics?.di_bus_energized ?? null,
      s_di3: r.payload.settings?.di3_trigger_raw_level ?? null,
      s_alarm_in: r.payload.settings?.alarm_input_trigger_raw_level ?? null,
      s_di3_shutdown: r.payload.settings?.di3_alarm_shutdown_enabled ?? null,
    }),
  );
  assert.deepEqual(buildVrfTrendPoints(slim), buildVrfTrendPoints(readings));
}

// --- Aikaikkunat: keskiarvo/min/max ja osuudet ---
{
  const readings = makeVrfReadings({ startMs: Date.UTC(2026, 2, 1), count: 3000, seed: 5 });
  const points = buildVrfTrendPoints(readings);
  const bucketMs = 15 * 60_000;
  const buckets = bucketVrfTrendPoints(points, bucketMs);
  assert.ok(buckets.length < points.length / 5);
  assert.equal(
    buckets.reduce((s, b) => s + b.samples, 0),
    points.length,
  );
  for (const b of buckets) {
    assert.equal(b.t % bucketMs, 0);
    assert.equal(b.tEnd - b.t, bucketMs);
    const inside = points.filter((p) => p.t >= b.t && p.t < b.tEnd);
    assert.equal(inside.length, b.samples);
    const vals = inside.map((p) => p.values.outdoor_c).filter((v) => v != null);
    if (vals.length) {
      const avg = vals.reduce((a, v) => a + v, 0) / vals.length;
      assert.ok(Math.abs(b.values.outdoor_c - avg) < 1e-9);
      assert.equal(b.mins.outdoor_c, Math.min(...vals));
      assert.equal(b.maxs.outdoor_c, Math.max(...vals));
    }
    const comp = inside.filter((p) => p.lanes.compressor === 1).length / inside.length;
    assert.ok(Math.abs(b.lanes.compressor - comp) < 1e-9);
    for (const k of Object.keys(b.lanes)) assert.ok(b.lanes[k] >= 0 && b.lanes[k] <= 1);
  }
  // delta = meno - paluu
  const p = points.find((x) => x.values.refrigerant_supply_c != null && x.values.refrigerant_return_c != null);
  assert.ok(Math.abs(p.values.refrigerant_delta_k - (p.values.refrigerant_supply_c - p.values.refrigerant_return_c)) < 1e-9);

  // binäärihaku
  const idx = nearestVrfTrendPointIndex(points, points[100].t + 1000);
  assert.equal(idx, 100);
  assert.equal(nearestVrfTrendPointIndex(points, 0), 0);
  assert.equal(nearestVrfTrendPointIndex(points, Number.MAX_SAFE_INTEGER), points.length - 1);
  const bIdx = nearestVrfTrendPointIndex(buckets, buckets[5].t + bucketMs / 2 + 1);
  assert.equal(bIdx, 5, 'aikaikkunan sisällä osuu samaan ikkunaan');

  const [from, to] = visibleVrfTrendRange(points, points[200].t, points[300].t);
  assert.ok(from <= 200 && to >= 301);

  const extent = vrfTrendValueExtent(buckets, ['outdoor_c'], buckets[0].t, buckets.at(-1).tEnd);
  assert.ok(extent && extent.min <= extent.max);

  const share = vrfLaneShare(points, 'compressor', points[0].t, points.at(-1).t);
  assert.ok(share > 0 && share < 1);
}

// --- Tauot ---
{
  const t0 = Date.UTC(2026, 3, 1);
  const mk = (t) => ({ t, tEnd: t, samples: 1, values: { outdoor_c: 1 }, mins: null, maxs: null, lanes: { control: 1, compressor: 0, defrost: 0, alarm: 0, unit_ready: 0 }, state: 'standby' });
  const pts = [];
  for (let i = 0; i < 60; i += 1) pts.push(mk(t0 + i * 60_000));
  for (let i = 0; i < 60; i += 1) pts.push(mk(t0 + 3 * H + i * 60_000));
  const thr = vrfTrendGapThresholdMs(pts, 0);
  assert.equal(thr, 15 * 60_000);
  const gaps = vrfTrendCoverageGaps(pts, t0, t0 + 6 * H, thr);
  assert.equal(gaps.length, 2);
  assert.deepEqual(gaps[0], [t0 + 59 * 60_000, t0 + 3 * H]);
  assert.equal(gaps[1][1], t0 + 6 * H);
  assert.deepEqual(vrfTrendCoverageGaps([], 0, 10, thr), [[0, 10]]);
}

// --- Live-päivityksen yhdistys liu'uttaa ikkunaa ---
{
  const t0 = Date.UTC(2026, 4, 1);
  const mk = (t) => ({ t, tEnd: t, samples: 1, values: {}, mins: null, maxs: null, lanes: { control: 0, compressor: 0, defrost: 0, alarm: 0, unit_ready: 0 }, state: 'off' });
  const data = { startMs: t0, endMs: t0 + 10 * 60_000, bucketMs: 0, source: 'raw', sampleCount: 11, points: Array.from({ length: 11 }, (_, i) => mk(t0 + i * 60_000)) };
  const tail = [mk(t0 + 8 * 60_000), mk(t0 + 10 * 60_000), mk(t0 + 11 * 60_000), mk(t0 + 12 * 60_000)];
  const merged = mergeVrfTrendTail(data, tail, t0 + 10 * 60_000 + 1, t0 + 2 * 60_000, t0 + 12 * 60_000);
  assert.deepEqual(merged.points.map((p) => (p.t - t0) / 60_000), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(merged.sampleCount, 11);
}

// --- RPC-rivit → pisteet ---
{
  const rows = [
    { bucket_start: '2026-05-01T10:00:00+00:00', samples: 60, outdoor_avg: -2.5, outdoor_min: -3, outdoor_max: -2, coil_avg: null, coil_min: null, coil_max: null, supply_avg: 30, supply_min: 29, supply_max: 31, return_avg: 25, return_min: 24, return_max: 26, hot_gas_avg: 70, hot_gas_min: 65, hot_gas_max: 75, delta_avg: 5, delta_min: 4, delta_max: 6, permit_on: 60, compressor_on: 30, defrost_on: 3, alarm_on: 0, unit_ready_on: 60, st_heating: 27, st_standby: 30, st_defrost: 3, st_off: 0, st_shutdown_wait: 0, st_alarm: 0 },
  ];
  const [p] = mapVrfTrendBucketRows(rows, H);
  assert.equal(p.t, Date.parse('2026-05-01T10:00:00Z'));
  assert.equal(p.tEnd - p.t, H);
  assert.equal(p.values.outdoor_c, -2.5);
  assert.equal(p.values.outdoor_coil_c, undefined);
  assert.equal(p.values.refrigerant_delta_k, 5);
  assert.equal(p.lanes.compressor, 0.5);
  assert.equal(p.lanes.defrost, 0.05);
  assert.equal(p.state, 'standby');
}

// --- Aikaikkunan tila: hälytys näkyy aina, muuten yleisin ---
{
  const c = emptyActivityCounts();
  c.heating = 50; c.standby = 10; c.defrost = 5;
  assert.equal(resolveBucketActivityState(c), 'heating');
  c.alarm = 1;
  assert.equal(resolveBucketActivityState(c), 'alarm');
  c.shutdown_wait = 1;
  assert.equal(resolveBucketActivityState(c), 'shutdown_wait');
  assert.equal(resolveBucketActivityState(emptyActivityCounts()), 'unknown');
}

// --- Y-akseli: siistit tikit ja desimaalit ---
{
  const s = niceScale(-3.2, 41.7, 5);
  assert.deepEqual(s.ticks, [-10, 0, 10, 20, 30, 40, 50].filter((v) => v >= s.min && v <= s.max));
  assert.ok(s.min <= -3.2 && s.max >= 41.7);
  assert.equal(s.decimals, 0);
  const small = niceScale(20.1, 21.3, 5);
  assert.equal(small.step, 0.5);
  assert.equal(small.decimals, 1);
  const tiny = niceScale(1.02, 1.08, 5);
  assert.equal(tiny.decimals, 2);
  const flat = niceScale(5, 5, 5);
  assert.ok(flat.min < 5 && flat.max > 5);
  const fixed = niceScale(-3, 40, 5, -10, 30);
  assert.equal(fixed.min, -10);
  assert.equal(fixed.max, 30);
  assert.ok(fixed.ticks.every((v) => v >= -10 && v <= 30));
  const odd = niceScale(-3, 40, 4, -10, 50);
  assert.ok(odd.ticks.includes(-10) && odd.ticks.includes(50), 'käsin asetetut rajat näkyvät tikkeinä');
  assert.equal(formatVrfValue(12.345, '°C', 1), '12,3 °C');
  assert.equal(formatVrfValue(null, '°C', 1), '—');
  assert.match(formatVrfValue(-1.5, 'K', 1), /^[−-]1,5 K$/);
}

// --- X-akseli: aikavälin mukaan HH:mm / päivämäärät, paikallinen aika ---
{
  const start = new Date(2026, 8, 30, 13, 7).getTime(); // ke 30.9.2026 13:07 paikallista
  const oneHour = buildTimeTicks(start, start + H, 6);
  assert.equal(oneHour.stepMs, 10 * 60_000);
  assert.deepEqual(oneHour.ticks.map((t) => t.primary), ['13:10', '13:20', '13:30', '13:40', '13:50', '14:00']);
  assert.ok(oneHour.ticks.every((t) => t.secondary === null));

  const day = buildTimeTicks(start, start + 24 * H, 7);
  assert.equal(day.stepMs, 6 * H);
  assert.deepEqual(day.ticks.map((t) => t.primary), ['18:00', '00:00', '06:00', '12:00']);
  assert.equal(day.ticks[0].secondary, 'ke 30.9.');
  assert.equal(day.ticks[1].secondary, 'to 1.10.');
  assert.equal(day.ticks[2].secondary, null);

  const week = buildTimeTicks(start, start + 7 * D, 8);
  assert.equal(week.stepMs, D);
  assert.equal(week.ticks[0].primary, 'to 1.10.');
  assert.equal(week.ticks.length, 7);

  const quarter = buildTimeTicks(start, start + 90 * D, 8);
  assert.equal(quarter.stepMs, 14 * D);
  assert.ok(quarter.ticks.every((t) => new Date(t.t).getDay() === 1), 'viikkoaskeleet maanantaille');
  assert.ok(!quarter.ticks[0].primary.includes('ma'));

  // Kesäaika → talviaika (25.10.2026): tikit pysyvät tasatunneissa
  const dst = buildTimeTicks(new Date(2026, 9, 24, 12, 0).getTime(), new Date(2026, 9, 26, 12, 0).getTime(), 8);
  assert.ok(dst.ticks.every((t) => new Date(t.t).getMinutes() === 0 && new Date(t.t).getHours() % 6 === 0));

  assert.equal(formatTrendPointTime(start, start, H), 'ke 30.9.2026 klo 13:07:00');
  const b0 = new Date(2026, 8, 30, 14, 0).getTime();
  assert.equal(formatTrendPointTime(b0, b0 + H, 30 * D), 'ke 30.9. 14:00–15:00');
  assert.equal(describeTrendResolution(0), 'jokainen mittaus');
  assert.equal(describeTrendResolution(15 * 60_000), '15 min keskiarvot');
  assert.equal(describeTrendResolution(3 * H), '3 h keskiarvot');
}

console.log('test-vrf-trend-data: OK');
