import {
  VRF_BINARY_LANES,
  VRF_TREND_SERIES,
  buildBinaryLaneFlags,
  buildBinaryLaneSegments,
  buildReadingCoverageGaps,
  formatTrendTimeLabel,
  readingGapThresholdMs,
  readingsInTrendPeriod,
  readingTemp,
  splitReadingsByCoverageGaps,
  type VrfBinaryLaneKey,
  type VrfReading,
  type VrfTrendPeriod,
  type VrfTrendSeriesKey,
} from './vrfMonitoring';

const DEFAULT_TEMP_MIN = -5;
const DEFAULT_TEMP_MAX = 35;

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
  period: VrfTrendPeriod,
  width = 720,
  height = 240,
): string {
  const visible = new Set(visibleKeys);
  const seriesList = VRF_TREND_SERIES.filter((s) => visible.has(s.key));
  if (seriesList.length === 0) {
    return '<p class="print-card-muted">Lämpötiloja ei valittu.</p>';
  }

  const padLeft = 44;
  const padRight = 12;
  const padTop = 12;
  const padBottom = 28;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;
  const { startMs, endMs, span } = period;
  const sorted = readingsInTrendPeriod(readings, period);
  const groups = splitReadingsByCoverageGaps(readings, period);
  const gapThreshold = readingGapThresholdMs(sorted, span);

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
  const hasData = Number.isFinite(minT) && Number.isFinite(maxT);
  if (!hasData) {
    minT = DEFAULT_TEMP_MIN;
    maxT = DEFAULT_TEMP_MAX;
  } else {
    minT -= 1;
    maxT += 1;
  }
  const tempSpan = Math.max(maxT - minT, 1);

  const paths = seriesList.flatMap((series) => {
    const linePaths: string[] = [];
    for (const group of groups) {
      const rawPoints: { time: number; value: number }[] = [];
      for (const reading of group) {
        const value = readingTemp(reading, series.key);
        if (value == null) continue;
        rawPoints.push({ time: new Date(reading.recorded_at).getTime(), value });
      }
      let run: { x: number; y: number }[] = [];
      for (let i = 0; i < rawPoints.length; i += 1) {
        const { time, value } = rawPoints[i];
        if (i > 0 && time - rawPoints[i - 1].time > gapThreshold) {
          const d = pathFromPoints(run);
          if (d) linePaths.push(d);
          run = [];
        }
        run.push({
          x: padLeft + ((time - startMs) / span) * innerW,
          y: padTop + innerH - ((value - minT) / tempSpan) * innerH,
        });
      }
      const d = pathFromPoints(run);
      if (d) linePaths.push(d);
    }
    return linePaths.map((d) => ({ ...series, d }));
  });

  const xTicks = [startMs, startMs + span / 2, endMs];
  const yTicks = [maxT, (maxT + minT) / 2, minT];
  const legend = seriesList
    .map(
      (s) =>
        `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;font-size:10pt;">
          <span style="width:10px;height:10px;border-radius:50%;background:${s.color};display:inline-block;"></span>
          ${escapeSvgText(s.label)}
        </span>`,
    )
    .join('');

  const emptyNote = hasData
    ? ''
    : '<p class="print-card-muted">Ei lämpötiladataa valitulla aikavälillä.</p>';

  const grid = xTicks
    .map((tick) => {
      const x = padLeft + ((tick - startMs) / span) * innerW;
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

  return `${emptyNote}<div style="margin-bottom:3mm;">${legend}</div>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Lämpötilatrendi">
  ${grid}${yGrid}${lines}
</svg>`;
}

export function renderVrfBinaryTrendSvg(
  readings: VrfReading[],
  visibleKeys: Iterable<VrfBinaryLaneKey>,
  period: VrfTrendPeriod,
  width = 720,
  height = 160,
): string {
  const visible = new Set(visibleKeys);
  const lanes = VRF_BINARY_LANES.filter((lane) => visible.has(lane.key));
  if (lanes.length === 0) {
    return '<p class="print-card-muted">Tilatietoja ei valittu.</p>';
  }

  const padLeft = 44;
  const padRight = 12;
  const padTop = 8;
  const padBottom = 22;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;
  const { startMs, span } = period;
  const groups = splitReadingsByCoverageGaps(readings, period);
  const noDataSegments = buildReadingCoverageGaps(readings, period);
  const laneH = innerH / lanes.length;
  const xTicks = [period.startMs, period.startMs + span / 2, period.endMs];

  const grid = xTicks
    .map((tick) => {
      const x = padLeft + ((tick - startMs) / span) * innerW;
      return `<line x1="${x}" y1="${padTop}" x2="${x}" y2="${padTop + innerH}" stroke="#e5e7eb" stroke-width="1"/>
        <text x="${x}" y="${height - 4}" text-anchor="middle" font-size="9" fill="#6b7280">${escapeSvgText(formatTrendTimeLabel(tick, span))}</text>`;
    })
    .join('');

  const emptyNote =
    groups.length === 0
      ? '<p class="print-card-muted">Ei tilahistoriaa valitulla aikavälillä.</p>'
      : '';

  const laneSvg = lanes
    .map((lane, laneIdx) => {
      const yBase = padTop + laneH * laneIdx;
      const blockH = Math.max(4, laneH - 10);
      const yOn = yBase + 6;

      const noDataRects = noDataSegments
        .map((segment) => {
          const x = padLeft + (segment.startPct / 100) * innerW;
          const w = Math.max(2, (segment.widthPct / 100) * innerW);
          return `<rect x="${x}" y="${yOn}" width="${w}" height="${blockH}" rx="2" fill="#e5e7eb" stroke="#cbd5e1" stroke-dasharray="3 2"/>`;
        })
        .join('');

      const blocks = groups.flatMap((group) => {
        const flags = buildBinaryLaneFlags(group, lane.key);
        const segments = buildBinaryLaneSegments(group, flags, startMs, span);
        return segments.map((segment) => {
          const x = padLeft + (segment.startPct / 100) * innerW;
          const w = Math.max(2, (segment.widthPct / 100) * innerW);
          return `<rect x="${x}" y="${yOn}" width="${w}" height="${blockH}" rx="2" fill="${lane.color}" fill-opacity="0.85"/>`;
        });
      });

      return `<text x="${padLeft + 2}" y="${yBase + 11}" font-size="9" fill="#374151">${escapeSvgText(lane.label)}</text>
        <line x1="${padLeft}" y1="${yBase + laneH - 1}" x2="${padLeft + innerW}" y2="${yBase + laneH - 1}" stroke="#e5e7eb" stroke-width="1"/>
        ${noDataRects}${blocks.join('')}`;
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

  return `${emptyNote}<div style="margin-bottom:3mm;">${legend}</div>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Tilatrendi">
  ${grid}${laneSvg}
</svg>`;
}
