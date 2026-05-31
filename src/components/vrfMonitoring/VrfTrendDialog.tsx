import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  VRF_TREND_HOUR_OPTIONS,
  VRF_TREND_SERIES,
  VRF_READING_SELECT,
  defaultTrendSeriesForHotspot,

  formatTrendTimeLabel,

  sortReadingsByTime,

  trendReadingLimit,

  type VrfBinaryLaneKey,

  type VrfReading,

  type VrfSchematicClickKey,

  type VrfTrendHours,

  type VrfTrendSeriesKey,

} from '../../lib/vrfMonitoring';

import { loadMonitorShareViewPublic } from '../../lib/monitorReaderShares';
import { supabase } from '../../lib/supabase';

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



  const loadReadings = useCallback(async () => {
    if (!deviceId && !shareToken) return;
    setLoading(true);
    setError(null);
    try {
      if (shareToken) {
        const bundle = await loadMonitorShareViewPublic(shareToken, trendHours);
        setReadings((bundle.readings as VrfReading[]) ?? []);
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
        setReadings((data as VrfReading[] | null) ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Historian lataus epäonnistui');
      setReadings([]);
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



  const meta = useMemo(() => {

    const sorted = sortReadingsByTime(readings);

    if (sorted.length === 0) return null;

    const start = new Date(sorted[0].recorded_at).getTime();

    const end = new Date(sorted[sorted.length - 1].recorded_at).getTime();

    return { count: sorted.length, start, end, span: Math.max(end - start, 1) };

  }, [readings]);



  const rangeLabel = VRF_TREND_HOUR_OPTIONS.find((o) => o.hours === trendHours)?.label ?? `${trendHours} h`;



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

            {meta && (

              <p className="muted vrf-trend-meta">

                {rangeLabel} · {meta.count} pistettä · {formatTrendTimeLabel(meta.start, meta.span)} —{' '}

                {formatTrendTimeLabel(meta.end, meta.span)}

              </p>

            )}

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

        {loading && <p className="muted">Ladataan historiaa…</p>}



        {!loading && readings.length < 2 ? (

          <p className="muted">Trendi vaatii vähintään kaksi historiapistettä valitulla aikavälillä.</p>

        ) : (

          !loading && (

            <>

              <div className="vrf-trend-block">

                <h3 className="vrf-trend-subtitle">Lämpötilat</h3>

                <VrfTrendChart

                  readings={readings}

                  visibleSeries={visibleSeries}

                  onVisibleSeriesChange={setVisibleSeries}

                />

              </div>

              <div className="vrf-trend-block">

                <h3 className="vrf-trend-subtitle">Ohjaus, tilat ja sulatus</h3>

                <p className="muted vrf-trend-hint">

                  Sulatus tunnistetaan arviona: kompressori päällä, kylmäaine meno laskee ja ulkoyks. kenno nousee.

                </p>

                <VrfBinaryTrendChart readings={readings} visible={visibleBinary} onVisibleChange={setVisibleBinary} />

              </div>

            </>

          )

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

