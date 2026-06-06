import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TempZoneTrendChart from './TempZoneTrendChart';
import { formatTempC, type TempReading } from '../../lib/tempMonitoring';
import { fetchTempZoneTrendDelta, fetchTempZoneTrendReadings } from '../../lib/tempTrendReadings';
import {
  buildZoneTrendReadings,
  filterReadingsByTrendPreset,
  filterReadingsForChartPeriod,
  filterReadingsForSensor,
  mergeTrendReadingSets,
  summarizeZoneTrend,
  zoneConfigToEffectiveLimits,
  zoneTrendChartPeriod,
  zoneTrendPeriodFromPreset,
  type ZoneConfigEntry,
  type ZoneKey,
  type ZoneTrendPreset,
} from '../../lib/tempZoneMonitoring';

const PRESETS: { value: ZoneTrendPreset; label: string }[] = [
  { value: 'today', label: 'Tänään' },
  { value: '7d', label: '7 päivää' },
  { value: '30d', label: '30 päivää' },
];

const TREND_POLL_MS = 30_000;

type DeviceLive = {
  id: string;
  last_seen_at: string | null;
  last_temp_c: number | null;
  last_temp_c2?: number | null;
};

type Props = {
  open: boolean;
  deviceId: string | null;
  device: DeviceLive | null;
  activeSessionId: string | null;
  liveSamples: TempReading[];
  zoneKey: ZoneKey | null;
  zone: ZoneConfigEntry | null;
  readings: TempReading[];
  onClose: () => void;
};

