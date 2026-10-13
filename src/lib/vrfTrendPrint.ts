/**
 * VRF-trendin tuloste (Trendi-ikkunan "Tulosta / PDF"): täsmälleen näkyvä aikaväli, valitut viivat ja
 * tilaviivat. Hillitty A4-tyyli (huoltoRaportti/printShell): musta/harmaa, väri vain pienissä tilamerkeissä.
 * Kaaviot SVG:nä, viivat erottuvat myös mustavalkoisena (viivatyyli + selite).
 * Puhdasta logiikkaa → testattavissa (scripts/test-vrf-trend-print.mjs).
 */
import { PRINT_SHELL_CSS, renderInfoColumns, renderPrintHeader } from './huoltoRaportti/printShell';
import { VRF_ACTIVITY_TREND_META, VRF_BINARY_LANES, type VrfActivityTrendState, type VrfBinaryLaneKey } from './vrfMonitoring';
import {
  VRF_TREND_SIGNALS,
  vrfTrendCoverageGaps,
  vrfTrendGapThresholdMs,
  vrfTrendPointCoverEnd,
  visibleVrfTrendRange,
  type VrfTrendData,
  type VrfTrendPoint,
  type VrfTrendSignalKey,
} from './vrfTrendData';
import {
  buildTimeTicks,
  describeTrendResolution,
  formatSpanLabel,
  formatTrendRangeLabel,
  formatVrfNumber,
  niceScale,
} from './vrfTrendAxis';
import {
  VRF_COUNTER_STATES,
  formatVrfDuration,
  vrfCounterAverageMs,
  vrfCounterPerHour,
  type VrfCounter,
  type VrfStateCounters,
} from './vrfStateCounters';

