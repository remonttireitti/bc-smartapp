import { useMemo, useState, type CSSProperties } from 'react';
import {
  VRF_BINARY_LANES,
  buildBinaryLaneFlags,
  buildBinaryLaneSegments,
  buildReadingCoverageGaps,
  formatTrendTimeLabel,
  splitReadingsByCoverageGaps,
  type VrfBinaryLaneKey,
  type VrfReading,
  type VrfTrendPeriod,
} from '../../lib/vrfMonitoring';

type Props = {
  readings: VrfReading[];
  period: VrfTrendPeriod;
  visible?: Set<VrfBinaryLaneKey>;
  onVisibleChange?: (next: Set<VrfBinaryLaneKey>) => void;
};

const DEFAULT_VISIBLE = new Set<VrfBinaryLaneKey>(['control', 'compressor', 'defrost', 'alarm', 'unit_ready']);

export default function VrfBinaryTrendChart({
  readings,
  period,
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
    const { startMs, span } = period;
    const groups = splitReadingsByCoverageGaps(readings, period);
    const noDataSegments = buildReadingCoverageGaps(readings, period);

    const lanes = VRF_BINARY_LANES.filter((lane) => visible.has(lane.key)).map((lane) => {
      const segments = groups.flatMap((group) => {
        const flags = buildBinaryLaneFlags(group, lane.key);
        return buildBinaryLaneSegments(group, flags, startMs, span);
      });
      return { ...lane, segments };
    });

    const xTicks = [period.startMs, period.startMs + span / 2, period.endMs];

    return { lanes, xTicks, noDataSegments, hasReadings: groups.length > 0 };
  }, [readings, period, visible]);

  if (chart.lanes.length === 0) {
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

      {!chart.hasReadings && (
        <p className="muted vrf-trend-empty-hint">Ei tilahistoriaa valitulla aikavälillä.</p>
      )}

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
                const left = ((tick - period.startMs) / period.span) * 100;
                return <div key={tick} className="vrf-status-timeline-vline" style={{ left: `${left}%` }} />;
              })}
            </div>

            {chart.lanes.map((lane) => (
              <div key={lane.key} className="vrf-status-timeline-row">
                <div className="vrf-status-timeline-track" aria-label={lane.label}>
                  <div className="vrf-status-timeline-rail" />
                  {chart.noDataSegments.map((segment, i) => (
                    <div
                      key={`nodata-${i}`}
                      className="vrf-status-timeline-nodata"
                      style={{
                        left: `${segment.startPct}%`,
                        width: `${segment.widthPct}%`,
                      }}
                      title="Ei tietoa"
                    >
                      {segment.widthPct >= 6 && (
                        <span className="vrf-status-timeline-nodata-label">Ei tietoa</span>
                      )}
                    </div>
                  ))}
                  {lane.segments.map((segment, i) => (
                    <div
                      key={i}
                      className="vrf-status-timeline-block"
                      style={{
                        left: `${segment.startPct}%`,
                        width: `${segment.widthPct}%`,
                        '--block-color': lane.color,
                      } as CSSProperties}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="vrf-status-timeline-times" aria-hidden="true">
          {chart.xTicks.map((tick) => (
            <span key={tick}>{formatTrendTimeLabel(tick, period.span)}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
