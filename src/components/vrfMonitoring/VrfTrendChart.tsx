import { useMemo } from 'react';
import {
  VRF_TREND_SERIES,
  formatTrendTimeLabel,
  readingGapThresholdMs,
  readingsInTrendPeriod,
  readingTemp,
  splitReadingsByCoverageGaps,
  type VrfReading,
  type VrfTrendPeriod,
  type VrfTrendSeriesKey,
} from '../../lib/vrfMonitoring';

type Props = {
  readings: VrfReading[];
  period: VrfTrendPeriod;
  height?: number;
  visibleSeries?: Set<VrfTrendSeriesKey>;
  onVisibleSeriesChange?: (next: Set<VrfTrendSeriesKey>) => void;
};

type Point = { x: number; y: number; value: number; time: number };

const DEFAULT_TEMP_MIN = -5;
const DEFAULT_TEMP_MAX = 35;

function buildSeriesPaths(
  groups: VrfReading[][],
  key: string,
  minT: number,
  maxT: number,
  periodStartMs: number,
  span: number,
  gapThreshold: number,
  padLeft: number,
  innerW: number,
  innerH: number,
  padTop: number,
): Point[][] {
  const tempSpan = Math.max(maxT - minT, 1);
  const paths: Point[][] = [];

  for (const group of groups) {
    const rawPoints: { time: number; value: number }[] = [];
    for (const reading of group) {
      const value = readingTemp(reading, key);
      if (value == null) continue;
      rawPoints.push({ time: new Date(reading.recorded_at).getTime(), value });
    }
    if (rawPoints.length === 0) continue;

    let run: Point[] = [];
    for (let i = 0; i < rawPoints.length; i += 1) {
      const { time, value } = rawPoints[i];
      if (i > 0 && time - rawPoints[i - 1].time > gapThreshold) {
        if (run.length > 0) paths.push(run);
        run = [];
      }
      run.push({
        time,
        value,
        x: padLeft + ((time - periodStartMs) / span) * innerW,
        y: padTop + innerH - ((value - minT) / tempSpan) * innerH,
      });
    }
    if (run.length > 0) paths.push(run);
  }

  return paths;
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
  period,
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
    if (activeSeries.length === 0) return null;

    const sorted = readingsInTrendPeriod(readings, period);
    const { startMs, endMs, span } = period;
    const gapThreshold = readingGapThresholdMs(sorted, span);
    const groups = splitReadingsByCoverageGaps(readings, period);

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

    const hasData = Number.isFinite(minT) && Number.isFinite(maxT);
    if (!hasData) {
      minT = DEFAULT_TEMP_MIN;
      maxT = DEFAULT_TEMP_MAX;
    } else {
      minT -= 1;
      maxT += 1;
    }

    const seriesPaths = activeSeries.map((series) => ({
      ...series,
      paths: buildSeriesPaths(
        groups,
        series.key,
        minT,
        maxT,
        startMs,
        span,
        gapThreshold,
        padLeft,
        innerW,
        innerH,
        padTop,
      ),
    }));

    return {
      minT,
      maxT,
      seriesPaths,
      minTime: startMs,
      maxTime: endMs,
      span,
      hasData,
      pointCount: sorted.length,
    };
  }, [readings, period, innerH, innerW, padLeft, padTop, activeSeries]);

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
        <p className="muted">Valitse vähintään yksi lämpötilaviiva.</p>
      </div>
    );
  }

  const yTicks = [chart.maxT, (chart.maxT + chart.minT) / 2, chart.minT];
  const xTicks = [chart.minTime, chart.minTime + chart.span / 2, chart.maxTime];
  const interactiveLegend = visibleSeries != null && onVisibleSeriesChange != null;
  const hasLines = chart.seriesPaths.some((series) => series.paths.length > 0);

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
      {!chart.hasData && (
        <p className="muted vrf-trend-empty-hint">Ei lämpötiladataa valitulla aikavälillä.</p>
      )}
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
          {hasLines &&
            chart.seriesPaths.map((series) =>
              series.paths.map((points, pathIdx) => (
                <path
                  key={`${series.key}-${pathIdx}`}
                  d={pathFromPoints(points)}
                  fill="none"
                  stroke={series.color}
                  strokeWidth={2}
                />
              )),
            )}
        </svg>
      </div>
    </div>
  );
}
