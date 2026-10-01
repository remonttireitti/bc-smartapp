import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  VRF_BINARY_LANES,
  type VrfBinaryLaneKey,
  type VrfSchematicClickKey,
} from '../../lib/vrfMonitoring';
import {
  VRF_TREND_MAX_SPAN_MS,
  VRF_TREND_SIGNALS,
  chooseVrfTrendBucketMs,
  type VrfTrendData,
  type VrfTrendSignalKey,
} from '../../lib/vrfTrendData';
import {
  describeTrendResolution,
  formatClock,
  formatSpanLabel,
  formatTrendRangeLabel,
  parseDateTimeLocalValue,
  toDateTimeLocalValue,
} from '../../lib/vrfTrendAxis';
import {
  isVrfTrendAbort,
  loadVrfTrendData,
  refreshVrfTrendTail,
  type VrfTrendDataSource,
} from '../../lib/vrfTrendReadings';

import VrfTrendLineChart, { type VrfTrendAxisLimits } from './VrfTrendLineChart';
import VrfTrendStateChart from './VrfTrendStateChart';
import type { VrfTrendViewport } from './useVrfTrendPointer';
import './vrfTrend.css';

type Props = {
  open: boolean;
  deviceId: string;
  onClose: () => void;
  focusHotspot?: VrfSchematicClickKey | null;
  focusBinary?: VrfBinaryLaneKey | null;
  shareToken?: string;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const MIN_ZOOM_SPAN_MS = 5 * MINUTE;
const LIVE_INTERVAL_MS = MINUTE;

export const VRF_TREND_DIALOG_PRESETS = [
  { hours: 1, label: '1 h' },
  { hours: 6, label: '6 h' },
  { hours: 24, label: '24 h' },
  { hours: 168, label: '7 pv' },
  { hours: 720, label: '30 pv' },
  { hours: 2160, label: '90 pv' },
] as const;

type RangeSel = { kind: 'preset'; hours: number } | { kind: 'custom'; startMs: number; endMs: number };

const DEFAULT_SIGNALS: VrfTrendSignalKey[] = [
  'outdoor_c',
  'outdoor_coil_c',
  'refrigerant_supply_c',
  'refrigerant_return_c',
  'hot_gas_c',
];
const DEFAULT_LANES: VrfBinaryLaneKey[] = ['control', 'compressor', 'defrost', 'alarm'];

const PREFS_KEY = 'bc.vrfTrend.prefs.v1';

type Prefs = {
  hours?: number;
  live?: boolean;
  signals?: VrfTrendSignalKey[];
  lanes?: VrfBinaryLaneKey[];
  axis?: Record<string, { min: string; max: string }>;
};

function readPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    return raw ? (JSON.parse(raw) as Prefs) : {};
  } catch {
    return {};
  }
}

function writePrefs(patch: Prefs) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(), ...patch }));
  } catch {
    /* yksityinen tila tms. */
  }
}

function presetViewport(hours: number, nowMs = Date.now()): VrfTrendViewport {
  const endMs = Math.ceil(nowMs / MINUTE) * MINUTE;
  return { startMs: endMs - hours * HOUR, endMs };
}

function signalsForHotspot(key: VrfSchematicClickKey): VrfTrendSignalKey[] {
  if (key === 'delta') return ['refrigerant_supply_c', 'refrigerant_return_c', 'refrigerant_delta_k'];
  return [key];
}

function parseLimit(value: string | undefined): number | null {
  if (value == null || value.trim() === '') return null;
  const n = Number(value.replace(',', '.').replace('−', '-'));
  return Number.isFinite(n) ? n : null;
}

/** Data kattaa näkymän riittävällä tarkkuudella → ei tarvitse hakea uudelleen. */
function dataCovers(data: VrfTrendData | null, vp: VrfTrendViewport): boolean {
  if (!data) return false;
  const needed = chooseVrfTrendBucketMs(vp.endMs - vp.startMs);
  return data.startMs <= vp.startMs && data.endMs >= vp.endMs && data.bucketMs <= needed;
}

