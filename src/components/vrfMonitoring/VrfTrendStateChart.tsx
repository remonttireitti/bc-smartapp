import { useMemo, useRef } from 'react';
import { useElementWidth } from '../../hooks/useElementWidth';
import { VRF_ACTIVITY_TREND_META, VRF_BINARY_LANES, type VrfActivityTrendState, type VrfBinaryLaneKey } from '../../lib/vrfMonitoring';
import { buildTimeTicks, formatTrendPointTime, formatVrfNumber } from '../../lib/vrfTrendAxis';
import {
  nearestVrfTrendPointIndex,
  visibleVrfTrendRange,
  vrfLaneShare,
  vrfTrendCoverageGaps,
  vrfTrendGapThresholdMs,
  vrfTrendPointCoverEnd,
  type VrfTrendData,
} from '../../lib/vrfTrendData';
import VrfTrendHoverTip from './VrfTrendHoverTip';
import { useVrfTrendPointer, type VrfTrendViewport } from './useVrfTrendPointer';

type Props = {
  data: VrfTrendData | null;
  viewport: VrfTrendViewport;
  lanes: VrfBinaryLaneKey[];
  hoverT: number | null;
  onHoverT: (t: number | null) => void;
  onZoom: (startMs: number, endMs: number) => void;
  onResetZoom?: () => void;
  padLeft: number;
  padRight: number;
  /** Osuus % viivojen vasemmalla — pois kun Laskurit-taulukko näyttää sen. */
  showShares?: boolean;
};

const ROW_H = 30;
const BAR_H = 13;
const LABEL_GAP = 13;
const PAD_TOP = 4;
const PAD_BOTTOM = 4;

type Rect = { x: number; w: number; color: string; opacity: number; title: string };

function pct(v: number) {
  return `${formatVrfNumber(v * 100, v > 0 && v < 0.1 ? 1 : 0)} %`;
}

