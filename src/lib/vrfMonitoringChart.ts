import {
  VRF_BINARY_LANES,
  VRF_TREND_SERIES,
  buildBinaryLaneFlags,
  formatTrendTimeLabel,
  readingTemp,
  sortReadingsByTime,
  type VrfBinaryLaneKey,
  type VrfReading,
  type VrfTrendSeriesKey,
} from './vrfMonitoring';

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pathFromPoints(points: { x: number; y: number }[]) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const cx = (prev.x + curr.x) / 2;
    d += ` C ${cx} ${prev.y}, ${cx} ${curr.y}, ${curr.x} ${curr.y}`;
  }
  return d;
}

export function renderVrfTrendChartSvg(
  readings: VrfReading[],
  visibleKeys: Iterable<VrfTrendSeriesKey>,
  width = 720,
  height = 240,
): string {
  const visible = new Set(visibleKeys);
  const seriesList = VRF_TREND_SERIES.filter((s) => visible.has(s.key));
  const sorted = sortReadingsByTime(readings);
  if (sorted.length < 2 || seriesList.length === 0) {
    return '<p class="print-card-muted">Ei tarpeeksi dataa lämpötilatrendiin.</p>';
  }

  const padLeft = 44;
  const padRight = 12;
  const padTop = 12;
  const padBottom = 28;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;
  const minTime = new Date(sorted[0].recorded_at).getTime();
  const maxTime = new Date(sorted[sorted.length - 1].recorded_at).getTime();
  const span = Math.max(maxTime - minTime, 1);

  let minT = Infinity;
  let maxT = -Infinity;
  for (const reading of sorted) {
    for (const series of seriesList) {
      const value = readingTemp(reading, series.key);
      if (value == null) continue;
      minT = Math.min(minT, value);
      maxT = Math.max(maxT, value);
    }
  }
  if (!Number.isFinite(minT) || !Number.isFinite(maxT)) {
    return '<p class="print-card-muted">Ei lämpötiladataa valitulla aikavälillä.</p>';
  }
  minT -= 1;
  maxT += 1;
  const tempSpan = Math.max(maxT - minT, 1);

  const paths = seriesList
    .map((series) => {
      const points: { x: number; y: number }[] = [];
      for (const reading of sorted) {
        const value = readingTemp(reading, series.key);
        if (value == null) continue;
        const time = new Date(reading.recorded_at).getTime();
        points.push({
          x: padLeft + ((time - minTime) / span) * innerW,
          y: padTop + innerH - ((value - minT) / tempSpan) * innerH,
        });
      }
      return { ...series, d: pathFromPoints(points) };
    })
    .filter((series) => series.d.length > 0);

  const xTicks = [minTime, minTime + span / 2, maxTime];
  const yTicks = [maxT, (maxT + minT) / 2, minT];
  const legend = paths
    .map(
      (s) =>
        `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;font-size:10pt;">
          <span style="width:10px;height:10px;border-radius:50%;background:${s.color};display:inline-block;"></span>
          ${escapeSvgText(s.label)}
        </span>`,
    )
    .join('');

  const grid = xTicks
    .map((tick) => {
      const x = padLeft + ((tick - minTime) / span) * innerW;
      return `<line x1="${x}" y1="${padTop}" x2="${x}" y2="${padTop + innerH}" stroke="#e5e7eb" stroke-width="1"/>
        <text x="${x}" y="${height - 4}" text-anchor="middle" font-size="9" fill="#6b7280">${escapeSvgText(formatTrendTimeLabel(tick, span))}</text>`;
    })
    .join('');

  const yGrid = yTicks
    .map((tick) => {
      const y = padTop + innerH - ((tick - minT) / tempSpan) * innerH;
      return `<line x1="${padLeft}" y1="${y}" x2="${padLeft + innerW}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>
        <text x="${padLeft - 6}" y="${y + 4}" text-anchor="end" font-size="9" fill="#6b7280">${tick.toFixed(0)}</text>`;
    })
    .join('');

  const lines = paths
    .map((s) => `<path d="${s.d}" fill="none" stroke="${s.color}" stroke-width="2"/>`)
    .join('');

  return `<div style="margin-bottom:3mm;">${legend}</div>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Lämpötilatrendi">
  ${grid}${yGrid}${lines}
</svg>`;
}

