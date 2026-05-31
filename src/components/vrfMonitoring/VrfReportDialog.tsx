import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  VRF_BINARY_LANES,
  VRF_TREND_HOUR_OPTIONS,
  VRF_TREND_SERIES,
  VRF_READING_SELECT,
  filterVrfReadingsByPeriod,
  hoursBetweenIso,
  trendReadingLimit,
  type VrfBinaryLaneKey,
  type VrfDevice,
  type VrfReading,
  type VrfTrendHours,
  type VrfTrendSeriesKey,
} from '../../lib/vrfMonitoring';
import { loadMonitorShareViewPublic } from '../../lib/monitorReaderShares';

import { formatDateTimeLocalInput, parseDateTimeLocalInput } from '../../lib/tempMonitoring';

import { openPrintHtml } from '../../lib/openPrintWindow';

import { buildVrfReportPrintHtml } from '../../lib/vrfReportPrint';

import { supabase } from '../../lib/supabase';

import VrfBinaryTrendChart from './VrfBinaryTrendChart';

import VrfTrendChart from './VrfTrendChart';



type Props = {
  open: boolean;
  device: VrfDevice;
  companyName: string;
  logoUrl?: string | null;
  shareToken?: string;
  onClose: () => void;
};



type PeriodMode = 'preset' | 'custom';



