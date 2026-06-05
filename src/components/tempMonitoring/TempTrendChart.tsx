import { useId, useMemo } from 'react';
import type { TempEffectiveLimits, TempReading } from '../../lib/tempMonitoring';
import {
  buildSmoothPath,
  buildTempTrendChartModel,
  buildTrendGradientStops,
  dotIndices,
  tempToStrokeColor,
} from '../../lib/tempMonitoringChart';

type Props = {
  readings: TempReading[];
  limits?: TempEffectiveLimits | null;
  height?: number;
  legendMode?: 'default' | 'zone';
  hidePathWhenSparse?: boolean;
};

export default function TempTrendChart({
  readings,
  limits = null,
  height = 220,
  legendMode = 'default',
  hidePathWhenSparse = false,
}: Props) {
  const width = 640;
  const gradientId = useId().replace(/:/g, '');
  const chart = buildTempTrendChartModel(readings, width, height, limits);

  const path = useMemo(() => (chart ? buildSmoothPath(chart.points) : ''), [chart]);
  const gradientStops = useMemo(
    () =>
      chart && limits
        ? buildTrendGradientStops(chart.points, limits, chart.padLeft, chart.innerW)
        : [],
    [chart, limits],
  );

  if (!chart) {
    return (
      <div className="vrf-trend-chart temp-chart temp-chart--empty">
        <p className="muted vrf-trend-empty-hint">Ei vielä mittausdataa valitulla aikavälillä.</p>
      </div>
    );
  }

  const yTicks = [chart.min, (chart.min + chart.max) / 2, chart.max];
  const bandY1 = limits ? chart.tempToY(limits.acceptableMax) : null;
  const bandY2 = limits ? chart.tempToY(limits.acceptableMin) : null;
  const targetY1 = limits ? chart.tempToY(limits.targetMax) : null;
  const targetY2 = limits ? chart.tempToY(limits.targetMin) : null;
  const showDots = chart.points.length <= 80;
  const visibleDots = showDots ? dotIndices(chart.points.length) : [];
  const singlePoint = chart.points.length === 1;
  const showPath = !(hidePathWhenSparse && chart.points.length < 2);

  return (
    <div className="vrf-trend-chart temp-chart">
      <div className="vrf-chart-scroll">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Lämpötilatrendi">
        {limits && gradientStops.length > 0 && (
          <defs>
            <linearGradient
              id={gradientId}
              gradientUnits="userSpaceOnUse"
              x1={chart.padLeft}
              y1={0}
              x2={chart.padLeft + chart.innerW}
              y2={0}
            >
              {gradientStops.map((stop, index) => (
                <stop
                  key={`${stop.offset}-${index}`}
                  offset={`${(stop.offset * 100).toFixed(2)}%`}
                  stopColor={stop.color}
                />
              ))}
            </linearGradient>
          </defs>
        )}
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
        {showPath && path && (
          <path
            d={path}
            className={`temp-chart-line ${limits ? 'temp-chart-line--gradient' : 'temp-chart-line--neutral'}`}
            stroke={limits ? `url(#${gradientId})` : undefined}
          />
        )}
        {visibleDots.map((index) => {
          const point = chart.points[index];
          return (
            <circle
              key={`${point.recordedAt}-${index}`}
              cx={point.x}
              cy={point.y}
              r={singlePoint ? 4 : 3}
              fill={tempToStrokeColor(point.temp, limits)}
              stroke="#fff"
              strokeWidth={1}
            />
          );
        })}
        </svg>
      </div>
      {limits ? (
        <div className="vrf-trend-legend temp-chart-legend">
          <span className="vrf-trend-legend-item temp-chart-legend-target">
            <span className="vrf-trend-legend-dot" style={{ background: 'rgba(14, 165, 233, 0.45)' }} />
            {legendMode === 'zone'
              ? `Sininen alue = sallittu ${limits.targetMin} … ${limits.targetMax} °C`
              : `Toivottu ${limits.targetMin}–${limits.targetMax} °C`}
          </span>
          <span className="vrf-trend-legend-item temp-chart-legend-in-range">
            <span className="vrf-trend-legend-dot" style={{ background: '#16a34a' }} />
            {legendMode === 'zone' ? 'Piste vihreä = ok' : 'Vihreä = alueella'}
          </span>
          <span className="vrf-trend-legend-item temp-chart-legend-deviation">
            <span className="vrf-trend-legend-dot" style={{ background: '#dc2626' }} />
            {legendMode === 'zone' ? 'Piste punainen = poikkeama' : 'Punainen = poikkeama'}
          </span>
        </div>
      ) : (
        <p className="vrf-trend-hint">Aseta tavoitealue mittauksen asetuksista nähdäksesi vihreä/punainen viiva.</p>
      )}
    </div>
  );
}