export function renderVrfBinaryTrendSvg(
  readings: VrfReading[],
  visibleKeys: Iterable<VrfBinaryLaneKey>,
  width = 720,
  height = 160,
): string {
  const visible = new Set(visibleKeys);
  const lanes = VRF_BINARY_LANES.filter((lane) => visible.has(lane.key));
  const sorted = sortReadingsByTime(readings);
  if (sorted.length < 2 || lanes.length === 0) {
    return '<p class="print-card-muted">Ei tarpeeksi dataa tilatrendiin.</p>';
  }

  const padLeft = 44;
  const padRight = 12;
  const padTop = 8;
  const padBottom = 22;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;
  const minTime = new Date(sorted[0].recorded_at).getTime();
  const maxTime = new Date(sorted[sorted.length - 1].recorded_at).getTime();
  const span = Math.max(maxTime - minTime, 1);
  const laneH = innerH / lanes.length;
  const xTicks = [minTime, minTime + span / 2, maxTime];

  const grid = xTicks
    .map((tick) => {
      const x = padLeft + ((tick - minTime) / span) * innerW;
      return `<line x1="${x}" y1="${padTop}" x2="${x}" y2="${padTop + innerH}" stroke="#e5e7eb" stroke-width="1"/>
        <text x="${x}" y="${height - 4}" text-anchor="middle" font-size="9" fill="#6b7280">${escapeSvgText(formatTrendTimeLabel(tick, span))}</text>`;
    })
    .join('');

  const laneSvg = lanes
    .map((lane, laneIdx) => {
      const flags = buildBinaryLaneFlags(sorted, lane.key);
      const yBase = padTop + laneH * laneIdx;
      const blockH = Math.max(4, laneH - 10);
      const yOn = yBase + 6;
      const blocks: { x: number; w: number }[] = [];
      let startT: number | null = null;

      sorted.forEach((reading, i) => {
        const on = flags[i];
        const t = new Date(reading.recorded_at).getTime();
        if (on && startT == null) startT = t;
        const isLast = i === sorted.length - 1;
        if ((!on || isLast) && startT != null) {
          const endT = on && isLast ? t : new Date(sorted[i - 1].recorded_at).getTime();
          const x1 = padLeft + ((startT - minTime) / span) * innerW;
          const x2 = padLeft + ((endT - minTime) / span) * innerW;
          blocks.push({ x: x1, w: Math.max(2, x2 - x1 + 2) });
          startT = null;
        }
      });

      const rects = blocks
        .map(
          (block) =>
            `<rect x="${block.x}" y="${yOn}" width="${block.w}" height="${blockH}" rx="2" fill="${lane.color}" fill-opacity="0.85"/>`,
        )
        .join('');

      return `<text x="${padLeft + 2}" y="${yBase + 11}" font-size="9" fill="#374151">${escapeSvgText(lane.label)}</text>
        <line x1="${padLeft}" y1="${yBase + laneH - 1}" x2="${padLeft + innerW}" y2="${yBase + laneH - 1}" stroke="#e5e7eb" stroke-width="1"/>
        ${rects}`;
    })
    .join('');

  const legend = lanes
    .map(
      (lane) =>
        `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;font-size:10pt;">
          <span style="width:10px;height:10px;border-radius:50%;background:${lane.color};display:inline-block;"></span>
          ${escapeSvgText(lane.label)}
        </span>`,
    )
    .join('');

  return `<div style="margin-bottom:3mm;">${legend}</div>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Tilatrendi">
  ${grid}${laneSvg}
</svg>`;
}
