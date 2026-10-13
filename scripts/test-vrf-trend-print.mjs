import assert from 'node:assert/strict';
import { buildVrfTrendPrintHtml, vrfTrendSeriesStats } from '../src/lib/vrfTrendPrint.ts';
import { emptyVrfStateCounters } from '../src/lib/vrfStateCounters.ts';

const H = 3_600_000;
const start = Date.UTC(2026, 9, 6, 0, 0);
const lanes = (c) => ({ control: 1, compressor: c, defrost: 0, alarm: 0, unit_ready: 1 });
const points = Array.from({ length: 12 }, (_, i) => ({
  t: start + i * H,
  tEnd: start + (i + 1) * H,
  samples: 60,
  values: { outdoor_c: i, refrigerant_supply_c: 30 + i },
  mins: { outdoor_c: i - 0.5, refrigerant_supply_c: 25 },
  maxs: { outdoor_c: i + 0.5, refrigerant_supply_c: 50 },
  lanes: lanes(i % 2),
  state: i % 2 ? 'heating' : 'standby',
}));
const data = { startMs: start, endMs: start + 12 * H, bucketMs: H, points, sampleCount: 720, source: 'server' };

const stats = vrfTrendSeriesStats(points, ['outdoor_c', 'refrigerant_supply_c'], start, start + 12 * H);
assert.deepEqual(stats[0], { key: 'outdoor_c', min: -0.5, avg: 5.5, max: 11.5 });
assert.equal(stats[1].max, 50);

const counters = emptyVrfStateCounters(start, start + 12 * H, 'server');
counters.coveredMs = 12 * H;
counters.lanes.compressor = { transitions: 6, episodes: 6, onMs: 6 * H };
const html = buildVrfTrendPrintHtml({
  companyName: 'Testi Oy',
  siteName: 'Hyrylä <VRF>',
  siteRows: [{ label: 'Asiakas', value: null }],
  deviceRows: [{ label: 'Firmware', value: '1.1.15' }],
  startMs: start,
  endMs: start + 12 * H,
  data,
  signals: ['outdoor_c', 'refrigerant_supply_c'],
  lanes: ['control', 'compressor'],
  counters,
});
assert.match(html, /VRF-trendiraportti/);
assert.match(html, /Hyrylä &lt;VRF&gt;/);
assert.doesNotMatch(html, /Asiakas/); // tyhjä rivi pois
assert.match(html, /<path d="M/); // viivat piirretty
assert.match(html, /stroke="#777" stroke-width="2"/); // mustavalkoinen erottelu (harmaa paksu)
assert.match(html, /Laskurit · valitulla välillä/);
assert.match(html, />6<\/td>/); // kompressorin käynnistykset
assert.match(html, /50 %/); // osuus
assert.match(html, /Lämmittää/);
const noCounters = buildVrfTrendPrintHtml({ companyName: 'T', siteName: 'S', siteRows: [], deviceRows: [], startMs: start, endMs: start + 12 * H, data, signals: ['outdoor_c'], lanes: [], counters: null, countersNote: 'ei laskureita' });
assert.match(noCounters, /ei laskureita/);
console.log('test-vrf-trend-print: ok');
