import { useId, useMemo, useRef } from 'react';
import { useElementWidth } from '../../hooks/useElementWidth';
import { buildTimeTicks, formatTrendPointTime, formatVrfNumber, formatVrfValue, niceScale, type NiceScale } from '../../lib/vrfTrendAxis';
import {
  nearestVrfTrendPointIndex,
  visibleVrfTrendRange,
  vrfTrendCoverageGaps,
  vrfTrendGapThresholdMs,
  vrfTrendValueExtent,
  type VrfTrendData,
  type VrfTrendSignal,
} from '../../lib/vrfTrendData';
import VrfTrendHoverTip from './VrfTrendHoverTip';
import { useVrfTrendPointer, type VrfTrendViewport } from './useVrfTrendPointer';

export type VrfTrendAxisLimits = Record<string, { min: number | null; max: number | null }>;

type Props = {
  data: VrfTrendData | null;
  viewport: VrfTrendViewport;
  signals: VrfTrendSignal[];
  axisLimits: VrfTrendAxisLimits;
  hoverT: number | null;
  onHoverT: (t: number | null) => void;
  onZoom: (startMs: number, endMs: number) => void;
  onResetZoom?: () => void;
  padLeft: number;
  padRight: number;
  height?: number;
};

const PAD_TOP = 20;
const PAD_BOTTOM = 36;

const DEFAULT_DOMAIN: Record<string, [number, number]> = { '°C': [-5, 35], K: [0, 10] };

function r1(v: number) {
  return Math.round(v * 10) / 10;
}

type Axis = { unit: string; side: 'left' | 'right'; scale: NiceScale; keys: string[] };

