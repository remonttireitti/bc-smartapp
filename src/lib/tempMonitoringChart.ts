import type { TempEffectiveLimits, TempReading } from './tempMonitoring';

export type TempChartModel = {
  points: { x: number; y: number; temp: number; recordedAt: string }[];
  min: number;
  max: number;
  padLeft: number;
  padRight: number;
  padTop: number;
  padBottom: number;
  innerW: number;
  innerH: number;
  width: number;
  height: number;
  tempToY: (temp: number) => number;
  limits: TempEffectiveLimits | null | undefined;
  xTicks: { x: number; label: string }[];
  axisY: number;
};

export function formatXTick(iso: string, spanMs: number) {
  const date = new Date(iso);
  if (spanMs <= 24 * 3_600_000) {
    return date.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
  }
  if (spanMs <= 7 * 24 * 3_600_000) {
    return date.toLocaleString('fi-FI', {
      day: 'numeric',
      month: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return date.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric', year: '2-digit' });
}

export function dotIndices(count: number) {
  if (count <= 60) return Array.from({ length: count }, (_, i) => i);
  const step = Math.ceil(count / 50);
  const indices: number[] = [];
  for (let i = 0; i < count; i += step) indices.push(i);
  if (indices[indices.length - 1] !== count - 1) indices.push(count - 1);
  return indices;
}

export type ChartPoint = { x: number; y: number; temp: number; recordedAt: string };

export type ChartLineSegment = {
  path: string;
  variant: 'in-range' | 'deviation' | 'neutral';
};

function isPointOutOfRange(temp: number, limits: TempEffectiveLimits | null | undefined) {
  if (!limits) return false;
  return temp < limits.acceptableMin || temp > limits.acceptableMax;
}

/** Catmull-Rom style cubic bezier through chart points. */
export function buildSmoothPath(points: ChartPoint[], tension = 0.35): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  }
  if (points.length === 2) {
    return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)} ${points[1].y.toFixed(1)}`;
  }

  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export function buildChartLineSegments(
  points: ChartPoint[],
  limits: TempEffectiveLimits | null | undefined,
): ChartLineSegment[] {
  if (points.length === 0) return [];
  if (!limits) {
    return [{ path: buildSmoothPath(points), variant: 'neutral' }];
  }
  if (points.length === 1) {
    return [
      {
        path: buildSmoothPath(points),
        variant: isPointOutOfRange(points[0].temp, limits) ? 'deviation' : 'in-range',
      },
    ];
  }

  const segments: ChartLineSegment[] = [];
  let start = 0;
  let currentVariant: ChartLineSegment['variant'] = isPointOutOfRange(points[0].temp, limits)
    ? 'deviation'
    : 'in-range';

  for (let i = 1; i < points.length; i++) {
    const variant: ChartLineSegment['variant'] = isPointOutOfRange(points[i].temp, limits)
      ? 'deviation'
      : 'in-range';
    if (variant !== currentVariant) {
      const slice = points.slice(start, i + 1);
      segments.push({ path: buildSmoothPath(slice), variant: currentVariant });
      start = i;
      currentVariant = variant;
    }
  }

  segments.push({
    path: buildSmoothPath(points.slice(start)),
    variant: currentVariant,
  });
  return segments;
}

export function buildTempTrendChartModel(
  readings: TempReading[],
  width: number,
  height: number,
  limits?: TempEffectiveLimits | null,
): TempChartModel | null {
  if (readings.length < 1) return null;

  const sorted = [...readings].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );

  const temps = sorted.map((r) => Number(r.temp_c));
  let min = Math.min(...temps);
  let max = Math.max(...temps);
  if (limits) {
    min = Math.min(min, limits.acceptableMin, limits.targetMin);
    max = Math.max(max, limits.acceptableMax, limits.targetMax);
  }
  if (max - min < 0.5) {
    min -= 0.5;
    max += 0.5;
  }

  const t0 = new Date(sorted[0].recorded_at).getTime();
  const t1 = new Date(sorted[sorted.length - 1].recorded_at).getTime();
  const span = Math.max(t1 - t0, 60_000);

  const padLeft = 34;
  const padRight = 10;
  const padTop = 10;
  const padBottom = 34;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const tempToY = (temp: number) => padTop + innerH - ((temp - min) / (max - min)) * innerH;
  const timeToX = (ts: number) => padLeft + ((ts - t0) / span) * innerW;

  const points = sorted.map((row) => {
    const t = new Date(row.recorded_at).getTime();
    return {
      x: timeToX(t),
      y: tempToY(Number(row.temp_c)),
      temp: Number(row.temp_c),
      recordedAt: row.recorded_at,
    };
  });

  const xTickCount = 5;
  const xTicks = Array.from({ length: xTickCount }, (_, i) => {
    const ts = t0 + (span * i) / (xTickCount - 1);
    return {
      x: timeToX(ts),
      label: formatXTick(new Date(ts).toISOString(), span),
    };
  });

  return {
    points,
    min,
    max,
    padLeft,
    padRight,
    padTop,
    padBottom,
    innerW,
    innerH,
    width,
    height,
    tempToY,
    limits,
    xTicks,
    axisY: padTop + innerH,
  };
}

export function renderTempTrendChartSvg(
  readings: TempReading[],
  limits: TempEffectiveLimits | null | undefined,
  width = 640,
  height = 220,
): string {
  const chart = buildTempTrendChartModel(readings, width, height, limits);
  if (!chart) {
    return '<p class="print-card-muted">Ei riittävästi mittausdataa trendiin.</p>';
  }

  const path = buildSmoothPath(chart.points);
  const segments = buildChartLineSegments(chart.points, limits);
  const yTicks = [chart.min, (chart.min + chart.max) / 2, chart.max];
  const bandY1 = limits ? chart.tempToY(limits.acceptableMax) : null;
  const bandY2 = limits ? chart.tempToY(limits.acceptableMin) : null;
  const targetY1 = limits ? chart.tempToY(limits.targetMax) : null;
  const targetY2 = limits ? chart.tempToY(limits.targetMin) : null;
  const visibleDots = dotIndices(chart.points.length);

  const bands = [
    limits && bandY1 != null && bandY2 != null
      ? `<rect x="${chart.padLeft}" y="${Math.min(bandY1, bandY2).toFixed(1)}" width="${chart.innerW}" height="${Math.abs(bandY2 - bandY1).toFixed(1)}" fill="rgba(34,197,94,0.12)" />`
      : '',
    limits && targetY1 != null && targetY2 != null
      ? `<rect x="${chart.padLeft}" y="${Math.min(targetY1, targetY2).toFixed(1)}" width="${chart.innerW}" height="${Math.abs(targetY2 - targetY1).toFixed(1)}" fill="rgba(14,165,233,0.18)" />`
      : '',
  ].join('');

  const grid = yTicks
    .map((tick) => {
      const y = chart.tempToY(tick);
      return `<line x1="${chart.padLeft}" y1="${y.toFixed(1)}" x2="${(chart.width - chart.padRight).toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e5e7eb" stroke-width="1" />
<text x="4" y="${(y + 4).toFixed(1)}" fill="#6b7280" font-size="11">${tick.toFixed(0)}</text>`;
    })
    .join('');

  const xAxis = [
    `<line x1="${chart.padLeft}" y1="${chart.axisY}" x2="${(chart.width - chart.padRight).toFixed(1)}" y2="${chart.axisY}" stroke="#cbd5e1" stroke-width="1" />`,
    ...chart.xTicks.map((tick, index) => {
      const anchor =
        index === 0 ? 'start' : index === chart.xTicks.length - 1 ? 'end' : 'middle';
      return `<line x1="${tick.x.toFixed(1)}" y1="${chart.axisY}" x2="${tick.x.toFixed(1)}" y2="${(chart.axisY + 4).toFixed(1)}" stroke="#6b7280" stroke-width="1" />
<text x="${tick.x.toFixed(1)}" y="${(chart.axisY + 16).toFixed(1)}" fill="#6b7280" font-size="10" text-anchor="${anchor}">${tick.label}</text>`;
    }),
  ].join('');

  const dots = visibleDots
    .map((index) => {
      const point = chart.points[index];
      const fill = limits && isPointOutOfRange(point.temp, limits) ? '#dc2626' : limits ? '#16a34a' : '#64748b';
      return `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3" fill="${fill}" stroke="#fff" stroke-width="1" />`;
    })
    .join('');

  const lines = (segments.length > 0 ? segments : [{ path, variant: 'neutral' as const }])
    .map((segment) => {
      const stroke =
        segment.variant === 'deviation'
          ? '#dc2626'
          : segment.variant === 'in-range'
            ? '#16a34a'
            : '#64748b';
      return `<path d="${segment.path}" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />`;
    })
    .join('');

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Lämpötilatrendi" style="max-width:100%;height:auto;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;">
${bands}
${grid}
${xAxis}
${lines}
${dots}
</svg>`;
}
