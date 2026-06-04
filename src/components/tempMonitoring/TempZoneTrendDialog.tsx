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

  if (!open || !zoneKey || !zone) return null;

  const title = zone.label || zoneKey;

  return (
    <div className="leave-draft-overlay" role="presentation" onClick={onClose}>
      <div
        className="leave-draft-dialog temp-zone-trend-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="temp-zone-trend-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="temp-zone-dialog-head">
          <h2 id="temp-zone-trend-title">Trendi — {title}</h2>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Sulje
          </button>
        </header>
        <p className="muted temp-zone-trend-hint">
          Anturi {zone.sensor}. Hälytysrajat {zone.min}–{zone.max} °C. Hetkellinen poikkeama ei hälytä; yhtäjakoinen
          poikkeama yli ~25 min → varoitus, yli ~2 h → pilaantumisriski.
        </p>
        <div className="temp-zone-trend-toolbar">
          <label>
            Aikaväli
            <select value={preset} onChange={(e) => setPreset(e.target.value as ZoneTrendPreset)}>
              {PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="temp-zone-trend-both">
            <input
              type="checkbox"
              checked={showBothSensors}
              onChange={(e) => setShowBothSensors(e.target.checked)}
            />
            Näytä molemmat anturit
          </label>
        </div>
        <TempTrendChart readings={chartReadings} limits={limits} height={280} />
      </div>
    </div>
  );
}
