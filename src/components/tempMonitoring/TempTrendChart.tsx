import type { TempEffectiveLimits, TempReading } from '../../lib/tempMonitoring';
import { isTempWithinLimits } from '../../lib/tempMonitoring';
import {
  buildChartLineSegments,
  buildTempTrendChartModel,
  dotIndices,
} from '../../lib/tempMonitoringChart';

type Props = {
  readings: TempReading[];
  limits?: TempEffectiveLimits | null;
  height?: number;
};

function pointClass(outOfRange: boolean, hasLimits: boolean) {
  if (!hasLimits) return 'temp-chart-point temp-chart-point--neutral';
  return outOfRange
    ? 'temp-chart-point temp-chart-point--deviation'
    : 'temp-chart-point temp-chart-point--in-range';
}

export default function TempTrendChart({ readings, limits = null, height = 220 }: Props) {
  const width = 640;
  const chart = buildTempTrendChartModel(readings, width, height, limits);

  if (!chart) {
    return (
      <div className="temp-chart temp-chart--empty">
        <p className="muted">Ei vielä mittausdataa.</p>
      </div>
    );
  }

  const segments = buildChartLineSegments(chart.points, limits);
  const yTicks = [chart.min, (chart.min + chart.max) / 2, chart.max];
  const bandY1 = limits ? chart.tempToY(limits.acceptableMax) : null;
  const bandY2 = limits ? chart.tempToY(limits.acceptableMin) : null;
  const targetY1 = limits ? chart.tempToY(limits.targetMax) : null;
  const targetY2 = limits ? chart.tempToY(limits.targetMin) : null;
  const showDots = chart.points.length <= 80;
  const visibleDots = showDots ? dotIndices(chart.points.length) : [];
  const singlePoint = chart.points.length === 1;

  return (
    <div className="temp-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Lämpötilatrendi">
        {limits && bandY1 != null && bandY2 != null && (
          <rect
            x={chart.padLeft}
            y={Math.min(bandY1, bandY2)}
            width={chart.innerW}
            height={Math.abs(bandY2 - bandY1)}
            className="temp-chart-band-acceptable"
          />
        )}
        {limits && targetY1 != null && targetY2 != null && (
          <rect
            x={chart.padLeft}
            y={Math.min(targetY1, targetY2)}
            width={chart.innerW}
            height={Math.abs(targetY2 - targetY1)}
            className="temp-chart-band-target"
          />
        )}
        {yTicks.map((tick) => {
          const y = chart.tempToY(tick);
          return (
            <g key={tick}>
              <line
                x1={chart.padLeft}
                y1={y}
                x2={width - chart.padRight}
                y2={y}
                className="temp-chart-grid"
              />
              <text x={4} y={y + 4} className="temp-chart-label">
                {tick.toFixed(0)}
              </text>
            </g>
          );
        })}
        <line
          x1={chart.padLeft}
          y1={chart.axisY}
          x2={width - chart.padRight}
          y2={chart.axisY}
          className="temp-chart-axis-line"
        />
        {chart.xTicks.map((tick, index) => (
          <g key={`${tick.x}-${index}`}>
            <line
              x1={tick.x}
              y1={chart.axisY}
              x2={tick.x}
              y2={chart.axisY + 4}
              className="temp-chart-axis-tick"
            />
            <text
              x={tick.x}
              y={chart.axisY + 16}
              className="temp-chart-axis-label"
              textAnchor={
                index === 0 ? 'start' : index === chart.xTicks.length - 1 ? 'end' : 'middle'
              }
            >
              {tick.label}
            </text>
          </g>
        ))}
        {segments.map((segment, index) => (
          <path
            key={`segment-${index}`}
            d={segment.path}
            className={`temp-chart-line temp-chart-line--${segment.variant}`}
          />
        ))}
        {visibleDots.map((index) => {
          const point = chart.points[index];
          const outOfRange = limits != null && !isTempWithinLimits(point.temp, limits);
          return (
            <circle
              key={`${point.recordedAt}-${index}`}
              cx={point.x}
              cy={point.y}
              r={singlePoint ? 4 : 3}
              className={pointClass(outOfRange, limits != null)}
            />
          );
        })}
      </svg>
      {limits ? (
        <div className="temp-chart-legend">
          <span className="temp-chart-legend-in-range">Vihreä = alueella</span>
          <span className="temp-chart-legend-deviation">Punainen = poikkeama</span>
          <span className="temp-chart-legend-target">Toivottu {limits.targetMin}–{limits.targetMax} °C</span>
        </div>
      ) : (
        <p className="temp-chart-legend muted">Aseta tavoitealue mittauksen asetuksista nähdäksesi vihreä/punainen viiva.</p>
      )}
    </div>
  );
}
