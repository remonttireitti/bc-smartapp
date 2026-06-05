import { useMemo, useState } from 'react';
import TempTrendChart from './TempTrendChart';
import { formatTempC } from '../../lib/tempMonitoring';
import {
  collapseChartReadings,
  filterReadingsByTrendPreset,
  filterReadingsForSensor,
  summarizeZoneTrend,
  zoneConfigToEffectiveLimits,
  type ZoneConfigEntry,
  type ZoneKey,
  type ZoneTrendPreset,
} from '../../lib/tempZoneMonitoring';
import type { TempReading } from '../../lib/tempMonitoring';

const PRESETS: { value: ZoneTrendPreset; label: string }[] = [
  { value: 'today', label: 'Tänään' },
  { value: '7d', label: '7 päivää' },
  { value: '30d', label: '30 päivää' },
];

type Props = {
  open: boolean;
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

export default function TempZoneTrendDialog({ open, zoneKey, zone, readings, onClose }: Props) {
  const [preset, setPreset] = useState<ZoneTrendPreset>('today');
  const [showBothSensors, setShowBothSensors] = useState(false);

  const rawChartReadings = useMemo(() => {
    if (!zone || zone.sensor === 0) return [];
    const filtered = filterReadingsByTrendPreset(readings, preset);
    if (showBothSensors) {
      return filtered.filter((r) => {
        const ch = r.sensor_channel ?? 0;
        return ch === 1 || ch === 2 || ch === 0;
      });
    }
    return filterReadingsForSensor(filtered, zone.sensor);
  }, [readings, preset, zone, showBothSensors]);

  const chartReadings = useMemo(
    () => collapseChartReadings(rawChartReadings),
    [rawChartReadings],
  );

  const limits = zone ? zoneConfigToEffectiveLimits(zone) : null;
  const presetLabel = PRESETS.find((p) => p.value === preset)?.label ?? preset;
  const summary = zone ? summarizeZoneTrend(chartReadings, zone) : null;

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
            <p className="vrf-trend-meta muted">Lämpötilahistoria · {presetLabel}</p>
          </div>
          <div className="vrf-trend-range" role="group" aria-label="Trendin aikaväli">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                className={`vrf-trend-range-btn ${preset === p.value ? 'active' : ''}`}
                onClick={() => setPreset(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

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
                Historiaa on vähän — näet lähinnä nykytilan. Valitse pidempi jakso tai odota, kunnes laite tallentaa
                lisää mittauksia. Jos lämpö näyttää väärältä huoneelle, tarkista huoltoasetuksista oikea anturi.
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
          {chartReadings.length === 0 ? (
            <p className="muted temp-zone-trend-empty">
              Ei mittauksia valitulla jaksolla. Kokeile 7 tai 30 päivää.
            </p>
          ) : (
            <TempTrendChart
              readings={chartReadings}
              limits={limits}
              height={280}
              legendMode="zone"
              hidePathWhenSparse={chartReadings.length < 2}
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
