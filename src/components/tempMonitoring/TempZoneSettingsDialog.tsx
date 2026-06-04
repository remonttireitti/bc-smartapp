import { FormEvent, useEffect } from 'react';
import {
  ZONE_KEYS,
  type ZoneConfig,
  type ZoneConfigEntry,
  type ZoneKey,
} from '../../lib/tempZoneMonitoring';

type Props = {
  open: boolean;
  busy?: boolean;
  error?: string | null;
  value: ZoneConfig;
  onChange: (next: ZoneConfig) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
};

function updateZone(
  config: ZoneConfig,
  key: ZoneKey,
  patch: Partial<ZoneConfigEntry>,
): ZoneConfig {
  return { ...config, [key]: { ...config[key], ...patch } };
}

export default function TempZoneSettingsDialog({
  open,
  busy = false,
  error = null,
  value,
  onChange,
  onClose,
  onSubmit,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div className="leave-draft-overlay" role="presentation" onClick={busy ? undefined : onClose}>
      <div
        className="leave-draft-dialog temp-zone-settings-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="temp-zone-settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="temp-zone-dialog-head">
          <h2 id="temp-zone-settings-title">Huoltoasetukset</h2>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Sulje
          </button>
        </header>
        <p className="muted">
          Anturivalinta ja lämpörajat (min/max °C). Muutokset tallentuvat laitteeseen.
        </p>
        <form className="temp-zone-settings-form" onSubmit={onSubmit}>
          <div className="temp-zone-settings-grid">
            {ZONE_KEYS.map((zKey) => {
              const z = value[zKey];
              const isFreezer = zKey === 'pakastin';
              return (
                <section
                  key={zKey}
                  className={`temp-zone-settings-block${isFreezer ? ' temp-zone-settings-block--freezer' : ''}`}
                >
                  <h3>{z.label || zKey.toUpperCase()}</h3>
                  <label>
                    Huone / tunnus
                    <input
                      value={z.label}
                      maxLength={80}
                      onChange={(e) => onChange(updateZone(value, zKey, { label: e.target.value }))}
                    />
                  </label>
                  <label>
                    Mitä säilytetään
                    <textarea
                      rows={2}
                      maxLength={400}
                      value={z.contents}
                      onChange={(e) => onChange(updateZone(value, zKey, { contents: e.target.value }))}
                    />
                  </label>
                  <div className="temp-zone-settings-limits">
                    <label>
                      Min °C
                      <input
                        type="number"
                        step={0.5}
                        value={z.min}
                        onChange={(e) =>
                          onChange(updateZone(value, zKey, { min: Number(e.target.value) }))
                        }
                      />
                    </label>
                    <label>
                      Max °C
                      <input
                        type="number"
                        step={0.5}
                        value={z.max}
                        onChange={(e) =>
                          onChange(updateZone(value, zKey, { max: Number(e.target.value) }))
                        }
                      />
                    </label>
                  </div>
                  <label>
                    Mittaus (anturi)
                    <select
                      value={z.sensor}
                      onChange={(e) =>
                        onChange(updateZone(value, zKey, { sensor: Number(e.target.value) }))
                      }
                    >
                      <option value={0}>Ei anturia</option>
                      <option value={1}>Anturi 1</option>
                      <option value={2}>Anturi 2</option>
                    </select>
                  </label>
                </section>
              );
            })}
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="leave-draft-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
              Peruuta
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Tallennetaan…' : 'Tallenna'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
