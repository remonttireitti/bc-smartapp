import { useMemo, useState } from 'react';
import TempTrendChart from './TempTrendChart';
import {
  filterReadingsByTrendPreset,
  filterReadingsForSensor,
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

export default function TempZoneTrendDialog({ open, zoneKey, zone, readings, onClose }: Props) {
  const [preset, setPreset] = useState<ZoneTrendPreset>('today');
  const [showBothSensors, setShowBothSensors] = useState(false);

  const chartReadings = useMemo(() => {
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

  const limits = zone ? zoneConfigToEffectiveLimits(zone) : null;
  const presetLabel = PRESETS.find((p) => p.value === preset)?.label ?? preset;

  if (!open || !zoneKey || !zone) return null;

  const title = zone.label || zoneKey;
  const pointCount = chartReadings.length;

  return (
    <div className="leave-draft-overlay" role="presentation" onClick={onClose}>
      <div
        className="leave-draft-dialog vrf-trend-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="temp-zone-trend-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="vrf-trend-dialog-head">
          <div>
            <h2 id="temp-zone-trend-title">Trendi — {title}</h2>
            <p className="vrf-trend-meta">
              {presetLabel} · {pointCount} pistettä
              {zone.sensor > 0 ? ` · anturi ${zone.sensor}` : ''} · hälytysrajat {zone.min}–{zone.max} °C
            </p>
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

        <p className="vrf-trend-hint">
          Hetkellinen poikkeama ei hälytä. Yhtäjakoinen poikkeama yli noin 25 min → varoitus, yli noin 2 h →
          pilaantumisriski.
        </p>

        <label className="temp-zone-trend-both">
          <input
            type="checkbox"
            checked={showBothSensors}
            onChange={(e) => setShowBothSensors(e.target.checked)}
          />
          Näytä molemmat anturit
        </label>

        <div className="vrf-trend-block">
          <h3 className="vrf-trend-subtitle">Lämpötila</h3>
          <TempTrendChart readings={chartReadings} limits={limits} height={300} />
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
