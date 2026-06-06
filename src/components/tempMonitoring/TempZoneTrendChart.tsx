import { useCallback, useMemo, useRef, useState } from 'react';
import { formatTrendHoverTime, trendHoverLeftPct } from '../../lib/vrfMonitoring';
import type { TempEffectiveLimits, TempReading } from '../../lib/tempMonitoring';
import { formatTempC } from '../../lib/tempMonitoring';
import {
  ZONE_SENSOR_SERIES,
  downsampleZoneChartReadings,
  filterReadingsForSensor,
  fitZoneChartPeriod,
  formatZoneTrendTimeLabel,
  nearestZoneReadingAtTime,
  splitTempReadingsByGaps,
  tempReadingGapThresholdMs,
  zoneTrendChartPeriod,
  type ZoneTrendPreset,
} from '../../lib/tempZoneMonitoring';
import VrfTrendHoverTip from '../vrfMonitoring/VrfTrendHoverTip';

type Props = {
  readings: TempReading[];
  limits: TempEffectiveLimits | null;
  preset: ZoneTrendPreset;
  showBothSensors: boolean;
  activeSensor: number;
  height?: number;
};

type Point = { x: number; y: number; value: number; time: number };

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

function buildSensorPaths(
  readings: TempReading[],
  periodStartMs: number,
  span: number,
  minT: number,
  maxT: number,
  padLeft: number,
  innerW: number,
  innerH: number,
  padTop: number,
): Point[][] {
  const collapsed = downsampleZoneChartReadings(readings);
  const gapThreshold = tempReadingGapThresholdMs(collapsed, span);
  const groups = splitTempReadingsByGaps(collapsed, gapThreshold);
  const tempSpan = Math.max(maxT - minT, 1);
  const paths: Point[][] = [];

  for (const group of groups) {
    const run: Point[] = [];
    for (const row of group) {
      const time = new Date(row.recorded_at).getTime();
      const value = Number(row.temp_c);
      if (!Number.isFinite(value)) continue;
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

export default function TempZoneTrendChart({
  readings,
  limits,
  preset,
  showBothSensors,
  activeSensor,
  height = 280,
}: Props) {
  const width = 640;
  const padLeft = 44;
  const padRight = 12;
  const padTop = 12;
  const padBottom = 28;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;
  const plotRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ leftPct: number; timeMs: number; x: number } | null>(null);

  const activeSeries = useMemo(() => {
    if (showBothSensors) return ZONE_SENSOR_SERIES;
    const match = ZONE_SENSOR_SERIES.find((s) => s.sensor === activeSensor);
    return match ? [match] : [];
  }, [showBothSensors, activeSensor]);

  const chart = useMemo(() => {
    if (activeSeries.length === 0) return null;

    const basePeriod = zoneTrendChartPeriod(preset, readings, activeSensor);
    const inPeriod = readings.filter((row) => {
      const t = new Date(row.recorded_at).getTime();
      return t >= basePeriod.startMs && t <= basePeriod.endMs;
    });

    let minT = Infinity;
    let maxT = -Infinity;
    for (const series of activeSeries) {
      for (const row of filterReadingsForSensor(inPeriod, series.sensor)) {
        const value = Number(row.temp_c);
        if (!Number.isFinite(value)) continue;
        minT = Math.min(minT, value);
        maxT = Math.max(maxT, value);
      }
    }
    if (limits) {
      minT = Math.min(minT, limits.acceptableMin, limits.targetMin);
      maxT = Math.max(maxT, limits.acceptableMax, limits.targetMax);
    }

    const hasData = Number.isFinite(minT) && Number.isFinite(maxT);
    if (!hasData) {
      minT = limits ? Math.min(limits.targetMin, limits.acceptableMin) - 1 : -5;
      maxT = limits ? Math.max(limits.targetMax, limits.acceptableMax) + 1 : 10;
    } else {
      minT -= 1;
      maxT += 1;
    }

    const allTimes = activeSeries.flatMap((series) =>
      filterReadingsForSensor(inPeriod, series.sensor).map((row) =>
        new Date(row.recorded_at).getTime(),
      ),
    );
    const period = fitZoneChartPeriod(basePeriod, allTimes);
    const fittedSeriesPaths = activeSeries
      .map((series) => ({
        ...series,
        paths: buildSensorPaths(
          filterReadingsForSensor(inPeriod, series.sensor),
          period.startMs,
          period.span,
          minT,
          maxT,
          padLeft,
          innerW,
          innerH,
          padTop,
        ),
      }))
      .map((series) => ({
        ...series,
        markers: series.paths.flatMap((points) => selectTrendMarkerPoints(points)),
      }));

    return {
      minT,
      maxT,
      seriesPaths: fittedSeriesPaths,
      period,
      hasData,
      inPeriod,
    };
  }, [readings, limits, preset, activeSeries, activeSensor, innerH, innerW, padLeft, padTop]);

  const handlePlotMove = useCallback(
    (event: React.MouseEvent) => {
      const el = plotRef.current;
      if (!el || !chart) return;
      const leftPct = trendHoverLeftPct(event.clientX, el.getBoundingClientRect());
      const timeMs = chart.period.startMs + (leftPct / 100) * chart.period.span;
      const x = padLeft + ((timeMs - chart.period.startMs) / chart.period.span) * innerW;
      setHover({ leftPct, timeMs, x });
    },
    [chart, padLeft, innerW],
  );

  const handlePlotLeave = useCallback(() => setHover(null), []);

  if (!chart) {
    return (
      <div className="temp-chart temp-chart--empty">
        <p className="muted">Anturia ei valittu.</p>
      </div>
    );
  }

  const yTicks = [chart.maxT, (chart.maxT + chart.minT) / 2, chart.minT];
  const xTicks = [chart.period.startMs, chart.period.startMs + chart.period.span / 2, chart.period.endMs];
  const hasLines = chart.seriesPaths.some((series) => series.paths.length > 0);
  const tempSpan = Math.max(chart.maxT - chart.minT, 1);
  const tempToY = (temp: number) => padTop + innerH - ((temp - chart.minT) / tempSpan) * innerH;

  const targetY1 = limits ? tempToY(limits.targetMax) : null;
  const targetY2 = limits ? tempToY(limits.targetMin) : null;

  const hoverRows = hover
    ? chart.seriesPaths.map((series) => {
        const row = nearestZoneReadingAtTime(chart.inPeriod, chart.period, hover.timeMs, series.sensor);
        const value = row != null ? Number(row.temp_c) : null;
        return {
          color: series.color,
          label: series.label,
          value: value != null && Number.isFinite(value) ? formatTempC(value) : '—',
          row,
        };
      })
    : [];

  const anchorReading = hoverRows.find((row) => row.row)?.row ?? null;
  const hoverTimeLabel = anchorReading
    ? formatTrendHoverTime(anchorReading.recorded_at, chart.period.span)
    : '';

  return (
    <div className="vrf-trend-chart temp-chart temp-zone-trend-chart">
      <div className="vrf-trend-legend">
        {limits && (
          <span className="vrf-trend-legend-item temp-chart-legend-target">
            <span className="vrf-trend-legend-dot" style={{ background: 'rgba(14, 165, 233, 0.45)' }} />
            Sallittu {limits.targetMin} … {limits.targetMax} °C
          </span>
        )}
        {chart.seriesPaths.map((series) => (
          <span key={series.sensor} className="vrf-trend-legend-item">
            <span className="vrf-trend-legend-dot" style={{ background: series.color }} />
            {series.label}
          </span>
        ))}
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
        {hover && anchorReading && (
          <VrfTrendHoverTip
            leftPct={hover.leftPct}
            timeLabel={hoverTimeLabel}
            rows={hoverRows.map(({ color, label, value }) => ({ color, label, value }))}
          />
        )}
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Lämpötilatrendi" preserveAspectRatio="xMidYMid meet">
          {limits && targetY1 != null && targetY2 != null && (
            <rect
              x={padLeft}
              y={Math.min(targetY1, targetY2)}
              width={innerW}
              height={Math.abs(targetY2 - targetY1)}
              className="temp-chart-band-target"
            />
          )}
          {xTicks.map((tick) => {
            const x = padLeft + ((tick - chart.period.startMs) / chart.period.span) * innerW;
            return (
              <g key={tick}>
                <line x1={x} y1={padTop} x2={x} y2={padTop + innerH} className="temp-chart-grid" />
                <text x={x} y={height - 4} textAnchor="middle" className="temp-chart-axis">
                  {formatZoneTrendTimeLabel(tick, chart.period.span)}
                </text>
              </g>
            );
          })}
          {yTicks.map((tick) => {
            const y = padTop + innerH - ((tick - chart.minT) / tempSpan) * innerH;
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
              <g key={series.sensor}>
                {series.paths.map((points, pathIdx) =>
                  points.length >= 2 ? (
                    <path
                      key={`${series.sensor}-line-${pathIdx}`}
                      d={pathFromPoints(points)}
                      fill="none"
                      stroke={series.color}
                      strokeWidth={2}
                    />
                  ) : null,
                )}
                {series.markers.map((point, markerIdx) => (
                  <circle
                    key={`${series.sensor}-pt-${markerIdx}`}
                    className="vrf-trend-point"
                    cx={point.x}
                    cy={point.y}
                    r={series.markers.length === 1 && series.paths.every((p) => p.length === 1) ? 5.5 : 3.5}
                    fill={series.color}
                  />
                ))}
                {hover &&
                  (() => {
                    const row = nearestZoneReadingAtTime(
                      chart.inPeriod,
                      chart.period,
                      hover.timeMs,
                      series.sensor,
                    );
                    const value = row != null ? Number(row.temp_c) : null;
                    if (value == null || !Number.isFinite(value)) return null;
                    return (
                      <circle
                        key={`${series.sensor}-hover`}
                        className="vrf-trend-hover-point"
                        cx={hover.x}
                        cy={tempToY(value)}
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
