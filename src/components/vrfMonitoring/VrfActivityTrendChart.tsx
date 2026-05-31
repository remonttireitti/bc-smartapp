import { useMemo } from 'react';
import {
  VRF_ACTIVITY_TREND_LEGEND,
  VRF_ACTIVITY_TREND_META,
  buildActivityTimelineSegments,
  buildReadingCoverageGaps,
  formatTrendTimeLabel,
  splitReadingsByCoverageGaps,
  type VrfReading,
  type VrfTrendPeriod,
} from '../../lib/vrfMonitoring';

type Props = {
  readings: VrfReading[];
  period: VrfTrendPeriod;
};

export default function VrfActivityTrendChart({ readings, period }: Props) {
  const chart = useMemo(() => {
    const { startMs, span } = period;
    const groups = splitReadingsByCoverageGaps(readings, period);
    const noDataSegments = buildReadingCoverageGaps(readings, period);
    const segments = groups.flatMap((group) => buildActivityTimelineSegments(group, startMs, span));
    const xTicks = [period.startMs, period.startMs + span / 2, period.endMs];

    return { segments, xTicks, noDataSegments, hasReadings: groups.length > 0 };
  }, [readings, period]);

  return (
    <div className="vrf-status-timeline vrf-activity-timeline" role="img" aria-label="Tilatietotrendi">
      <div className="vrf-activity-legend" aria-label="Tilavärit">
        {VRF_ACTIVITY_TREND_LEGEND.map((state) => {
          const meta = VRF_ACTIVITY_TREND_META[state];
          return (
            <span key={state} className="vrf-activity-legend-item">
              <span className="vrf-status-chip-dot" style={{ background: meta.color }} />
              {meta.label}
            </span>
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
            <div className="vrf-status-timeline-label vrf-activity-timeline-label">Tilatieto</div>
          </div>

          <div className="vrf-status-timeline-track-col">
            <div className="vrf-status-timeline-vlines" aria-hidden="true">
              {chart.xTicks.map((tick) => {
                const left = ((tick - period.startMs) / period.span) * 100;
                return <div key={tick} className="vrf-status-timeline-vline" style={{ left: `${left}%` }} />;
              })}
            </div>

            <div className="vrf-status-timeline-row">
              <div className="vrf-status-timeline-track" aria-label="Tilatieto">
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
                {chart.segments.map((segment, i) => {
                  const meta = VRF_ACTIVITY_TREND_META[segment.state];
                  return (
                    <div
                      key={i}
                      className="vrf-status-timeline-block"
                      title={meta.label}
                      style={{
                        left: `${segment.startPct}%`,
                        width: `${segment.widthPct}%`,
                        background: `linear-gradient(180deg, ${meta.color} 0%, color-mix(in srgb, ${meta.color} 78%, #000) 100%)`,
                        boxShadow: `0 0 0 1px color-mix(in srgb, ${meta.color} 55%, transparent), 0 2px 10px ${meta.glow}`,
                      }}
                    />
                  );
                })}
              </div>
            </div>
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