export default function VrfReportDialog({
  open,
  device,
  companyName,
  logoUrl,
  shareToken,
  onClose,
}: Props) {

  const [periodMode, setPeriodMode] = useState<PeriodMode>('preset');

  const [presetHours, setPresetHours] = useState<VrfTrendHours>(24);

  const [periodStart, setPeriodStart] = useState('');

  const [periodEnd, setPeriodEnd] = useState('');

  const [readings, setReadings] = useState<VrfReading[]>([]);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [tempSeries, setTempSeries] = useState<Set<VrfTrendSeriesKey>>(

    () => new Set(VRF_TREND_SERIES.map((s) => s.key)),

  );

  const [binaryLanes, setBinaryLanes] = useState<Set<VrfBinaryLaneKey>>(

    () => new Set(VRF_BINARY_LANES.map((l) => l.key)),

  );



  const effectivePeriod = useMemo(() => {

    if (periodMode === 'custom') {

      const start = parseDateTimeLocalInput(periodStart);

      const end = parseDateTimeLocalInput(periodEnd);

      if (!start || !end) return null;

      return { start, end };

    }

    const end = new Date().toISOString();

    const start = new Date(Date.now() - presetHours * 3600_000).toISOString();

    return { start, end };

  }, [periodMode, periodStart, periodEnd, presetHours]);



  const previewReadings = useMemo(() => {

    if (!effectivePeriod) return [];

    return filterVrfReadingsByPeriod(readings, effectivePeriod.start, effectivePeriod.end);

  }, [readings, effectivePeriod]);



  const loadReadings = useCallback(async () => {
    if (!device.id || !effectivePeriod) return;

    setLoading(true);
    setError(null);

    try {
      if (shareToken) {
        const bundle =
          periodMode === 'preset'
            ? await loadMonitorShareViewPublic(shareToken, presetHours)
            : await loadMonitorShareViewPublic(shareToken, {
                start: effectivePeriod.start,
                end: effectivePeriod.end,
              });
        setReadings((bundle.readings as VrfReading[]) ?? []);
        return;
      }

      const spanHours =
        periodMode === 'preset' ? presetHours : hoursBetweenIso(effectivePeriod.start, effectivePeriod.end);
      const limit = trendReadingLimit(spanHours);

      const { data, error: fetchError } = await supabase
        .from('vrf_readings')
        .select(VRF_READING_SELECT)
        .eq('device_id', device.id)
        .gte('recorded_at', effectivePeriod.start)
        .lte('recorded_at', effectivePeriod.end)
        .order('recorded_at', { ascending: true })
        .limit(limit);

      if (fetchError) throw new Error(fetchError.message);
      setReadings((data as VrfReading[] | null) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Historian lataus epäonnistui');
      setReadings([]);
    } finally {
      setLoading(false);
    }
  }, [device.id, effectivePeriod, periodMode, presetHours, shareToken]);



  useEffect(() => {

    if (!open) return;

    const end = new Date().toISOString();

    const start = new Date(Date.now() - 24 * 3600_000).toISOString();

    setPeriodStart(formatDateTimeLocalInput(start));

    setPeriodEnd(formatDateTimeLocalInput(end));

    setPeriodMode('preset');

    setPresetHours(24);

    setTempSeries(new Set(VRF_TREND_SERIES.map((s) => s.key)));

    setBinaryLanes(new Set(VRF_BINARY_LANES.map((l) => l.key)));

  }, [open]);



  useEffect(() => {

    if (!open || !effectivePeriod) return;

    void loadReadings();

  }, [open, effectivePeriod, loadReadings]);



  useEffect(() => {

    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {

      if (event.key === 'Escape' && !loading) onClose();

    }

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);

  }, [open, loading, onClose]);



  function toggleTemp(key: VrfTrendSeriesKey) {

    setTempSeries((prev) => {

      const next = new Set(prev);

      if (next.has(key)) {

        if (next.size <= 1) return prev;

        next.delete(key);

      } else {

        next.add(key);

      }

      return next;

    });

  }



  function toggleBinary(key: VrfBinaryLaneKey) {

    setBinaryLanes((prev) => {

      const next = new Set(prev);

      if (next.has(key)) {

        if (next.size <= 1) return prev;

        next.delete(key);

      } else {

        next.add(key);

      }

      return next;

    });

  }



  function handlePrint() {

    if (!effectivePeriod || previewReadings.length < 2) return;

    const html = buildVrfReportPrintHtml({

      deviceName: device.name,

      periodStart: effectivePeriod.start,

      periodEnd: effectivePeriod.end,

      readings: previewReadings,

      tempSeries: [...tempSeries],

      binaryLanes: [...binaryLanes],

      companyName,

      logoUrl,

    });

    openPrintHtml(html);

  }



  if (!open) return null;



  return (

    <div className="leave-draft-overlay" role="presentation" onClick={loading ? undefined : onClose}>

      <div

        className="leave-draft-dialog temp-report-dialog vrf-report-dialog panel"

        role="dialog"

        aria-modal="true"

        aria-labelledby="vrf-report-dialog-title"

        onClick={(event) => event.stopPropagation()}

      >

        <h2 id="vrf-report-dialog-title">Tulosta raportti</h2>

        <p className="muted temp-report-dialog-lead">

          Valitse aikaväli ja mitkä lämpötilat sekä tilatiedot mukaan tulosteeseen. Esikatselu päivittyy valintojen

          mukaan.

        </p>



        <div className="form-grid vrf-report-form">

          <fieldset className="vrf-report-period-fieldset">

            <legend>Aikaväli</legend>

            <div className="vrf-report-period-mode">

              <label className="vrf-report-radio">

                <input

                  type="radio"

                  name="vrf-period-mode"

                  checked={periodMode === 'preset'}

                  onChange={() => setPeriodMode('preset')}

                />

                Valmiit välit

              </label>

              <label className="vrf-report-radio">

                <input

                  type="radio"

                  name="vrf-period-mode"

                  checked={periodMode === 'custom'}

                  onChange={() => setPeriodMode('custom')}

                />

                Mukautettu

              </label>

            </div>

            {periodMode === 'preset' ? (

              <div className="vrf-trend-range" role="group" aria-label="Raportin aikaväli">

                {VRF_TREND_HOUR_OPTIONS.map((opt) => (

                  <button

                    key={opt.hours}

                    type="button"

                    className={`vrf-trend-range-btn ${presetHours === opt.hours ? 'active' : ''}`}

                    disabled={loading}

                    onClick={() => setPresetHours(opt.hours)}

                  >

                    {opt.label}

                  </button>

                ))}

              </div>

            ) : (

              <div className="temp-settings-range-row">

                <label>

                  Alku

                  <input

                    type="datetime-local"

                    value={periodStart}

                    disabled={loading}

                    onChange={(e) => setPeriodStart(e.target.value)}

                  />

                </label>

                <label>

                  Loppu

                  <input

                    type="datetime-local"

                    value={periodEnd}

                    disabled={loading}

                    onChange={(e) => setPeriodEnd(e.target.value)}

                  />

                </label>

              </div>

            )}

          </fieldset>



          <fieldset className="vrf-report-series-fieldset">

            <legend>Lämpötilat</legend>

            <div className="vrf-report-check-grid">

              {VRF_TREND_SERIES.map((series) => (

                <label key={series.key} className="vrf-report-check">

                  <input

                    type="checkbox"

                    checked={tempSeries.has(series.key)}

                    onChange={() => toggleTemp(series.key)}

                  />

                  <span className="vrf-trend-legend-dot" style={{ background: series.color }} />

                  {series.label}

                </label>

              ))}

            </div>

          </fieldset>



          <fieldset className="vrf-report-series-fieldset">

            <legend>Tilatiedot</legend>

            <div className="vrf-report-check-grid">

              {VRF_BINARY_LANES.map((lane) => (

                <label key={lane.key} className="vrf-report-check">

                  <input

                    type="checkbox"

                    checked={binaryLanes.has(lane.key)}

                    onChange={() => toggleBinary(lane.key)}

                  />

                  <span className="vrf-trend-legend-dot" style={{ background: lane.color }} />

                  {lane.label}

                </label>

              ))}

            </div>

          </fieldset>

        </div>



        {error && <p className="form-error">{error}</p>}

        {loading && <p className="muted">Ladataan dataa…</p>}



        {!loading && previewReadings.length < 2 ? (

          <p className="muted">Raportti vaatii vähintään kaksi mittauspistettä valitulla aikavälillä.</p>

        ) : (

          !loading && (

            <div className="vrf-report-preview">

              <h3 className="vrf-trend-subtitle">Esikatselu</h3>

              {tempSeries.size > 0 && (

                <VrfTrendChart

                  readings={previewReadings}

                  visibleSeries={tempSeries}

                  onVisibleSeriesChange={setTempSeries}

                />

              )}

              {binaryLanes.size > 0 && (

                <VrfBinaryTrendChart

                  readings={previewReadings}

                  visible={binaryLanes}

                  onVisibleChange={setBinaryLanes}

                />

              )}

            </div>

          )

        )}



        <div className="leave-draft-actions">

          <button type="button" className="btn btn-secondary" disabled={loading} onClick={onClose}>

            Peruuta

          </button>

          <button

            type="button"

            className="btn btn-primary"

            disabled={loading || previewReadings.length < 2}

            onClick={handlePrint}

          >

            Tulosta / PDF

          </button>

        </div>

      </div>

    </div>

  );

}

