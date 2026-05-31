import { useMemo, useState } from 'react';
import {
  VRF_BINARY_LANES,
  buildBinaryLaneFlags,
  formatTrendTimeLabel,
  sortReadingsByTime,
  type VrfBinaryLaneKey,
  type VrfReading,
} from '../../lib/vrfMonitoring';

type Props = {
  readings: VrfReading[];
  height?: number;
  visible?: Set<VrfBinaryLaneKey>;
  onVisibleChange?: (next: Set<VrfBinaryLaneKey>) => void;
};

const DEFAULT_VISIBLE = new Set<VrfBinaryLaneKey>(['control', 'compressor', 'defrost', 'alarm']);

export default function VrfBinaryTrendChart({
  readings,
  height = 140,
  visible: visibleProp,
  onVisibleChange,
}: Props) {
  const [internalVisible, setInternalVisible] = useState<Set<VrfBinaryLaneKey>>(() => new Set(DEFAULT_VISIBLE));
  const visible = visibleProp ?? internalVisible;

  function setVisible(next: Set<VrfBinaryLaneKey>) {
    if (onVisibleChange) onVisibleChange(next);
    else setInternalVisible(next);
  }

  const chart = useMemo(() => {
    const sorted = sortReadingsByTime(readings);
    if (sorted.length < 2) return null;

    const times = sorted.map((r) => new Date(r.recorded_at).getTime());
    const minTime = times[0];
    const maxTime = times[times.length - 1];
    const span = Math.max(maxTime - minTime, 1);

    const lanes = VRF_BINARY_LANES.filter((lane) => visible.has(lane.key)).map((lane) => ({
      ...lane,
      flags: buildBinaryLaneFlags(sorted, lane.key),
    }));

    return { sorted, minTime, maxTime, span, lanes };
  }, [readings, visible]);

  if (!chart || chart.lanes.length === 0) {
    return (
      <div className="vrf-binary-chart vrf-binary-chart--empty">
        <p className="muted">Valitse vähintään yksi tilaviiva.</p>
      </div>
    );
  }

  const width = 640;
  const padLeft = 44;
  const padRight = 12;
  const padTop = 8;
  const padBottom = 22;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;
  const laneH = innerH / chart.lanes.length;

  const xTicks = [chart.minTime, chart.minTime + chart.span / 2, chart.maxTime];

  return (
    <div className="vrf-binary-chart">
      <div className="vrf-trend-legend">
        {VRF_BINARY_LANES.map((lane) => {
          const on = visible.has(lane.key);
          return (
            <button
              key={lane.key}
              type="button"
              className={`vrf-trend-legend-toggle ${on ? 'active' : ''}`}
              aria-pressed={on}
              onClick={() =>
                setVisible((() => {
                  const next = new Set(visible);
                  if (next.has(lane.key)) {
                    if (next.size <= 1) return visible;
                    next.delete(lane.key);
                  } else {
                    next.add(lane.key);
                  }
                  return next;
                })())
              }
            >
              <span className="vrf-trend-legend-dot" style={{ background: lane.color }} />
              {lane.label}
            </button>
          );
        })}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Tilatrendi">
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
        {chart.lanes.map((lane, laneIdx) => {
          const yBase = padTop + laneH * laneIdx;
          const blockH = Math.max(4, laneH - 10);
          const yOn = yBase + 6;
          const blocks: { x: number; w: number }[] = [];
          let startT: number | null = null;

          chart.sorted.forEach((reading, i) => {
            const on = lane.flags[i];
            const t = new Date(reading.recorded_at).getTime();
            if (on && startT == null) startT = t;
            const isLast = i === chart.sorted.length - 1;
            if ((!on || isLast) && startT != null) {
              const endT = on && isLast ? t : new Date(chart.sorted[i - 1].recorded_at).getTime();
              const x1 = padLeft + ((startT - chart.minTime) / chart.span) * innerW;
              const x2 = padLeft + ((endT - chart.minTime) / chart.span) * innerW;
              blocks.push({ x: x1, w: Math.max(2, x2 - x1 + 2) });
              startT = null;
            }
          });

          return (
            <g key={lane.key}>
              <text x={padLeft + 2} y={yBase + 11} className="vrf-binary-lane-label">
                {lane.label}
              </text>
              <line
                x1={padLeft}
                y1={yBase + laneH - 1}
                x2={padLeft + innerW}
                y2={yBase + laneH - 1}
                className="temp-chart-grid"
              />
              {blocks.map((block, i) => (
                <rect
                  key={i}
                  x={block.x}
                  y={yOn}
                  width={block.w}
                  height={blockH}
                  rx={2}
                  fill={lane.color}
                  fillOpacity={0.85}
                />
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