export default function VrfTrendLineChart({
  data,
  viewport,
  signals,
  axisLimits,
  hoverT,
  onHoverT,
  onZoom,
  onResetZoom,
  padLeft,
  padRight,
  height = 260,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const clipId = `vrf-tc-clip-${useId().replace(/:/g, '')}`;
  const width = Math.max(280, useElementWidth(wrapRef));
  const innerW = Math.max(10, width - padLeft - padRight);
  const innerH = height - PAD_TOP - PAD_BOTTOM;
  const span = Math.max(viewport.endMs - viewport.startMs, 1);
  const xOf = (t: number) => padLeft + ((t - viewport.startMs) / span) * innerW;

  const pointer = useVrfTrendPointer({ padLeft, innerW, viewport, onHoverT, onZoom, onResetZoom });

  const units = useMemo(() => {
    const out: string[] = [];
    for (const s of signals) if (!out.includes(s.unit)) out.push(s.unit);
    return out.slice(0, 2);
  }, [signals]);

  const chart = useMemo(() => {
    const points = data?.points ?? [];
    const bucketMs = data?.bucketMs ?? 0;
    const tickTarget = Math.max(3, Math.min(7, Math.floor(innerH / 42)));
    const axes: Axis[] = units.map((unit, i) => {
      const keys = signals.filter((s) => s.unit === unit).map((s) => s.key);
      const extent = vrfTrendValueExtent(points, keys, viewport.startMs, viewport.endMs);
      const limits = axisLimits[unit] ?? { min: null, max: null };
      const [dMin, dMax] = extent ? [extent.min, extent.max] : (DEFAULT_DOMAIN[unit] ?? [0, 10]);
      const pad = extent ? Math.max((dMax - dMin) * 0.04, 0.2) : 0;
      return {
        unit,
        side: i === 0 ? 'left' : 'right',
        keys,
        scale: niceScale(dMin - pad, dMax + pad, tickTarget, limits.min, limits.max),
      };
    });
    const axisOf = (unit: string) => axes.find((a) => a.unit === unit) ?? axes[0];
    const yOf = (axis: Axis, v: number) => {
      const { min, max } = axis.scale;
      return PAD_TOP + innerH - ((v - min) / Math.max(max - min, 1e-9)) * innerH;
    };

    const gapThreshold = vrfTrendGapThresholdMs(points, bucketMs);
    const [from, to] = visibleVrfTrendRange(points, viewport.startMs, viewport.endMs);
    const sx = (t: number) => padLeft + ((t - viewport.startMs) / span) * innerW;
    // Ei puristeta reunaan: rajojen ulkopuolinen osa leikkautuu (clipPath) eikä näytä väärää arvoa.
    const clampY = (y: number) => Math.min(PAD_TOP + innerH + 2000, Math.max(PAD_TOP - 2000, y));

    const series = signals.map((signal) => {
      const axis = axisOf(signal.unit);
      let line = '';
      let band = '';
      let runUpper: string[] = [];
      let runLower: string[] = [];
      let prevT: number | null = null;
      const flushBand = () => {
        if (runUpper.length > 1) band += `M${runUpper.join('L')}L${runLower.reverse().join('L')}Z`;
        runUpper = [];
        runLower = [];
      };
      for (let i = from; i < to; i += 1) {
        const p = points[i];
        const v = p.values[signal.key];
        const tMid = bucketMs > 0 ? (p.t + p.tEnd) / 2 : p.t;
        if (v == null) {
          prevT = null;
          flushBand();
          continue;
        }
        const x = r1(sx(tMid));
        const y = r1(clampY(yOf(axis, v)));
        const broken = prevT == null || p.t - prevT > gapThreshold;
        line += `${broken ? 'M' : 'L'}${x} ${y}`;
        if (broken) flushBand();
        if (bucketMs > 0) {
          const hi = p.maxs?.[signal.key] ?? v;
          const lo = p.mins?.[signal.key] ?? v;
          runUpper.push(`${x} ${r1(clampY(yOf(axis, hi)))}`);
          runLower.push(`${x} ${r1(clampY(yOf(axis, lo)))}`);
        }
        prevT = p.t;
      }
      flushBand();
      return { signal, axis, line, band };
    });

    const gaps = vrfTrendCoverageGaps(points, viewport.startMs, viewport.endMs, gapThreshold).map(([a, b]) => ({
      x: sx(Math.max(a, viewport.startMs)),
      w: Math.max(1, sx(Math.min(b, viewport.endMs)) - sx(Math.max(a, viewport.startMs))),
    }));

    const timeTicks = buildTimeTicks(viewport.startMs, viewport.endMs, Math.max(2, Math.floor(innerW / 95))).ticks;
    const hasValues = series.some((s) => s.line.length > 0);
    return { axes, series, gaps, timeTicks, hasValues, yOf, axisOf };
  }, [data, viewport.startMs, viewport.endMs, signals, units, axisLimits, innerH, innerW, padLeft, span]);

  const hover = useMemo(() => {
    if (hoverT == null || !data || data.points.length === 0) return null;
    const idx = nearestVrfTrendPointIndex(data.points, hoverT);
    const p = data.points[idx];
    if (!p) return null;
    const tMid = data.bucketMs > 0 ? (p.t + p.tEnd) / 2 : p.t;
    if (tMid < viewport.startMs - span * 0.02 || tMid > viewport.endMs + span * 0.02) return null;
    const threshold = vrfTrendGapThresholdMs(data.points, data.bucketMs);
    if (Math.abs(hoverT - tMid) > Math.max(threshold, data.bucketMs)) return null;
    return { p, x: padLeft + ((tMid - viewport.startMs) / span) * innerW };
  }, [hoverT, data, viewport.startMs, viewport.endMs, span, padLeft, innerW]);

  const left = chart.axes[0];
  const right = chart.axes[1];
  const bucketed = (data?.bucketMs ?? 0) > 0;

  return (
    <div ref={wrapRef} className="vrf-tc-wrap">
      <div
        className="vrf-tc-plot"
        style={{ height }}
        {...pointer.handlers}
        role="img"
        aria-label="Lämpötilatrendi"
      >
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          {chart.gaps.map((g, i) => (
            <rect key={`gap-${i}`} x={g.x} y={PAD_TOP} width={g.w} height={innerH} className="vrf-tc-nodata" />
          ))}
          {left?.scale.ticks.map((tick) => {
            const y = chart.yOf(left, tick);
            return (
              <g key={`l-${tick}`}>
                <line x1={padLeft} x2={padLeft + innerW} y1={y} y2={y} className="vrf-tc-grid" />
                <text x={padLeft - 6} y={y + 3.5} textAnchor="end" className="vrf-tc-axis">
                  {formatVrfNumber(tick, left.scale.decimals)}
                </text>
              </g>
            );
          })}
          {right?.scale.ticks.map((tick) => {
            const y = chart.yOf(right, tick);
            return (
              <text key={`r-${tick}`} x={padLeft + innerW + 6} y={y + 3.5} textAnchor="start" className="vrf-tc-axis">
                {formatVrfNumber(tick, right.scale.decimals)}
              </text>
            );
          })}
          {left && (
            <text x={padLeft - 6} y={12} textAnchor="end" className="vrf-tc-unit">
              {left.unit}
            </text>
          )}
          {right && (
            <text x={padLeft + innerW + 6} y={12} textAnchor="start" className="vrf-tc-unit">
              {right.unit}
            </text>
          )}
          {chart.timeTicks.map((tick) => {
            const x = xOf(tick.t);
            return (
              <g key={`t-${tick.t}`}>
                <line x1={x} x2={x} y1={PAD_TOP} y2={PAD_TOP + innerH} className="vrf-tc-grid vrf-tc-grid--v" />
                <text x={x} y={PAD_TOP + innerH + 14} textAnchor="middle" className="vrf-tc-axis">
                  {tick.primary}
                </text>
                {tick.secondary && (
                  <text x={x} y={PAD_TOP + innerH + 27} textAnchor="middle" className="vrf-tc-axis vrf-tc-axis--date">
                    {tick.secondary}
                  </text>
                )}
              </g>
            );
          })}
          <rect x={padLeft} y={PAD_TOP} width={innerW} height={innerH} className="vrf-tc-frame" />
          <defs>
            <clipPath id={clipId}>
              <rect x={padLeft} y={PAD_TOP - 4} width={innerW} height={innerH + 8} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            {chart.series.map(({ signal, band }) =>
              band ? <path key={`b-${signal.key}`} d={band} fill={signal.color} className="vrf-tc-band" /> : null,
            )}
            {chart.series.map(({ signal, line }) =>
              line ? (
                <path key={`s-${signal.key}`} d={line} stroke={signal.color} className="vrf-tc-line" fill="none" />
              ) : null,
            )}
          </g>
          {hover && (
            <g pointerEvents="none">
              <line x1={hover.x} x2={hover.x} y1={PAD_TOP} y2={PAD_TOP + innerH} className="vrf-trend-crosshair" />
              {chart.series.map(({ signal, axis }) => {
                const v = hover.p.values[signal.key];
                if (v == null) return null;
                const cy = chart.yOf(axis, v);
                if (cy < PAD_TOP - 1 || cy > PAD_TOP + innerH + 1) return null;
                return (
                  <circle
                    key={`h-${signal.key}`}
                    cx={hover.x}
                    cy={cy}
                    r={4}
                    fill={signal.color}
                    className="vrf-trend-hover-point"
                  />
                );
              })}
            </g>
          )}
          {pointer.selection && (
            <rect
              x={pointer.selection.x}
              y={PAD_TOP}
              width={pointer.selection.width}
              height={innerH}
              className="vrf-tc-brush"
            />
          )}
        </svg>
        {!chart.hasValues && data && (
          <p className="vrf-tc-empty muted">Ei arvoja valituilla viivoilla tällä aikavälillä.</p>
        )}
        {hover && pointer.active && !pointer.selection && (
          <VrfTrendHoverTip
            leftPct={(hover.x / width) * 100}
            timeLabel={formatTrendPointTime(hover.p.t, hover.p.tEnd, span)}
            rows={signals.map((signal) => {
              const v = hover.p.values[signal.key];
              const lo = hover.p.mins?.[signal.key];
              const hi = hover.p.maxs?.[signal.key];
              return {
                color: signal.color,
                label: signal.label,
                value: formatVrfValue(v, signal.unit, signal.decimals),
                detail:
                  bucketed && v != null && lo != null && hi != null && hi - lo >= 0.05
                    ? `(${formatVrfNumber(lo, signal.decimals)}…${formatVrfNumber(hi, signal.decimals)})`
                    : undefined,
              };
            })}
            footer={bucketed ? `Keskiarvo ${hover.p.samples} mittauksesta (suluissa min…max)` : undefined}
          />
        )}
      </div>
    </div>
  );
}
