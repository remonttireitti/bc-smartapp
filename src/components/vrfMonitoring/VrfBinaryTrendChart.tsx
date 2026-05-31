import { useMemo, useState, type CSSProperties } from 'react';
import {
  VRF_BINARY_LANES,
  buildBinaryLaneFlags,
  buildBinaryLaneSegments,
  formatTrendTimeLabel,
  sortReadingsByTime,
  type VrfBinaryLaneKey,
  type VrfReading,
} from '../../lib/vrfMonitoring';

type Props = {
  readings: VrfReading[];
  visible?: Set<VrfBinaryLaneKey>;
  onVisibleChange?: (next: Set<VrfBinaryLaneKey>) => void;
};

const DEFAULT_VISIBLE = new Set<VrfBinaryLaneKey>(['control', 'compressor', 'defrost', 'alarm', 'unit_ready']);

export default function VrfBinaryTrendChart({
  readings,
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

    const minTime = new Date(sorted[0].recorded_at).getTime();
    const maxTime = new Date(sorted[sorted.length - 1].recorded_at).getTime();
    const span = Math.max(maxTime - minTime, 1);

    const lanes = VRF_BINARY_LANES.filter((lane) => visible.has(lane.key)).map((lane) => {
      const flags = buildBinaryLaneFlags(sorted, lane.key);
      return {
        ...lane,
        segments: buildBinaryLaneSegments(sorted, flags, minTime, span),
      };
    });

    const xTicks = [minTime, minTime + span / 2, maxTime];

    return { sorted, minTime, maxTime, span, lanes, xTicks };
  }, [readings, visible]);

  if (!chart || chart.lanes.length === 0) {
    return (
      <div className="vrf-binary-chart vrf-binary-chart--empty">
        <p className="muted">Valitse vähintään yksi tilaviiva.</p>
      </div>
    );
  }

  return (
    <div className="vrf-status-timeline" role="img" aria-label="Tilatrendi">
      <div className="vrf-status-timeline-legend" role="group" aria-label="Valitse tilat">
        {VRF_BINARY_LANES.map((lane) => {
          const on = visible.has(lane.key);
          return (
            <button
              key={lane.key}
              type="button"
              className={`vrf-status-chip ${on ? 'active' : ''}`}
              aria-pressed={on}
              style={
                on
                  ? ({
                      '--chip-color': lane.color,
                      '--chip-glow': lane.glow,
                    } as CSSProperties)
                  : undefined
              }
              onClick={() => {
                const next = new Set(visible);
                if (next.has(lane.key)) {
                  if (next.size <= 1) return;
                  next.delete(lane.key);
                } else {
                  next.add(lane.key);
                }
                setVisible(next);
              }}
            >
              <span className="vrf-status-chip-dot" style={{ background: lane.color }} />
              {lane.label}
            </button>
          );
        })}
      </div>

      <div className="vrf-status-timeline-body">
        <p className="vrf-status-timeline-axis-label">Aika →</p>

        <div className="vrf-status-timeline-matrix">
          <div className="vrf-status-timeline-label-col" aria-hidden="true">
            {chart.lanes.map((lane) => (
              <div key={lane.key} className="vrf-status-timeline-label" style={{ color: lane.color }}>
                {lane.label}
              </div>
            ))}
          </div>

          <div className="vrf-status-timeline-track-col">
            <div className="vrf-status-timeline-vlines" aria-hidden="true">
              {chart.xTicks.map((tick) => {
                const left = ((tick - chart.minTime) / chart.span) * 100;
                return <div key={tick} className="vrf-status-timeline-vline" style={{ left: `${left}%` }} />;
              })}
            </div>

            {chart.lanes.map((lane) => (
              <div key={lane.key} className="vrf-status-timeline-row">
                <div className="vrf-status-timeline-track" aria-label={lane.label}>
                  <div className="vrf-status-timeline-rail" />
                  {lane.segments.map((segment, i) => (
                    <div
                      key={i}
                      className="vrf-status-timeline-block"
                      style={{
                        left: `${segment.startPct}%`,
                        width: `${segment.widthPct}%`,
                        background: `linear-gradient(180deg, ${lane.color} 0%, color-mix(in srgb, ${lane.color} 78%, #000) 100%)`,
                        boxShadow: `0 0 0 1px color-mix(in srgb, ${lane.color} 55%, transparent), 0 2px 10px ${lane.glow}`,
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="vrf-status-timeline-times" aria-hidden="true">
          {chart.xTicks.map((tick) => (
            <span key={tick}>{formatTrendTimeLabel(tick, chart.span)}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