function formatMeasuredAt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fi-FI', {
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TempZoneTrendDialog({
  open,
  deviceId,
  device,
  activeSessionId,
  liveSamples,
  zoneKey,
  zone,
  readings,
  onClose,
}: Props) {
  const [preset, setPreset] = useState<ZoneTrendPreset>('today');
  const [showBothSensors, setShowBothSensors] = useState(false);
  const [trendRows, setTrendRows] = useState<TempReading[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const lastFetchedAtRef = useRef<string | null>(null);

  const loadTrend = useCallback(
    async (full: boolean) => {
      if (!deviceId) return;

      if (full) {
        setLoading(true);
        setFetchError(null);
        lastFetchedAtRef.current = null;
      }

      try {
        if (full) {
          const rows = await fetchTempZoneTrendReadings({ deviceId, preset });
          setTrendRows(rows);
          lastFetchedAtRef.current = rows[rows.length - 1]?.recorded_at ?? null;
          return;
        }

        const cursor = lastFetchedAtRef.current;
        if (!cursor) return;

        const delta = await fetchTempZoneTrendDelta({ deviceId, afterIso: cursor });
        if (delta.length === 0) return;

        setTrendRows((prev) => mergeTrendReadingSets(prev, delta));
        lastFetchedAtRef.current = delta[delta.length - 1].recorded_at;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Trendin lataus epäonnistui';
        if (full) setFetchError(message);
        else console.error('Trendin päivitys epäonnistui:', message);
      } finally {
        if (full) setLoading(false);
      }
    },
    [deviceId, preset],
  );

  useEffect(() => {
    if (!open || !deviceId) {
      setTrendRows([]);
      lastFetchedAtRef.current = null;
      setFetchError(null);
      return;
    }

    void loadTrend(true);
    const timer = window.setInterval(() => void loadTrend(false), TREND_POLL_MS);
    return () => window.clearInterval(timer);
  }, [open, deviceId, preset, loadTrend]);

  const trendReadings = useMemo(() => {
    if (!zone || zone.sensor === 0) return [];
    const base = trendRows.length > 0 ? trendRows : filterReadingsByTrendPreset(readings, preset);
    const merged = mergeTrendReadingSets(base, liveSamples);
    return buildZoneTrendReadings(
      merged,
      device
        ? {
            id: device.id,
            last_seen_at: device.last_seen_at,
            last_temp_c: device.last_temp_c,
            last_temp_c2: device.last_temp_c2,
          }
        : null,
      activeSessionId,
    );
  }, [readings, trendRows, liveSamples, preset, device, activeSessionId, zone]);

  const presetReadings = useMemo(() => {
    if (!zone || zone.sensor === 0) return [];
    return filterReadingsByTrendPreset(trendReadings, preset);
  }, [trendReadings, preset, zone]);

  const sensorReadings = useMemo(() => {
    if (!zone) return [];
    return filterReadingsForSensor(presetReadings, zone.sensor);
  }, [presetReadings, zone]);

  const chartPeriod = useMemo(() => {
    if (!zone || zone.sensor === 0) return null;
    return zoneTrendChartPeriod(preset, presetReadings, zone.sensor);
  }, [preset, presetReadings, zone]);

  const chartSensorReadings = useMemo(() => {
    if (!chartPeriod) return sensorReadings;
    return filterReadingsForChartPeriod(sensorReadings, chartPeriod);
  }, [sensorReadings, chartPeriod]);

  const limits = zone ? zoneConfigToEffectiveLimits(zone) : null;
  const presetLabel = PRESETS.find((p) => p.value === preset)?.label ?? preset;
  const summary = zone ? summarizeZoneTrend(chartSensorReadings, zone) : null;
  const usesRecentWindow =
    preset === 'today' &&
    chartPeriod != null &&
    chartPeriod.startMs > zoneTrendPeriodFromPreset('today').startMs + 60_000;
  const hasChartData =
    sensorReadings.length > 0 ||
    (showBothSensors && presetReadings.some((r) => (r.sensor_channel ?? 0) > 0));
  const showInitialLoader = loading && !hasChartData;

  if (!open || !zoneKey || !zone) return null;

  const title = zone.label || zoneKey;

  return (
    <div className="leave-draft-overlay" role="presentation" onClick={onClose}>
      <div
        className="leave-draft-dialog vrf-trend-dialog temp-zone-trend-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="temp-zone-trend-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="vrf-trend-dialog-head">
          <div>
            <h2 id="temp-zone-trend-title">{title}</h2>
            <p className="vrf-trend-meta muted">
              Lämpötilahistoria · {presetLabel}
              {usesRecentWindow ? ' · viimeiset 12 h' : ''}
              {summary ? ` · ${summary.pointCount} pistettä` : ''}
              {loading && hasChartData ? ' · päivitetään…' : ''}
            </p>
          </div>
          <div className="vrf-trend-range" role="group" aria-label="Trendin aikaväli">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                className={`vrf-trend-range-btn ${preset === p.value ? 'active' : ''}`}
                disabled={loading && !hasChartData}
                onClick={() => setPreset(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {fetchError && <p className="form-error">{fetchError}</p>}
        {showInitialLoader && <p className="muted">Ladataan historiaa…</p>}

        {summary && (
          <div
            className={`temp-zone-trend-summary temp-zone-trend-summary--${summary.statusTone}`}
          >
            <div className="temp-zone-trend-summary-main">
              <span className="temp-zone-trend-summary-label">Nyt</span>
              <strong className="temp-zone-trend-summary-temp">
                {summary.latestTemp != null ? formatTempC(summary.latestTemp) : '—'}
              </strong>
              <span className="temp-zone-trend-summary-status">{summary.statusLabel}</span>
            </div>
            <dl className="temp-zone-trend-summary-facts">
              <div>
                <dt>Tavoite</dt>
                <dd>
                  {zone.min} … {zone.max} °C
                </dd>
              </div>
              <div>
                <dt>Mittaus</dt>
                <dd>{formatMeasuredAt(summary.latestAt)}</dd>
              </div>
              <div>
                <dt>Anturi</dt>
                <dd>{zone.sensor > 0 ? `Anturi ${zone.sensor}` : 'Ei valittu'}</dd>
              </div>
              <div>
                <dt>Pisteitä</dt>
                <dd>{summary.pointCount}</dd>
              </div>
            </dl>
            {summary.isSparse && (
              <p className="temp-zone-trend-summary-note">
                {preset === 'today'
                  ? 'Tänään on vähän tallennettuja mittauksia. Trendi päivittyy automaattisesti — odota hetki tai kokeile 7 päivää.'
                  : 'Historiaa on vähän valitulla jaksolla. Jos lämpö näyttää väärältä huoneelle, tarkista huoltoasetuksista oikea anturi.'}
              </p>
            )}
          </div>
        )}

        <details className="temp-zone-trend-policy">
          <summary>Hälytyslogiikka</summary>
          <p className="muted">
            Hetkellinen poikkeama ei hälytä. Yhtäjakoinen poikkeama yli noin 25 min → varoitus, yli noin 2 h →
            pilaantumisriski.
          </p>
        </details>

        <label className="temp-zone-trend-both">
          <input
            type="checkbox"
            checked={showBothSensors}
            onChange={(e) => setShowBothSensors(e.target.checked)}
          />
          <span>Näytä molemmat anturit</span>
        </label>

        <div className="vrf-trend-block">
          {!hasChartData && !loading ? (
            <p className="muted temp-zone-trend-empty">
              Ei mittauksia valitulla jaksolla ({presetLabel.toLowerCase()}). Kokeile pidempää jaksoa tai odota laitteen
              seuraavaa lähetystä.
            </p>
          ) : (
            <TempZoneTrendChart
              readings={presetReadings}
              limits={limits}
              preset={preset}
              showBothSensors={showBothSensors}
              activeSensor={zone.sensor}
              height={280}
            />
          )}
        </div>

        <div className="leave-draft-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Sulje
          </button>
        </div>
      </div>
    </div>
  );
}
