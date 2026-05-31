import { useCallback, useMemo, useRef, useState } from 'react';
import {
  VRF_TREND_SERIES,
  formatTrendHoverTime,
  formatTrendTimeLabel,
  nearestReadingAtTime,
  readingGapThresholdMs,
  readingsInTrendPeriod,
  readingTemp,
  splitReadingsByCoverageGaps,
  trendHoverLeftPct,
  trendHoverTimeMs,
  type VrfReading,
  type VrfTrendPeriod,
  type VrfTrendSeriesKey,
} from '../../lib/vrfMonitoring';
import VrfTrendHoverTip from './VrfTrendHoverTip';

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

/** Valitse merkkipisteet: alku/loppu, huiput, laaksot + järkevä tiheys. */
function selectTrendMarkerPoints(points: Point[]): Point[] {
  if (points.length <= 2) return points;

  const selected = new Set<number>([0, points.length - 1]);
  const epsilon = 0.04;

  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1].value;
    const curr = points[i].value;
    const next = points[i + 1].value;
    const isPeak = curr > prev + epsilon && curr > next + epsilon;
    const isValley = curr < prev - epsilon && curr < next - epsilon;
    if (isPeak || isValley) selected.add(i);
  }

  const targetCount = Math.min(56, Math.max(10, Math.ceil(points.length / 6)));
  if (selected.size < targetCount) {
    const step = Math.max(1, Math.floor(points.length / targetCount));
    for (let i = 0; i < points.length; i += step) selected.add(i);
  }

  return [...selected]
    .sort((a, b) => a - b)
    .map((index) => points[index]);
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
  const plotRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ leftPct: number; reading: VrfReading; x: number } | null>(null);

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
    })).map((series) => ({
      ...series,
      markers: series.paths.flatMap((points) => selectTrendMarkerPoints(points)),
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

  const handlePlotMove = useCallback(
    (event: React.MouseEvent) => {
      const el = plotRef.current;
      if (!el || !chart) return;
      const leftPct = trendHoverLeftPct(event.clientX, el.getBoundingClientRect());
      const reading = nearestReadingAtTime(readings, period, trendHoverTimeMs(leftPct, period));
      if (!reading) {
        setHover(null);
        return;
      }
      const x = padLeft + ((new Date(reading.recorded_at).getTime() - chart.minTime) / chart.span) * innerW;
      setHover({ leftPct, reading, x });
    },
    [readings, period, chart, padLeft, innerW],
  );

  const handlePlotLeave = useCallback(() => setHover(null), []);

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
  const hoverRows = hover
    ? chart.seriesPaths.map((series) => {
        const value = readingTemp(hover.reading, series.key);
        return {
          color: series.color,
          label: series.label,
          value: value != null ? `${value.toFixed(1)} °C` : '—',
        };
      })
    : [];

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
      <div
        ref={plotRef}
        className="vrf-chart-scroll vrf-chart-scroll--interactive"
        onMouseMove={handlePlotMove}
        onMouseLeave={handlePlotLeave}
      >
        {hover && (
          <VrfTrendHoverTip
            leftPct={hover.leftPct}
            timeLabel={formatTrendHoverTime(hover.reading.recorded_at, chart.span)}
            rows={hoverRows}
          />
        )}
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
            chart.seriesPaths.map((series) => (
              <g key={series.key}>
                {series.paths.map((points, pathIdx) => (
                  <path
                    key={`${series.key}-line-${pathIdx}`}
                    d={pathFromPoints(points)}
                    fill="none"
                    stroke={series.color}
                    strokeWidth={2}
                  />
                ))}
                {series.markers.map((point, markerIdx) => (
                  <circle
                    key={`${series.key}-pt-${markerIdx}`}
                    className="vrf-trend-point"
                    cx={point.x}
                    cy={point.y}
                    r={3.5}
                    fill={series.color}
                  />
                ))}
                {hover &&
                  (() => {
                    const value = readingTemp(hover.reading, series.key);
                    if (value == null) return null;
                    const y =
                      padTop +
                      innerH -
                      ((value - chart.minT) / (chart.maxT - chart.minT)) * innerH;
                    return (
                      <circle
                        key={`${series.key}-hover`}
                        className="vrf-trend-hover-point"
                        cx={hover.x}
                        cy={y}
                        r={5}
                        fill={series.color}
                      />
                    );
                  })()}
              </g>
            ))}
          {hover && (
            <line
              x1={hover.x}
              y1={padTop}
              x2={hover.x}
              y2={padTop + innerH}
              className="vrf-trend-crosshair"
            />
          )}
        </svg>
      </div>
    </div>
  );
}
