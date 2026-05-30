import type { TempEffectiveLimits, TempReading } from '../../lib/tempMonitoring';

type Props = {
  readings: TempReading[];
  limits?: TempEffectiveLimits | null;
  height?: number;
};

function chartPoints(readings: TempReading[], width: number, height: number, limits?: TempEffectiveLimits | null) {
  if (readings.length < 2) return null;

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

  const pad = 28;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const tempToY = (temp: number) => pad + innerH - ((temp - min) / (max - min)) * innerH;

  const points = sorted.map((row) => {
    const t = new Date(row.recorded_at).getTime();
    const x = pad + ((t - t0) / span) * innerW;
    const y = tempToY(Number(row.temp_c));
    return { x, y, temp: Number(row.temp_c) };
  });

  return { points, min, max, pad, innerW, innerH, width, height, tempToY, limits };
}

export default function TempTrendChart({ readings, limits = null, height = 220 }: Props) {
  const width = 640;
  const chart = chartPoints(readings, width, height, limits);

  if (!chart) {
    return (
      <div className="temp-chart temp-chart--empty">
        <p className="muted">Ei vielä mittausdataa.</p>
      </div>
    );
  }

  const path = chart.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const yTicks = [chart.min, (chart.min + chart.max) / 2, chart.max];
  const bandY1 = limits ? chart.tempToY(limits.acceptableMax) : null;
  const bandY2 = limits ? chart.tempToY(limits.acceptableMin) : null;
  const targetY1 = limits ? chart.tempToY(limits.targetMax) : null;
  const targetY2 = limits ? chart.tempToY(limits.targetMin) : null;

  return (
    <div className="temp-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Lämpötilatrendi">
        {limits && bandY1 != null && bandY2 != null && (
          <rect
            x={chart.pad}
            y={Math.min(bandY1, bandY2)}
            width={chart.innerW}
            height={Math.abs(bandY2 - bandY1)}
            className="temp-chart-band-acceptable"
          />
        )}
        {limits && targetY1 != null && targetY2 != null && (
          <rect
            x={chart.pad}
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
              <line x1={chart.pad} y1={y} x2={width - chart.pad} y2={y} className="temp-chart-grid" />
              <text x={4} y={y + 4} className="temp-chart-label">
                {tick.toFixed(0)}
              </text>
            </g>
          );
        })}
        <path d={path} className="temp-chart-line" fill="none" />
        {chart.points.length > 0 && (
          <circle
            cx={chart.points[chart.points.length - 1].x}
            cy={chart.points[chart.points.length - 1].y}
            r={4}
            className="temp-chart-dot"
          />
        )}
      </svg>
      <div className="temp-chart-axis">
        <span>{new Date(readings[0]?.recorded_at ?? '').toLocaleString('fi-FI')}</span>
        <span>{new Date(readings[readings.length - 1]?.recorded_at ?? '').toLocaleString('fi-FI')}</span>
      </div>
      {limits && (
        <div className="temp-chart-legend">
          <span className="temp-chart-legend-target">Toivottu {limits.targetMin}–{limits.targetMax} °C</span>
          <span className="temp-chart-legend-acceptable">
            Sallittu {limits.acceptableMin.toFixed(1)}–{limits.acceptableMax.toFixed(1)} °C
          </span>
        </div>
      )}
    </div>
  );
}
