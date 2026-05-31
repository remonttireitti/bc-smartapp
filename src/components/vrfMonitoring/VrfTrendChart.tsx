import { useMemo } from 'react';
import { VRF_TREND_SERIES, readingTemp, type VrfReading } from '../../lib/vrfMonitoring';

type Props = {
  readings: VrfReading[];
  height?: number;
};

type Point = { x: number; y: number; value: number; time: number };

function buildSeries(
  readings: VrfReading[],
  key: string,
  minT: number,
  maxT: number,
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

  const minTime = points[0].time;
  const maxTime = points[points.length - 1].time;
  const span = Math.max(maxTime - minTime, 1);
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

export default function VrfTrendChart({ readings, height = 220 }: Props) {
  const width = 640;
  const padLeft = 44;
  const padRight = 12;
  const padTop = 12;
  const padBottom = 28;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const chart = useMemo(() => {
    if (readings.length < 2) return null;
    const sorted = [...readings].sort(
      (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
    );
    let minT = Infinity;
    let maxT = -Infinity;
    for (const reading of sorted) {
      for (const series of VRF_TREND_SERIES) {
        const value = readingTemp(reading, series.key);
        if (value == null) continue;
        minT = Math.min(minT, value);
        maxT = Math.max(maxT, value);
      }
    }
    if (!Number.isFinite(minT) || !Number.isFinite(maxT)) return null;
    minT -= 1;
    maxT += 1;
    const seriesPaths = VRF_TREND_SERIES.map((series) => ({
      ...series,
      points: buildSeries(sorted, series.key, minT, maxT, padLeft, innerW, innerH, padTop),
    })).filter((series) => series.points.length > 0);
    if (seriesPaths.length === 0) return null;
    return { minT, maxT, seriesPaths };
  }, [readings, innerH, innerW, padLeft, padTop]);

  if (!chart) {
    return (
      <div className="temp-chart temp-chart--empty">
        <p className="muted">Trendi vaatii vähintään kaksi historiapistettä.</p>
      </div>
    );
  }

  const yTicks = [chart.maxT, (chart.maxT + chart.minT) / 2, chart.minT];

  return (
    <div className="vrf-trend-chart temp-chart">
      <div className="vrf-trend-legend">
        {chart.seriesPaths.map((series) => (
          <span key={series.key} className="vrf-trend-legend-item">
            <span className="vrf-trend-legend-dot" style={{ background: series.color }} />
            {series.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Lämpötilatrendi">
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
  );
}
