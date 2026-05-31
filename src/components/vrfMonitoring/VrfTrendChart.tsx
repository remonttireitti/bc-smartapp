import { useMemo } from 'react';
import {
  VRF_TREND_SERIES,
  formatTrendTimeLabel,
  readingTemp,
  sortReadingsByTime,
  type VrfReading,
  type VrfTrendSeriesKey,
} from '../../lib/vrfMonitoring';

type Props = {
  readings: VrfReading[];
  height?: number;
  visibleSeries?: Set<VrfTrendSeriesKey>;
  onVisibleSeriesChange?: (next: Set<VrfTrendSeriesKey>) => void;
};

type Point = { x: number; y: number; value: number; time: number };

function buildSeries(
  readings: VrfReading[],
  key: string,
  minT: number,
  maxT: number,
  minTime: number,
  span: number,
  padLeft: number,
  innerW: number,
  innerH: number,
  padTop: number,
) {
  const points: Point[] = [];
  for (const reading of readings) {
    const value = readingTemp(reading, key);
    if (value == null) continue;
    const time = new Date(reading.recorded_at).getTime();
    points.push({ time, value, x: 0, y: 0 });
  }
  if (points.length === 0) return [];

  const tempSpan = Math.max(maxT - minT, 1);

  return points.map((point) => ({
    ...point,
    x: padLeft + ((point.time - minTime) / span) * innerW,
    y: padTop + innerH - ((point.value - minT) / tempSpan) * innerH,
  }));
}

function pathFromPoints(points: Point[]) {
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

export default function VrfTrendChart({
  readings,
  height = 220,
  visibleSeries,
  onVisibleSeriesChange,
}: Props) {
  const width = 640;
  const padLeft = 44;
  const padRight = 12;
  const padTop = 12;
  const padBottom = 28;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const activeSeries = useMemo(() => {
    if (!visibleSeries) return VRF_TREND_SERIES;
    return VRF_TREND_SERIES.filter((series) => visibleSeries.has(series.key));
  }, [visibleSeries]);

  const chart = useMemo(() => {
    if (readings.length < 2 || activeSeries.length === 0) return null;
    const sorted = sortReadingsByTime(readings);
    const minTime = new Date(sorted[0].recorded_at).getTime();
    const maxTime = new Date(sorted[sorted.length - 1].recorded_at).getTime();
    const span = Math.max(maxTime - minTime, 1);
    let minT = Infinity;
    let maxT = -Infinity;
    for (const reading of sorted) {
      for (const series of activeSeries) {
        const value = readingTemp(reading, series.key);
        if (value == null) continue;
        minT = Math.min(minT, value);
        maxT = Math.max(maxT, value);
      }
    }
    if (!Number.isFinite(minT) || !Number.isFinite(maxT)) return null;
    minT -= 1;
    maxT += 1;
    const seriesPaths = activeSeries
      .map((series) => ({
        ...series,
        points: buildSeries(sorted, series.key, minT, maxT, minTime, span, padLeft, innerW, innerH, padTop),
      }))
      .filter((series) => series.points.length > 0);
    if (seriesPaths.length === 0) return null;
    return { minT, maxT, seriesPaths, minTime, maxTime, span };
  }, [readings, innerH, innerW, padLeft, padTop, activeSeries]);

  function toggleSeries(key: VrfTrendSeriesKey) {
    if (!onVisibleSeriesChange || !visibleSeries) return;
    const next = new Set(visibleSeries);
    if (next.has(key)) {
      if (next.size <= 1) return;
      next.delete(key);
    } else {
      next.add(key);
    }
    onVisibleSeriesChange(next);
  }

  if (!chart) {
    return (
      <div className="temp-chart temp-chart--empty">
        <p className="muted">
          {activeSeries.length === 0
            ? 'Valitse vähintään yksi lämpötilaviiva.'
            : 'Trendi vaatii vähintään kaksi historiapistettä.'}
        </p>
      </div>
    );
  }

  const yTicks = [chart.maxT, (chart.maxT + chart.minT) / 2, chart.minT];
  const xTicks = [chart.minTime, chart.minTime + chart.span / 2, chart.maxTime];
  const interactiveLegend = visibleSeries != null && onVisibleSeriesChange != null;

  return (
    <div className="vrf-trend-chart temp-chart">
      <div className="vrf-trend-legend">
        {VRF_TREND_SERIES.map((series) => {
          const on = visibleSeries ? visibleSeries.has(series.key) : chart.seriesPaths.some((s) => s.key === series.key);
          if (interactiveLegend) {
            return (
              <button
                key={series.key}
                type="button"
                className={`vrf-trend-legend-toggle ${on ? 'active' : ''}`}
                aria-pressed={on}
                onClick={() => toggleSeries(series.key)}
              >
                <span className="vrf-trend-legend-dot" style={{ background: series.color }} />
                {series.label}
              </button>
            );
          }
          if (!on) return null;
          return (
            <span key={series.key} className="vrf-trend-legend-item">
              <span className="vrf-trend-legend-dot" style={{ background: series.color }} />
              {series.label}
            </span>
          );
        })}
      </div>
      <div className="vrf-chart-scroll">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Lämpötilatrendi" preserveAspectRatio="xMidYMid meet">
        {xTicks.map((tick) => {
          const x = padLeft + ((tick - chart.minTime) / chart.span) * innerW;
          return (
            <g key={tick}>
              <line x1={x} y1={padTop} x2={x} y2={padTop + innerH} className="temp-chart-grid" />
              <text x={x} y={height - 4} textAnchor="middle" className="temp-chart-axis">
                {formatTrendTimeLabel(tick, chart.span)}
              </text>
            </g>
          );
        })}
        {yTicks.map((tick) => {
          const y = padTop + innerH - ((tick - chart.minT) / (chart.maxT - chart.minT)) * innerH;
          return (
            <g key={tick}>
              <line x1={padLeft} y1={y} x2={padLeft + innerW} y2={y} className="temp-chart-grid" />
              <text x={padLeft - 6} y={y + 4} textAnchor="end" className="temp-chart-axis">
                {tick.toFixed(0)}
              </text>
            </g>
          );
        })}
        {chart.seriesPaths.map((series) => (
          <path key={series.key} d={pathFromPoints(series.points)} fill="none" stroke={series.color} strokeWidth={2} />
        ))}
        </svg>
      </div>
    </div>
  );
}