function esc(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Mustavalkoinen viivatyyli per signaali (järjestys = VRF_TREND_SIGNALS). */
const LINE_STYLES: Record<string, { stroke: string; width: number; dash: string | null }> = {
  outdoor_c: { stroke: '#111', width: 1.6, dash: null },
  outdoor_coil_c: { stroke: '#111', width: 1.3, dash: '7 4' },
  refrigerant_supply_c: { stroke: '#777', width: 2, dash: null },
  refrigerant_return_c: { stroke: '#111', width: 1.4, dash: '1.5 3' },
  hot_gas_c: { stroke: '#555', width: 1.4, dash: '9 3 2 3' },
  refrigerant_delta_k: { stroke: '#999', width: 1.4, dash: '12 4' },
};

/** Tilatiedon harmaasävyt; hälytys punaisella (pieni tilamerkki). */
const STATE_FILL: Record<VrfActivityTrendState, string> = {
  heating: '#222',
  defrost: '#777',
  standby: '#c8c8c8',
  shutdown_wait: '#999',
  alarm: '#b42318',
  off: '#f1f1f1',
  unknown: '#fff',
};

export type VrfTrendSeriesStats = { key: VrfTrendSignalKey; min: number; avg: number; max: number };

/** Min / keskiarvo (mittauksilla painotettu) / max näkyvällä välillä. */
export function vrfTrendSeriesStats(
  points: VrfTrendPoint[],
  keys: VrfTrendSignalKey[],
  startMs: number,
  endMs: number,
): VrfTrendSeriesStats[] {
  const out: VrfTrendSeriesStats[] = [];
  const [from, to] = visibleVrfTrendRange(points, startMs, endMs);
  for (const key of keys) {
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let n = 0;
    for (let i = from; i < to; i += 1) {
      const p = points[i];
      if (p.t < startMs || p.t > endMs) continue;
      const v = p.values[key];
      if (v == null || !Number.isFinite(v)) continue;
      min = Math.min(min, p.mins?.[key] ?? v);
      max = Math.max(max, p.maxs?.[key] ?? v);
      const w = Math.max(1, p.samples);
      sum += v * w;
      n += w;
    }
    if (n > 0) out.push({ key, min, avg: sum / n, max });
  }
  return out;
}

const W = 720;
const PAD_L = 82;
const PAD_R = 46;
const INNER_W = W - PAD_L - PAD_R;

function timeAxisSvg(startMs: number, endMs: number, top: number, bottom: number): string {
  const span = Math.max(endMs - startMs, 1);
  const sx = (t: number) => PAD_L + ((t - startMs) / span) * INNER_W;
  return buildTimeTicks(startMs, endMs, 7)
    .ticks.map((tick) => {
      const x = sx(tick.t).toFixed(1);
      return `<line x1="${x}" x2="${x}" y1="${top}" y2="${bottom}" stroke="#e2e2e2" stroke-width="0.6"/>
        <text x="${x}" y="${bottom + 11}" font-size="9" text-anchor="middle" fill="#444">${esc(tick.primary)}</text>${
          tick.secondary ? `<text x="${x}" y="${bottom + 21}" font-size="8" text-anchor="middle" fill="#777">${esc(tick.secondary)}</text>` : ''
        }`;
    })
    .join('');
}

/** Lämpötilakaavio: yksi Y-akseli per yksikkö (°C vasen, K oikea). */
export function renderVrfTrendLinesSvg(
  data: VrfTrendData,
  startMs: number,
  endMs: number,
  keys: VrfTrendSignalKey[],
  axisLimits: Record<string, { min: number | null; max: number | null }> = {},
): string {
  const H = 230;
  const top = 8;
  const bottom = H - 30;
  const span = Math.max(endMs - startMs, 1);
  const sx = (t: number) => PAD_L + ((Math.min(Math.max(t, startMs), endMs) - startMs) / span) * INNER_W;
  const signals = VRF_TREND_SIGNALS.filter((s) => keys.includes(s.key));
  const units = [...new Set(signals.map((s) => s.unit))].slice(0, 2);
  // Asteikko piirrettävistä arvoista (aikaikkunoissa keskiarvot) — ääriarvot taulukossa.
  const plotted = (unit: string) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of data.points) {
      if (p.t < startMs - data.bucketMs || p.t > endMs) continue;
      for (const s of signals) {
        if (s.unit !== unit) continue;
        const v = p.values[s.key];
        if (v == null) continue;
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
    return Number.isFinite(lo) ? { lo, hi } : { lo: 0, hi: 1 };
  };
  const scales = Object.fromEntries(
    units.map((unit) => {
      const { lo, hi } = plotted(unit);
      return [unit, niceScale(lo, hi, 5, axisLimits[unit]?.min ?? null, axisLimits[unit]?.max ?? null)];
    }),
  );
  const sy = (unit: string, v: number) => {
    const s = scales[unit];
    return bottom - ((v - s.min) / (s.max - s.min || 1)) * (bottom - top);
  };

  const axes = units
    .map((unit, i) => {
      const s = scales[unit];
      const x = i === 0 ? PAD_L - 4 : W - PAD_R + 4;
      const anchor = i === 0 ? 'end' : 'start';
      return (
        s.ticks
          .map((t) => {
            const y = sy(unit, t).toFixed(1);
            return `${i === 0 ? `<line x1="${PAD_L}" x2="${W - PAD_R}" y1="${y}" y2="${y}" stroke="#e2e2e2" stroke-width="0.6"/>` : ''}<text x="${x}" y="${Number(y) + 3}" font-size="9" text-anchor="${anchor}" fill="#444">${esc(formatVrfNumber(t, s.decimals))}</text>`;
          })
          .join('') +
        `<text x="${i === 0 ? PAD_L - 30 : W - 4}" y="${top + 2}" font-size="9" text-anchor="${anchor === 'end' ? 'start' : 'end'}" fill="#444">${esc(unit)}</text>`
      );
    })
    .join('');

  const gapThreshold = vrfTrendGapThresholdMs(data.points, data.bucketMs);
  const [from, to] = visibleVrfTrendRange(data.points, startMs, endMs);
  const paths = signals
    .filter((s) => units.includes(s.unit))
    .map((signal) => {
      let d = '';
      let prevT: number | null = null;
      for (let i = from; i < to; i += 1) {
        const p = data.points[i];
        const v = p.values[signal.key];
        if (v == null || p.t < startMs - data.bucketMs || p.t > endMs) {
          prevT = null;
          continue;
        }
        const t = data.bucketMs > 0 ? p.t + data.bucketMs / 2 : p.t;
        const move = prevT == null || t - prevT > gapThreshold;
        d += `${move ? 'M' : 'L'}${sx(t).toFixed(1)} ${sy(signal.unit, v).toFixed(1)}`;
        prevT = t;
      }
      const st = LINE_STYLES[signal.key] ?? { stroke: '#111', width: 1.2, dash: null };
      return d
        ? `<path d="${d}" fill="none" stroke="${st.stroke}" stroke-width="${st.width}" stroke-linejoin="round" stroke-linecap="round"${st.dash ? ` stroke-dasharray="${st.dash}"` : ''}/>`
        : '';
    })
    .join('');

  const gaps = vrfTrendCoverageGaps(data.points, startMs, endMs, gapThreshold)
    .map(([a, b]) => `<rect x="${sx(a).toFixed(1)}" y="${top}" width="${Math.max(1, sx(b) - sx(a)).toFixed(1)}" height="${bottom - top}" fill="url(#vrfp-nodata)"/>`)
    .join('');

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Arial, Helvetica, sans-serif" role="img" aria-label="Lämpötilat">
    <defs><pattern id="vrfp-nodata" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#d0d0d0" stroke-width="1.5"/></pattern></defs>
    ${timeAxisSvg(startMs, endMs, top, bottom)}
    ${axes}
    ${gaps}
    <clipPath id="vrfp-clip"><rect x="${PAD_L}" y="${top}" width="${INNER_W}" height="${bottom - top}"/></clipPath>
    <g clip-path="url(#vrfp-clip)">${paths}</g>
    <rect x="${PAD_L}" y="${top}" width="${INNER_W}" height="${bottom - top}" fill="none" stroke="#999" stroke-width="0.6"/>
  </svg>`;
}

function lineSampleSvg(key: string): string {
  const st = LINE_STYLES[key] ?? { stroke: '#111', width: 1.2, dash: null };
  return `<svg width="30" height="8" viewBox="0 0 30 8"><line x1="1" y1="4" x2="29" y2="4" stroke="${st.stroke}" stroke-width="${st.width}" stroke-linecap="round"${st.dash ? ` stroke-dasharray="${st.dash}"` : ''}/></svg>`;
}

/** Selite ja min / keskiarvo / max samassa taulukossa (viivatyyli tunnistaa viivan). */
function lineLegendTableHtml(keys: VrfTrendSignalKey[], stats: VrfTrendSeriesStats[], bucketed: boolean): string {
  const rows = VRF_TREND_SIGNALS.filter((s) => keys.includes(s.key))
    .map((s) => {
      const st = stats.find((x) => x.key === s.key);
      const f = (v: number | undefined) => (v == null ? '—' : `${formatVrfNumber(v, s.decimals)} ${s.unit}`);
      return `<tr><th>${lineSampleSvg(s.key)} ${esc(s.label)}</th><td class="n">${esc(f(st?.min))}</td><td class="n">${esc(f(st?.avg))}</td><td class="n">${esc(f(st?.max))}</td></tr>`;
    })
    .join('');
  return `<table class="grid legend-tbl"><thead><tr><th>Viiva</th><th class="n">Min</th><th class="n">Keskiarvo</th><th class="n">Max</th></tr></thead><tbody>${rows}</tbody></table>${
    bucketed ? '<p class="foot">Kaaviossa aikaikkunoiden keskiarvot; min ja max yksittäisistä mittauksista.</p>' : ''
  }`;
}

/** Tilakaavio: Tilatieto-rivi + valitut tilaviivat (aikaikkunoissa tummuus = osuus). */
export function renderVrfTrendStatesSvg(data: VrfTrendData, startMs: number, endMs: number, lanes: VrfBinaryLaneKey[]): {
  svg: string;
  states: VrfActivityTrendState[];
} {
  const laneDefs = VRF_BINARY_LANES.filter((l) => lanes.includes(l.key));
  const rows = [{ key: 'activity', label: 'Tilatieto' }, ...laneDefs.map((l) => ({ key: l.key, label: l.label }))];
  const ROW_H = 22;
  const top = 4;
  const bottom = top + rows.length * ROW_H;
  const H = bottom + 26;
  const span = Math.max(endMs - startMs, 1);
  const sx = (t: number) => PAD_L + ((Math.min(Math.max(t, startMs), endMs) - startMs) / span) * INNER_W;
  const gapThreshold = vrfTrendGapThresholdMs(data.points, data.bucketMs);
  const typicalStep = data.bucketMs > 0 ? data.bucketMs : Math.min(gapThreshold / 3, 5 * 60_000);
  const [from, to] = visibleVrfTrendRange(data.points, startMs, endMs);
  const present = new Set<VrfActivityTrendState>();
  const rects: string[] = [];
  const rowY = (i: number) => top + i * ROW_H + 9;
  const BAR_H = 11;

  type Run = { a: number; b: number; fill: string; opacity: number } | null;
  const runs: Run[] = rows.map(() => null);
  const flush = (i: number) => {
    const r = runs[i];
    if (!r) return;
    const x = sx(r.a);
    const w = sx(r.b) - x;
    if (w > 0.2) rects.push(`<rect x="${x.toFixed(1)}" y="${rowY(i)}" width="${Math.max(w, 0.8).toFixed(1)}" height="${BAR_H}" fill="${r.fill}"${r.opacity < 1 ? ` fill-opacity="${r.opacity}"` : ''}${r.fill === '#f1f1f1' ? ' stroke="#ccc" stroke-width="0.4"' : ''}/>`);
    runs[i] = null;
  };
  const extend = (i: number, a: number, b: number, fill: string, opacity: number) => {
    const r = runs[i];
    if (r && r.fill === fill && r.opacity === opacity && Math.abs(r.b - a) < 1) r.b = b;
    else {
      flush(i);
      runs[i] = { a, b, fill, opacity };
    }
  };
  for (let p = from; p < to; p += 1) {
    const pt = data.points[p];
    const a = pt.t;
    const b = vrfTrendPointCoverEnd(data.points, p, gapThreshold, typicalStep);
    if (b < startMs || a > endMs) continue;
    present.add(pt.state);
    extend(0, a, b, STATE_FILL[pt.state], 1);
    laneDefs.forEach((lane, li) => {
      const frac = pt.lanes[lane.key];
      const level = frac <= 0 ? 0 : data.bucketMs > 0 ? Math.ceil(frac * 4) / 4 : 1;
      if (level <= 0) flush(li + 1);
      else extend(li + 1, a, b, lane.key === 'alarm' ? '#b42318' : '#333', data.bucketMs > 0 ? 0.25 + 0.75 * level : 1);
    });
  }
  rows.forEach((_, i) => flush(i));

  const labels = rows
    .map((row, i) => `<text x="${PAD_L - 4}" y="${rowY(i) + 9}" font-size="8.5" text-anchor="end" fill="#333">${esc(row.label.replace(' / sulatus', ''))}</text><line x1="${PAD_L}" x2="${W - PAD_R}" y1="${rowY(i) + BAR_H + 5}" y2="${rowY(i) + BAR_H + 5}" stroke="#eee" stroke-width="0.6"/>`)
    .join('');
  const gaps = vrfTrendCoverageGaps(data.points, startMs, endMs, gapThreshold)
    .map(([a, b]) => `<rect x="${sx(a).toFixed(1)}" y="${top}" width="${Math.max(1, sx(b) - sx(a)).toFixed(1)}" height="${bottom - top}" fill="url(#vrfp-nodata2)"/>`)
    .join('');
  const states = (Object.keys(STATE_FILL) as VrfActivityTrendState[]).filter((s) => present.has(s));
  const svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Arial, Helvetica, sans-serif" role="img" aria-label="Tilat">
    <defs><pattern id="vrfp-nodata2" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#d0d0d0" stroke-width="1.5"/></pattern></defs>
    ${timeAxisSvg(startMs, endMs, top, bottom)}
    ${labels}${rects.join('')}${gaps}
  </svg>`;
  return { svg, states };
}

function stateLegendHtml(states: VrfActivityTrendState[], hasBuckets: boolean): string {
  const items = states.map(
    (s) =>
      `<span class="lg"><i style="background:${STATE_FILL[s]}${s === 'off' ? ';border:.5px solid #bbb' : ''}"></i>${esc(VRF_ACTIVITY_TREND_META[s].label)}</span>`,
  );
  items.push('<span class="lg"><i class="nd"></i>ei mittausdataa</span>');
  if (hasBuckets) items.push('<span class="lg muted">tilaviivoissa tummuus = osuus aikaikkunasta</span>');
  return items.join('');
}

function counterRow(label: string, c: VrfCounter, coveredMs: number, mark?: string): string {
  const avg = vrfCounterAverageMs(c);
  const ph = vrfCounterPerHour(c, coveredMs);
  const share = coveredMs > 0 && c.onMs > 0 ? (c.onMs / coveredMs) * 100 : null;
  return `<tr><th>${mark ?? ''}${esc(label)}</th><td class="n">${c.transitions.toLocaleString('fi-FI')}</td><td class="n">${c.onMs > 0 ? esc(formatVrfDuration(c.onMs)) : '—'}</td><td class="n">${share != null ? `${formatVrfNumber(share, share < 10 ? 1 : 0)} %` : '—'}</td><td class="n">${avg != null ? esc(formatVrfDuration(avg)) : '—'}</td><td class="n">${ph != null ? formatVrfNumber(ph, ph === 0 ? 0 : ph < 10 ? 1 : 0) : '—'}</td></tr>`;
}

/** Laskurit-taulukko (sama rivivalinta kuin Trendi-ikkunassa). */
export function renderVrfCountersTableHtml(counters: VrfStateCounters, lanes: VrfBinaryLaneKey[], spanMs: number): string {
  const laneDefs = VRF_BINARY_LANES.filter((l) => lanes.includes(l.key));
  const states = VRF_COUNTER_STATES.filter((s) => {
    const c = counters.states[s];
    if (c.onMs <= 0 && c.episodes <= 0) return false;
    if (s === 'defrost' && lanes.includes('defrost')) return false;
    if (s === 'alarm' && lanes.includes('alarm')) {
      const lane = counters.lanes.alarm;
      if (lane.transitions === c.transitions && Math.abs(lane.onMs - c.onMs) < 60_000) return false;
    }
    return true;
  });
  const coverage = spanMs > 0 ? counters.coveredMs / spanMs : 1;
  return `<table class="grid">
    <thead><tr><th></th><th class="n">Kerrat</th><th class="n">Aika yht.</th><th class="n">Osuus</th><th class="n">Keskim. jakso</th><th class="n">Kertaa / h</th></tr></thead>
    <tbody>
      ${laneDefs.map((l) => counterRow(l.label, counters.lanes[l.key], counters.coveredMs, l.key === 'alarm' && counters.lanes.alarm.transitions > 0 ? '<span class="st-bad">● </span>' : '')).join('')}
      ${states.length ? `<tr class="grp"><th colspan="6">Tilatieto</th></tr>${states.map((s) => counterRow(VRF_ACTIVITY_TREND_META[s].label, counters.states[s], counters.coveredMs)).join('')}` : ''}
    </tbody>
  </table>
  <p class="foot">Kerrat = pois → päälle -siirtymät · osuus ja kertaa / h mittausajasta${coverage < 0.95 ? ` · mittausdataa ${esc(formatVrfDuration(counters.coveredMs))} / ${esc(formatSpanLabel(spanMs))}` : ''}</p>`;
}

const EXTRA_CSS = `
.rp .sec svg { display: block; }
.rp .legend { display: flex; flex-wrap: wrap; gap: 1mm 5mm; margin: 1mm 0 0 ${((PAD_L / W) * 100).toFixed(1)}%; font-size: 8pt; color: #333; }
.rp .lg { display: inline-flex; align-items: center; gap: 1.5mm; }
.rp .lg i { display: inline-block; width: 4mm; height: 2.5mm; }
.rp .lg i.nd { background: repeating-linear-gradient(45deg, #d0d0d0 0 1px, #fff 1px 3px); border: .5px solid #ccc; }
.rp .lg.muted { color: #777; }
.rp table.grid { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
.rp table.grid th, .rp table.grid td { padding: .9mm 1.5mm; border-bottom: .5px solid #d4d4d4; text-align: left; }
.rp table.grid thead th { font-weight: 700; color: #333; border-bottom: .8px solid #111; }
.rp table.grid tbody th { font-weight: 400; }
.rp table.grid .n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.rp table.grid tr.grp th { padding-top: 2mm; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .5px; color: #555; font-weight: 700; }
.rp table.legend-tbl { margin-top: 1.5mm; }
.rp table.legend-tbl tbody th { white-space: nowrap; }
.rp table.legend-tbl th svg { display: inline-block; vertical-align: middle; margin-right: 1.5mm; }
.rp .foot { font-size: 7.5pt; color: #666; margin: 1mm 0 0; }
.rp .gen { margin-top: 5mm; padding-top: 1.5mm; border-top: .5px solid #bbb; font-size: 7.5pt; color: #666; display: flex; justify-content: space-between; }
`;

export type VrfTrendPrintInput = {
  companyName: string;
  logoUrl?: string | null;
  siteName: string;
  /** Kohteen tiedot (asiakas, osoite…) ja laitteen tiedot (tunniste, firmware…). */
  siteRows: Array<{ label: string; value: string | null | undefined }>;
  deviceRows: Array<{ label: string; value: string | null | undefined }>;
  startMs: number;
  endMs: number;
  data: VrfTrendData;
  signals: VrfTrendSignalKey[];
  lanes: VrfBinaryLaneKey[];
  axisLimits?: Record<string, { min: number | null; max: number | null }>;
  counters: VrfStateCounters | null;
  /** Laskurit puuttuvat → syy (esim. migraatio). */
  countersNote?: string | null;
  generatedAt?: Date;
};

function kvRows(rows: Array<{ label: string; value: string | null | undefined }>): string {
  const list = rows.filter((r) => r.value != null && String(r.value).trim() !== '');
  if (!list.length) return '';
  return `<table class="kv"><tbody>${list.map((r) => `<tr><th>${esc(r.label)}</th><td>${esc(r.value)}</td></tr>`).join('')}</tbody></table>`;
}

function sampleCount(points: VrfTrendPoint[], startMs: number, endMs: number): number {
  let n = 0;
  for (const p of points) if (p.t >= startMs && p.t <= endMs) n += p.samples;
  return n;
}

export function buildVrfTrendPrintHtml(input: VrfTrendPrintInput): string {
  const { data, startMs, endMs } = input;
  const span = endMs - startMs;
  const generated = input.generatedAt ?? new Date();
  const rangeLabel = formatTrendRangeLabel(startMs, endMs);
  const title = 'VRF-trendiraportti';
  const signals = VRF_TREND_SIGNALS.filter((s) => input.signals.includes(s.key));
  const stats = vrfTrendSeriesStats(data.points, input.signals, startMs, endMs);
  const states = renderVrfTrendStatesSvg(data, startMs, endMs, input.lanes);
  const samples = sampleCount(data.points, startMs, endMs);

  const periodRows = [
    { label: 'Aikaväli', value: rangeLabel },
    { label: 'Pituus', value: formatSpanLabel(span) },
    { label: 'Tarkkuus', value: describeTrendResolution(data.bucketMs) },
    { label: 'Mittauksia', value: samples.toLocaleString('fi-FI') },
  ];

  const countersHtml = input.counters
    ? renderVrfCountersTableHtml(input.counters, input.lanes, span)
    : `<p class="foot">${esc(input.countersNote || 'Laskureita ei saatu tälle välille.')}</p>`;

  const generatedLabel = `${generated.toLocaleDateString('fi-FI')} klo ${generated.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}`;

  const body = `
  ${renderPrintHeader({ logoUrl: input.logoUrl ?? undefined, companyLine: input.companyName, title, subtitle: input.siteName })}
  <div style="margin-top:3mm">${renderInfoColumns([
    { title: 'Kohde', html: kvRows(input.siteRows) },
    { title: 'Laite', html: kvRows(input.deviceRows) },
    { title: 'Aikaväli', html: kvRows(periodRows) },
  ])}</div>
  ${
    signals.length
      ? `<section class="sec keep"><h2>Lämpötilat</h2>${renderVrfTrendLinesSvg(data, startMs, endMs, input.signals, input.axisLimits)}${lineLegendTableHtml(input.signals, stats, data.bucketMs > 0)}</section>`
      : ''
  }
  <section class="sec keep"><h2>Tilat</h2>${states.svg}<div class="legend">${stateLegendHtml(states.states, data.bucketMs > 0)}</div></section>
  <section class="sec keep"><h2>Laskurit · valitulla välillä</h2>${countersHtml}</section>
  <div class="gen"><span>${esc(input.siteName)} · ${esc(rangeLabel)}</span><span>Tulostettu ${esc(generatedLabel)}</span></div>`;

  return `<!doctype html>
<html lang="fi">
<head>
<meta charset="utf-8" />
<title>${esc(`${title} – ${input.siteName} – ${rangeLabel}`)}</title>
<style>${PRINT_SHELL_CSS}${EXTRA_CSS}
html, body { margin: 0; background: #fff; }
@page { size: A4 portrait; margin: 12mm 13mm; }
</style>
</head>
<body><div class="rp">${body}</div></body>
</html>`;
}