export default function VrfTrendDialog({ open, deviceId, onClose, focusHotspot, focusBinary, shareToken }: Props) {
  const [range, setRange] = useState<RangeSel>({ kind: 'preset', hours: 24 });
  const [baseViewport, setBaseViewport] = useState<VrfTrendViewport>(() => presetViewport(24));
  const [zoom, setZoom] = useState<VrfTrendViewport | null>(null);
  const [data, setData] = useState<VrfTrendData | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [signals, setSignals] = useState<Set<VrfTrendSignalKey>>(() => new Set(DEFAULT_SIGNALS));
  const [lanes, setLanes] = useState<Set<VrfBinaryLaneKey>>(() => new Set(DEFAULT_LANES));
  const [axisInputs, setAxisInputs] = useState<Record<string, { min: string; max: string }>>({});
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [ready, setReady] = useState(false);

  const dataRef = useRef<VrfTrendData | null>(null);
  dataRef.current = data;
  const abortRef = useRef<AbortController | null>(null);
  const forceRef = useRef(false);

  const source = useMemo<VrfTrendDataSource | null>(() => {
    if (shareToken) return { kind: 'share', token: shareToken };
    if (deviceId) return { kind: 'db', deviceId };
    return null;
  }, [deviceId, shareToken]);

  const viewport = zoom ?? baseViewport;
  const span = viewport.endMs - viewport.startMs;
  const liveAllowed = range.kind === 'preset' && zoom == null;

  // Avaus: asetukset muistista, fokus kaavion klikkauksesta.
  useEffect(() => {
    if (!open) return;
    const prefs = readPrefs();
    const hours = VRF_TREND_DIALOG_PRESETS.some((p) => p.hours === prefs.hours) ? prefs.hours! : 24;
    setRange({ kind: 'preset', hours });
    setBaseViewport(presetViewport(hours));
    setZoom(null);
    setLive(prefs.live === true);
    setAxisInputs(prefs.axis ?? {});
    setCustomOpen(false);
    setCustomError(null);
    setError(null);
    if (focusHotspot) setSignals(new Set(signalsForHotspot(focusHotspot)));
    else if (prefs.signals?.length) setSignals(new Set(prefs.signals.filter((k) => VRF_TREND_SIGNALS.some((s) => s.key === k))));
    else setSignals(new Set(DEFAULT_SIGNALS));
    if (focusBinary) setLanes(new Set([focusBinary]));
    else if (prefs.lanes?.length) setLanes(new Set(prefs.lanes));
    else setLanes(new Set(DEFAULT_LANES));
    setReady(true);
  }, [open, focusHotspot, focusBinary]);

  // Eri laite / jako → vanha data pois.
  useEffect(() => {
    dataRef.current = null;
    setData(null);
  }, [source]);

  // Lataus näkymän mukaan (vain kun nykyinen data ei kata näkymää tarkasti).
  useEffect(() => {
    if (!open || !ready || !source) return;
    const force = forceRef.current;
    forceRef.current = false;
    abortRef.current?.abort();
    if (!force && dataCovers(dataRef.current, viewport)) {
      abortRef.current = null;
      setLoading(false);
      setProgress(null);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setProgress(null);
    setError(null);
    loadVrfTrendData({
      source,
      startMs: viewport.startMs,
      endMs: viewport.endMs,
      signal: controller.signal,
      force,
      onProgress: (f) => {
        if (!controller.signal.aborted) setProgress(f);
      },
    })
      .then((next) => {
        if (controller.signal.aborted) return;
        setData(next);
        setLastUpdatedAt(Date.now());
      })
      .catch((err) => {
        if (controller.signal.aborted || isVrfTrendAbort(err)) return;
        setError(err instanceof Error ? err.message : 'Historian lataus epäonnistui');
      })
      .finally(() => {
        if (abortRef.current === controller) {
          setLoading(false);
          setProgress(null);
        }
      });
  }, [open, ready, source, viewport.startMs, viewport.endMs, reloadToken]);

  // Sulkiessa: peru haku, tyhjennä kohdistin.
  useEffect(() => {
    if (open) return;
    abortRef.current?.abort();
    setReady(false);
    setLoading(false);
    setHoverT(null);
  }, [open]);

  // Live: 1 min välein vain uusin pää, ikkuna liukuu. Tauko kun välilehti piilossa.
  useEffect(() => {
    if (!open || !source || !live || !liveAllowed || range.kind !== 'preset') return;
    const hours = range.hours;
    let busy = false;
    const tick = async () => {
      if (busy || document.hidden) return;
      const current = dataRef.current;
      if (!current) return;
      busy = true;
      const next = presetViewport(hours);
      try {
        const updated = await refreshVrfTrendTail({ source, data: current, startMs: next.startMs, endMs: next.endMs });
        dataRef.current = updated;
        setData(updated);
        setBaseViewport(next);
        setLastUpdatedAt(Date.now());
        setError(null);
      } catch (err) {
        if (!isVrfTrendAbort(err)) setError(err instanceof Error ? err.message : 'Päivitys epäonnistui');
      } finally {
        busy = false;
      }
    };
    const timer = window.setInterval(() => void tick(), LIVE_INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [open, source, live, liveAllowed, range]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const selectPreset = useCallback((hours: number) => {
    setRange({ kind: 'preset', hours });
    setBaseViewport(presetViewport(hours));
    setZoom(null);
    setCustomOpen(false);
    writePrefs({ hours });
  }, []);

  const openCustom = useCallback(() => {
    setCustomStart(toDateTimeLocalValue(viewport.startMs));
    setCustomEnd(toDateTimeLocalValue(Math.min(viewport.endMs, Date.now())));
    setCustomError(null);
    setCustomOpen((v) => !v);
  }, [viewport.startMs, viewport.endMs]);

  const applyCustom = useCallback(() => {
    const startMs = parseDateTimeLocalValue(customStart);
    const endMs = parseDateTimeLocalValue(customEnd);
    if (startMs == null || endMs == null) {
      setCustomError('Anna alku- ja loppuaika.');
      return;
    }
    if (endMs - startMs < MIN_ZOOM_SPAN_MS) {
      setCustomError('Lopun pitää olla vähintään 5 min alun jälkeen.');
      return;
    }
    if (endMs - startMs > VRF_TREND_MAX_SPAN_MS) {
      setCustomError('Aikaväli enintään 90 vrk.');
      return;
    }
    setCustomError(null);
    setRange({ kind: 'custom', startMs, endMs });
    setBaseViewport({ startMs, endMs });
    setZoom(null);
    setCustomOpen(false);
  }, [customStart, customEnd]);

  const zoomTo = useCallback(
    (startMs: number, endMs: number) => {
      let a = startMs;
      let b = endMs;
      if (b - a < MIN_ZOOM_SPAN_MS) {
        const mid = (a + b) / 2;
        a = mid - MIN_ZOOM_SPAN_MS / 2;
        b = mid + MIN_ZOOM_SPAN_MS / 2;
      }
      if (Math.abs(a - baseViewport.startMs) < 1000 && Math.abs(b - baseViewport.endMs) < 1000) setZoom(null);
      else setZoom({ startMs: Math.round(a), endMs: Math.round(b) });
      setHoverT(null);
    },
    [baseViewport],
  );

  const resetZoom = useCallback(() => {
    setZoom(null);
    setHoverT(null);
  }, []);

  const pan = useCallback(
    (direction: -1 | 1) => {
      const shift = (span / 2) * direction;
      const nowEnd = Math.ceil(Date.now() / MINUTE) * MINUTE;
      let a = viewport.startMs + shift;
      let b = viewport.endMs + shift;
      if (b > nowEnd) {
        a -= b - nowEnd;
        b = nowEnd;
      }
      zoomTo(a, b);
    },
    [span, viewport, zoomTo],
  );

  const zoomOut = useCallback(() => {
    const nextSpan = Math.min(span * 2, VRF_TREND_MAX_SPAN_MS);
    const mid = (viewport.startMs + viewport.endMs) / 2;
    const nowEnd = Math.ceil(Date.now() / MINUTE) * MINUTE;
    let b = Math.min(mid + nextSpan / 2, nowEnd);
    const a = b - nextSpan;
    if (b < a) b = a;
    zoomTo(a, b);
  }, [span, viewport, zoomTo]);

  const refresh = useCallback(() => {
    if (range.kind === 'preset' && zoom == null) setBaseViewport(presetViewport(range.hours));
    forceRef.current = true;
    setReloadToken((n) => n + 1);
  }, [range, zoom]);

  const toggleLive = useCallback(() => {
    setLive((prev) => {
      const next = !prev;
      writePrefs({ live: next });
      return next;
    });
  }, []);

  const toggleSignal = useCallback((key: VrfTrendSignalKey) => {
    setSignals((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size <= 1) return prev;
        next.delete(key);
      } else next.add(key);
      writePrefs({ signals: [...next] });
      return next;
    });
  }, []);

  const toggleLane = useCallback((key: VrfBinaryLaneKey) => {
    setLanes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      writePrefs({ lanes: [...next] });
      return next;
    });
  }, []);

  const visibleSignals = useMemo(() => VRF_TREND_SIGNALS.filter((s) => signals.has(s.key)), [signals]);
  const visibleUnits = useMemo(() => {
    const out: string[] = [];
    for (const s of visibleSignals) if (!out.includes(s.unit)) out.push(s.unit);
    return out;
  }, [visibleSignals]);
  const laneKeys = useMemo(() => VRF_BINARY_LANES.filter((l) => lanes.has(l.key)).map((l) => l.key), [lanes]);

  const axisLimits = useMemo<VrfTrendAxisLimits>(() => {
    const out: VrfTrendAxisLimits = {};
    for (const unit of visibleUnits) {
      let min = parseLimit(axisInputs[unit]?.min);
      let max = parseLimit(axisInputs[unit]?.max);
      if (min != null && max != null && max <= min) {
        min = null;
        max = null;
      }
      out[unit] = { min, max };
    }
    return out;
  }, [axisInputs, visibleUnits]);
  const axisManual = visibleUnits.some((u) => axisLimits[u]?.min != null || axisLimits[u]?.max != null);

  const setAxisInput = useCallback((unit: string, field: 'min' | 'max', value: string) => {
    setAxisInputs((prev) => {
      const next = { ...prev, [unit]: { min: prev[unit]?.min ?? '', max: prev[unit]?.max ?? '', [field]: value } };
      writePrefs({ axis: next });
      return next;
    });
  }, []);

  const resetAxis = useCallback(() => {
    setAxisInputs({});
    writePrefs({ axis: {} });
  }, []);

  if (!open) return null;

  const hasRightAxis = visibleUnits.length > 1;
  const padLeft = 52;
  const padRight = hasRightAxis ? 44 : 14;
  const visibleSamples = data
    ? data.points.reduce((sum, p) => (p.tEnd >= viewport.startMs && p.t <= viewport.endMs ? sum + p.samples : sum), 0)
    : 0;
  const shownBucket = data && dataCovers(data, viewport) ? data.bucketMs : chooseVrfTrendBucketMs(span);
  const noData = data != null && !loading && visibleSamples === 0;
  const atNow = viewport.endMs >= Date.now() - MINUTE;

  return (
    <div className="leave-draft-overlay" role="presentation" onClick={onClose}>
      <div
        className="leave-draft-dialog vrf-trend-dialog vrf-trend-dialog--v2 panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vrf-trend-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="vrf-tv-head">
          <h2 id="vrf-trend-dialog-title">Trendi</h2>
          <button type="button" className="vrf-tv-close" aria-label="Sulje" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="vrf-tv-toolbar">
          <div className="vrf-trend-range" role="group" aria-label="Aikaväli">
            {VRF_TREND_DIALOG_PRESETS.map((opt) => (
              <button
                key={opt.hours}
                type="button"
                className={`vrf-trend-range-btn ${range.kind === 'preset' && range.hours === opt.hours ? 'active' : ''}`}
                aria-pressed={range.kind === 'preset' && range.hours === opt.hours}
                onClick={() => selectPreset(opt.hours)}
              >
                {opt.label}
              </button>
            ))}
            <button
              type="button"
              className={`vrf-trend-range-btn ${range.kind === 'custom' ? 'active' : ''}`}
              aria-expanded={customOpen}
              onClick={openCustom}
            >
              Oma väli…
            </button>
          </div>
          <div className="vrf-tv-nav" role="group" aria-label="Siirry ja zoomaa">
            <button type="button" className="vrf-tv-icon-btn" title="Aiempi jakso" aria-label="Aiempi jakso" onClick={() => pan(-1)}>
              ◀
            </button>
            <button type="button" className="vrf-tv-icon-btn" title="Loitonna (2× aikaväli)" aria-label="Loitonna" onClick={zoomOut} disabled={span >= VRF_TREND_MAX_SPAN_MS}>
              −
            </button>
            <button type="button" className="vrf-tv-icon-btn" title="Seuraava jakso" aria-label="Seuraava jakso" onClick={() => pan(1)} disabled={atNow}>
              ▶
            </button>
            {zoom && (
              <button type="button" className="vrf-tv-text-btn" onClick={resetZoom}>
                Palauta zoomaus
              </button>
            )}
            <button type="button" className="vrf-tv-text-btn" onClick={refresh} disabled={loading}>
              Päivitä
            </button>
            <label
              className={`vrf-tv-live ${live && liveAllowed ? 'on' : ''}`}
              title={liveAllowed ? 'Päivittää trendin minuutin välein' : 'Live toimii valmiilla aikavälillä ilman zoomausta'}
            >
              <input type="checkbox" checked={live} onChange={toggleLive} disabled={!liveAllowed} />
              Live (1 min)
            </label>
          </div>
        </div>

        {customOpen && (
          <div className="vrf-tv-custom">
            <label>
              Alku
              <input type="datetime-local" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
            </label>
            <label>
              Loppu
              <input type="datetime-local" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
            </label>
            <button type="button" className="btn btn-primary" onClick={applyCustom}>
              Näytä
            </button>
            {customError && <p className="form-error">{customError}</p>}
          </div>
        )}

        <p className="vrf-tv-meta">
          <strong>{formatTrendRangeLabel(viewport.startMs, viewport.endMs)}</strong>
          <span> · {formatSpanLabel(span)}</span>
          {data && !loading && <span> · {visibleSamples.toLocaleString('fi-FI')} mittausta</span>}
          <span> · {describeTrendResolution(shownBucket)}</span>
          {zoom && <span> · zoomattu</span>}
          {live && liveAllowed && lastUpdatedAt && <span> · päivitetty {formatClock(lastUpdatedAt)}</span>}
          {loading && (
            <span className="vrf-tv-loading">
              {' '}
              · Ladataan{progress != null ? ` ${Math.round(progress * 100)} %` : '…'}
            </span>
          )}
        </p>
        <div className={`vrf-tv-progress ${loading ? 'on' : ''}`} aria-hidden="true">
          <span style={{ width: progress != null ? `${Math.max(5, progress * 100)}%` : undefined }} />
        </div>

        {error && (
          <p className="form-error vrf-tv-error">
            {error}{' '}
            <button type="button" className="vrf-tv-text-btn" onClick={refresh}>
              Yritä uudelleen
            </button>
          </p>
        )}

        {!data && loading && <div className="vrf-tv-skeleton" aria-label="Ladataan historiaa" />}

        {noData && (
          <p className="muted vrf-tv-empty">
            Ei mittausdataa valitulla aikavälillä. Laite on ehkä ollut offline — kokeile pidempää aikaväliä.
          </p>
        )}

        {data && !noData && (
          <div className={`vrf-tv-body ${loading ? 'is-loading' : ''}`}>
            <section className="vrf-tv-section" aria-label="Lämpötilat">
              <div className="vrf-tv-section-head">
                <div className="vrf-tv-chips" role="group" aria-label="Näytettävät viivat">
                  {VRF_TREND_SIGNALS.map((signal) => {
                    const on = signals.has(signal.key);
                    return (
                      <button
                        key={signal.key}
                        type="button"
                        className={`vrf-trend-legend-toggle ${on ? 'active' : ''}`}
                        aria-pressed={on}
                        onClick={() => toggleSignal(signal.key)}
                        title={on ? 'Piilota viiva' : 'Näytä viiva'}
                      >
                        <span className="vrf-trend-legend-dot" style={{ background: on ? signal.color : 'transparent', borderColor: signal.color }} />
                        {signal.label}
                        {signal.unit !== '°C' && <span className="vrf-tv-chip-unit"> ({signal.unit})</span>}
                      </button>
                    );
                  })}
                </div>
                <details className="vrf-tv-axis">
                  <summary>Y-akseli: {axisManual ? 'käsin' : 'auto'}</summary>
                  <div className="vrf-tv-axis-body">
                    {visibleUnits.map((unit) => (
                      <div key={unit} className="vrf-tv-axis-row">
                        <span className="vrf-tv-axis-unit">{unit}</span>
                        <label>
                          min
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="auto"
                            value={axisInputs[unit]?.min ?? ''}
                            onChange={(e) => setAxisInput(unit, 'min', e.target.value)}
                          />
                        </label>
                        <label>
                          max
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="auto"
                            value={axisInputs[unit]?.max ?? ''}
                            onChange={(e) => setAxisInput(unit, 'max', e.target.value)}
                          />
                        </label>
                      </div>
                    ))}
                    <button type="button" className="vrf-tv-text-btn" onClick={resetAxis} disabled={!axisManual}>
                      Automaattinen
                    </button>
                  </div>
                </details>
              </div>
              <VrfTrendLineChart
                data={data}
                viewport={viewport}
                signals={visibleSignals}
                axisLimits={axisLimits}
                hoverT={hoverT}
                onHoverT={setHoverT}
                onZoom={zoomTo}
                onResetZoom={resetZoom}
                padLeft={padLeft}
                padRight={padRight}
              />
            </section>

            <section className="vrf-tv-section" aria-label="Tilat">
              <div className="vrf-tv-chips" role="group" aria-label="Näytettävät tilaviivat">
                {VRF_BINARY_LANES.map((lane) => {
                  const on = lanes.has(lane.key);
                  return (
                    <button
                      key={lane.key}
                      type="button"
                      className={`vrf-trend-legend-toggle ${on ? 'active' : ''}`}
                      aria-pressed={on}
                      onClick={() => toggleLane(lane.key)}
                      title={
                        lane.key === 'defrost'
                          ? 'Arvio: kompressori päällä, kylmäaine meno laskee ja ulkoyks. kenno nousee (ei heti käyntiluvan jälkeen).'
                          : undefined
                      }
                    >
                      <span className="vrf-trend-legend-dot" style={{ background: on ? lane.color : 'transparent', borderColor: lane.color }} />
                      {lane.label}
                    </button>
                  );
                })}
              </div>
              <VrfTrendStateChart
                data={data}
                viewport={viewport}
                lanes={laneKeys}
                hoverT={hoverT}
                onHoverT={setHoverT}
                onZoom={zoomTo}
                onResetZoom={resetZoom}
                padLeft={padLeft}
                padRight={padRight}
              />
            </section>
            <p className="vrf-tv-hint muted">
              Vedä kaaviossa sivusuunnassa rajataksesi tarkemman välin · tuplaklikkaus palauttaa.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
