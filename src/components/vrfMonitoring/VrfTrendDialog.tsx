import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  VRF_TREND_HOUR_OPTIONS,
  VRF_TREND_SERIES,
  VRF_READING_SELECT,
  defaultTrendSeriesForHotspot,
  formatTrendTimeLabel,
  readingsInTrendPeriod,
  sortReadingsByTime,
  trendReadingLimit,
  vrfTrendPeriodFromHours,
  type VrfBinaryLaneKey,
  type VrfReading,
  type VrfSchematicClickKey,
  type VrfTrendHours,
  type VrfTrendSeriesKey,
} from '../../lib/vrfMonitoring';

import { loadMonitorShareViewPublic } from '../../lib/monitorReaderShares';
import { supabase } from '../../lib/supabase';

import VrfActivityTrendChart from './VrfActivityTrendChart';
import VrfBinaryTrendChart from './VrfBinaryTrendChart';
import VrfTrendChart from './VrfTrendChart';

type Props = {
  open: boolean;
  deviceId: string;
  onClose: () => void;
  focusHotspot?: VrfSchematicClickKey | null;
  focusBinary?: VrfBinaryLaneKey | null;
  shareToken?: string;
};

const ALL_TEMP_KEYS = new Set(VRF_TREND_SERIES.map((s) => s.key));
const DEFAULT_BINARY = new Set<VrfBinaryLaneKey>(['control', 'compressor', 'defrost', 'alarm']);

export default function VrfTrendDialog({ open, deviceId, onClose, focusHotspot, focusBinary, shareToken }: Props) {
  const [trendHours, setTrendHours] = useState<VrfTrendHours>(24);
  const [readings, setReadings] = useState<VrfReading[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleSeries, setVisibleSeries] = useState<Set<VrfTrendSeriesKey>>(() => new Set(ALL_TEMP_KEYS));
  const [visibleBinary, setVisibleBinary] = useState<Set<VrfBinaryLaneKey>>(() => new Set(DEFAULT_BINARY));

  const period = useMemo(() => vrfTrendPeriodFromHours(trendHours), [trendHours]);

  const loadReadings = useCallback(async () => {
    if (!deviceId && !shareToken) return;
    setLoading(true);
    setError(null);
    try {
      if (shareToken) {
        const bundle = await loadMonitorShareViewPublic(shareToken, trendHours);
        setReadings(sortReadingsByTime((bundle.readings as VrfReading[]) ?? []));
      } else {
        const since = new Date(Date.now() - trendHours * 3600_000).toISOString();
        const { data, error: fetchError } = await supabase
          .from('vrf_readings')
          .select(VRF_READING_SELECT)
          .eq('device_id', deviceId)
          .gte('recorded_at', since)
          .order('recorded_at', { ascending: true })
          .limit(trendReadingLimit(trendHours));
        if (fetchError) throw new Error(fetchError.message);
        setReadings(sortReadingsByTime((data as VrfReading[] | null) ?? []));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Historian lataus epäonnistui');
    } finally {
      setLoading(false);
    }
  }, [deviceId, shareToken, trendHours]);

  useEffect(() => {
    if (!open) return;
    if (focusHotspot) {
      setVisibleSeries(defaultTrendSeriesForHotspot(focusHotspot));
    } else {
      setVisibleSeries(new Set(ALL_TEMP_KEYS));
    }
    if (focusBinary) {
      setVisibleBinary(new Set([focusBinary]));
    } else {
      setVisibleBinary(new Set(DEFAULT_BINARY));
    }
  }, [open, focusHotspot, focusBinary]);

  useEffect(() => {
    if (!open) return;
    void loadReadings();
  }, [open, loadReadings]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !loading) onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, loading, onClose]);

  const periodReadings = useMemo(
    () => readingsInTrendPeriod(readings, period),
    [readings, period],
  );

  const rangeLabel = VRF_TREND_HOUR_OPTIONS.find((o) => o.hours === trendHours)?.label ?? `${trendHours} h`;
  const hasChartData = periodReadings.length > 0;
  const showInitialLoader = loading && !hasChartData;
  const showCharts = hasChartData || (!loading && !error);

  if (!open) return null;

  return (
    <div className="leave-draft-overlay" role="presentation" onClick={loading ? undefined : onClose}>
      <div
        className="leave-draft-dialog vrf-trend-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vrf-trend-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="vrf-trend-dialog-head">
          <div>
            <h2 id="vrf-trend-dialog-title">Trendi</h2>
            <p className="muted vrf-trend-meta">
              {rangeLabel} · {periodReadings.length} pistettä ·{' '}
              {formatTrendTimeLabel(period.startMs, period.span)} —{' '}
              {formatTrendTimeLabel(period.endMs, period.span)}
            </p>
          </div>
          <div className="vrf-trend-range" role="group" aria-label="Trendin aikaväli">
            {VRF_TREND_HOUR_OPTIONS.map((opt) => (
              <button
                key={opt.hours}
                type="button"
                className={`vrf-trend-range-btn ${trendHours === opt.hours ? 'active' : ''}`}
                disabled={loading}
                onClick={() => setTrendHours(opt.hours)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="form-error">{error}</p>}
        {showInitialLoader && <p className="muted">Ladataan historiaa…</p>}
        {loading && hasChartData && (
          <p className="muted vrf-trend-refresh-hint">Päivitetään trendiä…</p>
        )}

        {showCharts && (
          <>
            {!hasChartData && !loading && (
              <p className="muted vrf-trend-empty-hint">
                Ei mittausdataa valitulla aikavälillä. Laite on ehkä offline tai historiaa ei ole vielä tallennettu.
              </p>
            )}
            <div className="vrf-trend-block">
              <h3 className="vrf-trend-subtitle">Lämpötilat</h3>
              <VrfTrendChart
                readings={readings}
                period={period}
                visibleSeries={visibleSeries}
                onVisibleSeriesChange={setVisibleSeries}
              />
            </div>
            <div className="vrf-trend-block">
              <h3 className="vrf-trend-subtitle">Tilatieto</h3>
              <VrfActivityTrendChart readings={readings} period={period} />
            </div>
            <div className="vrf-trend-block">
              <h3 className="vrf-trend-subtitle">Ohjaus, tilat ja sulatus</h3>
              <p className="muted vrf-trend-hint">
                Öljypalautus / sulatus tunnistetaan arviona: kompressori päällä, kylmäaine meno laskee ja ulkoyks. kenno nousee.
                Käynnistyksessä sama kuvio kuin öljypalautuksessa — ei merkitä heti käyntiluvan jälkeen.
              </p>
              <VrfBinaryTrendChart readings={readings} period={period} visible={visibleBinary} onVisibleChange={setVisibleBinary} />
            </div>
          </>
        )}

        <div className="leave-draft-actions">
          <button type="button" className="btn btn-secondary" disabled={loading} onClick={onClose}>
            Sulje
          </button>
        </div>
      </div>
    </div>
  );
}