export default function VrfTrendStateChart({
  data,
  viewport,
  lanes,
  hoverT,
  onHoverT,
  onZoom,
  onResetZoom,
  padLeft,
  padRight,
  showShares = true,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const width = Math.max(280, useElementWidth(wrapRef));
  const innerW = Math.max(10, width - padLeft - padRight);
  const laneDefs = useMemo(() => VRF_BINARY_LANES.filter((l) => lanes.includes(l.key)), [lanes]);
  const rowCount = 1 + laneDefs.length;
  const height = PAD_TOP + rowCount * ROW_H + PAD_BOTTOM;
  const span = Math.max(viewport.endMs - viewport.startMs, 1);

  const pointer = useVrfTrendPointer({ padLeft, innerW, viewport, onHoverT, onZoom, onResetZoom });

  const chart = useMemo(() => {
    const points = data?.points ?? [];
    const bucketMs = data?.bucketMs ?? 0;
    const sx = (t: number) => padLeft + ((Math.min(Math.max(t, viewport.startMs), viewport.endMs) - viewport.startMs) / span) * innerW;
    const gapThreshold = vrfTrendGapThresholdMs(points, bucketMs);
    const typicalStep = bucketMs > 0 ? bucketMs : Math.min(gapThreshold / 3, 5 * 60_000);
    const [from, to] = visibleVrfTrendRange(points, viewport.startMs, viewport.endMs);

    const activity: Rect[] = [];
    const statesPresent = new Set<VrfActivityTrendState>();
    const laneRects: Record<string, Rect[]> = {};
    for (const lane of laneDefs) laneRects[lane.key] = [];

    let actRun: { state: VrfActivityTrendState; a: number; b: number } | null = null;
    const laneRun: Record<string, { level: number; a: number; b: number } | null> = {};

    const flushAct = () => {
      if (!actRun) return;
      const meta = VRF_ACTIVITY_TREND_META[actRun.state];
      const x = sx(actRun.a);
      const w = sx(actRun.b) - x;
      if (w > 0.2) activity.push({ x, w: Math.max(w, 0.8), color: meta.color, opacity: 1, title: meta.label });
      actRun = null;
    };
    const flushLane = (key: string, color: string, label: string) => {
      const run = laneRun[key];
      if (!run) return;
      const x = sx(run.a);
      const w = sx(run.b) - x;
      if (w > 0.2) {
        laneRects[key].push({
          x,
          w: Math.max(w, 0.8),
          color,
          opacity: bucketMs > 0 ? 0.25 + 0.75 * run.level : 1,
          title: label,
        });
      }
      laneRun[key] = null;
    };

    for (let i = from; i < to; i += 1) {
      const p = points[i];
      const a = p.t;
      const b = vrfTrendPointCoverEnd(points, i, gapThreshold, typicalStep);
      if (b < viewport.startMs || a > viewport.endMs) continue;
      statesPresent.add(p.state);
      if (actRun && actRun.state === p.state && Math.abs(actRun.b - a) < 1) actRun.b = b;
      else {
        flushAct();
        actRun = { state: p.state, a, b };
      }
      for (const lane of laneDefs) {
        const frac = p.lanes[lane.key];
        const level = frac <= 0 ? 0 : bucketMs > 0 ? Math.ceil(frac * 4) / 4 : 1;
        const run = laneRun[lane.key];
        if (level > 0 && run && run.level === level && Math.abs(run.b - a) < 1) run.b = b;
        else {
          flushLane(lane.key, lane.color, lane.label);
          if (level > 0) laneRun[lane.key] = { level, a, b };
        }
      }
    }
    flushAct();
    for (const lane of laneDefs) flushLane(lane.key, lane.color, lane.label);

    const gaps = vrfTrendCoverageGaps(points, viewport.startMs, viewport.endMs, gapThreshold).map(([a, b]) => ({
      x: sx(a),
      w: Math.max(1, sx(b) - sx(a)),
    }));
    const shares = Object.fromEntries(
      laneDefs.map((lane) => [lane.key, vrfLaneShare(points, lane.key, viewport.startMs, viewport.endMs)]),
    ) as Record<string, number | null>;
    const timeTicks = buildTimeTicks(viewport.startMs, viewport.endMs, Math.max(2, Math.floor(innerW / 95))).ticks;
    return { activity, laneRects, gaps, shares, statesPresent, timeTicks };
  }, [data, viewport.startMs, viewport.endMs, laneDefs, padLeft, innerW, span]);

  const hover = useMemo(() => {
    if (hoverT == null || !data || data.points.length === 0) return null;
    const idx = nearestVrfTrendPointIndex(data.points, hoverT);
    const p = data.points[idx];
    if (!p) return null;
    const threshold = vrfTrendGapThresholdMs(data.points, data.bucketMs);
    const tMid = data.bucketMs > 0 ? (p.t + p.tEnd) / 2 : p.t;
    if (Math.abs(hoverT - tMid) > Math.max(threshold, data.bucketMs)) return null;
    return { p, x: padLeft + ((hoverT - viewport.startMs) / span) * innerW };
  }, [hoverT, data, viewport.startMs, span, padLeft, innerW]);

  const bucketed = (data?.bucketMs ?? 0) > 0;
  const rowY = (row: number) => PAD_TOP + row * ROW_H;
  const legendStates = (['heating', 'standby', 'defrost', 'off', 'shutdown_wait', 'alarm', 'unknown'] as VrfActivityTrendState[]).filter(
    (s) => chart.statesPresent.has(s),
  );

  return (
    <div ref={wrapRef} className="vrf-tc-wrap">
      <div className="vrf-tc-plot vrf-tc-plot--states" style={{ height }} {...pointer.handlers} role="img" aria-label="Tilatrendi">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          {chart.timeTicks.map((tick) => {
            const x = padLeft + ((tick.t - viewport.startMs) / span) * innerW;
            return <line key={tick.t} x1={x} x2={x} y1={PAD_TOP} y2={height - PAD_BOTTOM} className="vrf-tc-grid vrf-tc-grid--v" />;
          })}
          {[{ key: 'activity', label: 'Tilatieto', color: 'var(--text)' }, ...laneDefs].map((row, i) => {
            const y = rowY(i);
            const share = row.key === 'activity' || !showShares ? null : chart.shares[row.key];
            return (
              <g key={row.key}>
                <text x={padLeft + 2} y={y + 10} className="vrf-tc-lane-label" fill={row.key === 'activity' ? undefined : row.color}>
                  {row.label}
                </text>
                {share != null && (
                  <text x={padLeft - 6} y={y + LABEL_GAP + BAR_H - 2} textAnchor="end" className="vrf-tc-axis" >
                    {pct(share)}
                  </text>
                )}
                <rect x={padLeft} y={y + LABEL_GAP} width={innerW} height={BAR_H} rx={3} className="vrf-tc-rail" />
                {(row.key === 'activity' ? chart.activity : chart.laneRects[row.key] ?? []).map((r, j) => (
                  <rect
                    key={j}
                    x={r.x}
                    y={y + LABEL_GAP}
                    width={r.w}
                    height={BAR_H}
                    rx={2}
                    fill={r.color}
                    fillOpacity={r.opacity}
                  />
                ))}
              </g>
            );
          })}
          {chart.gaps.map((g, i) => (
            <rect key={`gap-${i}`} x={g.x} y={PAD_TOP + LABEL_GAP} width={g.w} height={rowCount * ROW_H - LABEL_GAP} className="vrf-tc-nodata vrf-tc-nodata--states">
              <title>Ei tietoa</title>
            </rect>
          ))}
          {hover && (
            <line x1={hover.x} x2={hover.x} y1={PAD_TOP} y2={height - PAD_BOTTOM} className="vrf-trend-crosshair" pointerEvents="none" />
          )}
          {pointer.selection && (
            <rect x={pointer.selection.x} y={PAD_TOP} width={pointer.selection.width} height={height - PAD_TOP - PAD_BOTTOM} className="vrf-tc-brush" />
          )}
        </svg>
        {hover && pointer.active && !pointer.selection && (
          <VrfTrendHoverTip
            leftPct={(hover.x / width) * 100}
            timeLabel={formatTrendPointTime(hover.p.t, hover.p.tEnd, span)}
            rows={[
              {
                color: VRF_ACTIVITY_TREND_META[hover.p.state].color,
                label: 'Tila',
                value: VRF_ACTIVITY_TREND_META[hover.p.state].label,
              },
              ...laneDefs.map((lane) => {
                const frac = hover.p.lanes[lane.key];
                return {
                  color: lane.color,
                  label: lane.label,
                  value: bucketed ? (frac > 0 ? `${pct(frac)} ajasta` : 'Pois') : frac > 0 ? 'Päällä' : 'Pois',
                };
              }),
            ]}
            footer={bucketed ? `${hover.p.samples} mittausta · tila = yleisin (hälytys aina)` : undefined}
          />
        )}
      </div>
      {legendStates.length > 0 && (
        <div className="vrf-tc-state-legend" aria-label="Tilatiedon värit">
          {legendStates.map((state) => (
            <span key={state} className="vrf-tc-state-legend-item">
              <span className="vrf-trend-legend-dot" style={{ background: VRF_ACTIVITY_TREND_META[state].color }} />
              {VRF_ACTIVITY_TREND_META[state].label}
            </span>
          ))}
          {showShares && laneDefs.length > 0 && (
            <span className="vrf-tc-state-legend-item muted">Vasemmalla: osuus ajasta valitulla välillä</span>
          )}
        </div>
      )}
    </div>
  );
}
