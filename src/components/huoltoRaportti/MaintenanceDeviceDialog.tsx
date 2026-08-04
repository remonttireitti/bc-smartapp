import { useEffect } from 'react';
import { deviceTypes } from '../../lib/huoltoRaportti/constants';
import {
  isChillerLikeDevice,
  isKonvektoritDevice,
} from '../../lib/huoltoRaportti/maintenanceReportBasicsValidation';
import { createEmptyVjOhjausData } from '../../lib/huoltoRaportti/defaults';
import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';

type Props = {
  open: boolean;
  form: HuoltoReportData;
  fieldErrors: Record<string, string>;
  registryMessage?: string | null;
  copySiblingMode: boolean;
  onChange: (patch: Partial<HuoltoReportData>) => void;
  onDeviceTypeChange: (deviceType: string) => void;
  onSave: () => void;
  onCancel: () => void;
};

export function MaintenanceDeviceDialog({
  open,
  form,
  fieldErrors,
  registryMessage,
  copySiblingMode,
  onChange,
  onDeviceTypeChange,
  onSave,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="maintenance-report-tab-overlay maintenance-device-dialog-overlay leave-draft-overlay"
      role="presentation"
      onClick={onCancel}
    >
      <div
        className="maintenance-report-tab-dialog maintenance-device-dialog leave-draft-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="maintenance-device-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="maintenance-report-tab-dialog-header">
          <h2 id="maintenance-device-dialog-title">Laitetiedot</h2>
        </header>

        <div className="maintenance-report-tab-dialog-body">
          <label className="maintenance-device-type-select">
            Laitetyyppi *
            <select
              className={fieldErrors.laiteTyyppi ? 'field-error-input' : undefined}
              value={form.laiteTyyppi}
              onChange={(e) => onDeviceTypeChange(e.target.value)}
            >
              <option value="">— Valitse laitetyyppi —</option>
              {deviceTypes.map((dt) => (
                <option key={dt.value} value={dt.value}>
                  {dt.label}
                </option>
              ))}
            </select>
            {fieldErrors.laiteTyyppi ? (
              <span className="field-error-text">{fieldErrors.laiteTyyppi}</span>
            ) : null}
          </label>

          {!form.laiteTyyppi ? (
            <p className="muted">Valitse laitetyyppi jatkaaksesi.</p>
          ) : (
            <>
              {registryMessage ? <p className="muted">{registryMessage}</p> : null}
              {copySiblingMode && !isKonvektoritDevice(form.laiteTyyppi) ? (
                <p className="muted">
                  Täytä uuden laitteen tunnus. Laite rekisteriin ja uusi huoltopöytäkirja luodaan samalla.
                </p>
              ) : null}

              {isKonvektoritDevice(form.laiteTyyppi) ? (
                <>
                  <p className="muted">
                    Kuvaa kohde verkostotasolla — ei yksittäistä konvektoria. Jokaisen konvektorin valmistaja,
                    malli ja mittaukset täytetään konvektorilistassa.
                  </p>
                  <div className="line-form-grid">
                    <label style={{ gridColumn: '1 / -1' }}>
                      Verkoston kuvaus *
                      <input
                        className={fieldErrors.laiteKayttotarkoitus ? 'field-error-input' : undefined}
                        value={form.laiteKayttotarkoitus}
                        onChange={(e) => onChange({ laiteKayttotarkoitus: e.target.value })}
                        placeholder="esim. Kiinteistö X, 3. krs konvektoriverkosto"
                      />
                      {fieldErrors.laiteKayttotarkoitus ? (
                        <span className="field-error-text">{fieldErrors.laiteKayttotarkoitus}</span>
                      ) : null}
                    </label>
                    <label>
                      Alue / rakennus / kerros *
                      <input
                        className={fieldErrors.laiteSijainti ? 'field-error-input' : undefined}
                        value={form.laiteSijainti}
                        onChange={(e) => onChange({ laiteSijainti: e.target.value })}
                        placeholder="esim. Rakennus A, kerrokset 2–4"
                      />
                      {fieldErrors.laiteSijainti ? (
                        <span className="field-error-text">{fieldErrors.laiteSijainti}</span>
                      ) : null}
                    </label>
                    <label>
                      Kohteen tunnus (valinnainen)
                      <input
                        value={form.laiteTunnus}
                        onChange={(e) => onChange({ laiteTunnus: e.target.value })}
                        placeholder="esim. KV-2024-01"
                      />
                    </label>
                  </div>
                </>
              ) : (
                <div className="line-form-grid">
                  <label>
                    Valmistaja *
                    <input
                      className={fieldErrors.laiteValmistaja ? 'field-error-input' : undefined}
                      value={form.laiteValmistaja}
                      onChange={(e) => onChange({ laiteValmistaja: e.target.value })}
                    />
                    {fieldErrors.laiteValmistaja ? (
                      <span className="field-error-text">{fieldErrors.laiteValmistaja}</span>
                    ) : null}
                  </label>
                  <label>
                    Malli *
                    <input
                      className={fieldErrors.laiteMalli ? 'field-error-input' : undefined}
                      value={form.laiteMalli}
                      onChange={(e) => onChange({ laiteMalli: e.target.value })}
                    />
                    {fieldErrors.laiteMalli ? (
                      <span className="field-error-text">{fieldErrors.laiteMalli}</span>
                    ) : null}
                  </label>
                  <label>
                    Laitetunnus *
                    <input
                      className={fieldErrors.laiteTunnus ? 'field-error-input' : undefined}
                      value={form.laiteTunnus}
                      onChange={(e) => onChange({ laiteTunnus: e.target.value })}
                    />
                    {fieldErrors.laiteTunnus ? (
                      <span className="field-error-text">{fieldErrors.laiteTunnus}</span>
                    ) : null}
                  </label>
                  <label>
                    Sarjanumero *
                    <input
                      className={fieldErrors.laiteSarjanumero ? 'field-error-input' : undefined}
                      value={form.laiteSarjanumero}
                      onChange={(e) => onChange({ laiteSarjanumero: e.target.value })}
                      placeholder="esim. ei luettavissa / tiedossa"
                    />
                    {fieldErrors.laiteSarjanumero ? (
                      <span className="field-error-text">{fieldErrors.laiteSarjanumero}</span>
                    ) : null}
                  </label>
                  <label>
                    Sijainti *
                    <input
                      className={fieldErrors.laiteSijainti ? 'field-error-input' : undefined}
                      value={form.laiteSijainti}
                      onChange={(e) => onChange({ laiteSijainti: e.target.value })}
                    />
                    {fieldErrors.laiteSijainti ? (
                      <span className="field-error-text">{fieldErrors.laiteSijainti}</span>
                    ) : null}
                  </label>
                  <label>
                    Käyttötarkoitus
                    <input
                      value={form.laiteKayttotarkoitus}
                      onChange={(e) => onChange({ laiteKayttotarkoitus: e.target.value })}
                    />
                  </label>
                  {isChillerLikeDevice(form.laiteTyyppi) ? (
                    <label className="huolto-span-all">
                      Asetusarvot
                      <input
                        value={form.vjOhjausData?.asetusArvot ?? ''}
                        onChange={(e) =>
                          onChange({
                            vjOhjausData: {
                              ...(form.vjOhjausData ?? createEmptyVjOhjausData()),
                              asetusArvot: e.target.value,
                            },
                          })
                        }
                        placeholder="Esim. meno/paluu, ΔT, paineet…"
                      />
                    </label>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>

        <footer className="maintenance-report-tab-dialog-footer leave-draft-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Peruuta
          </button>
          <button type="button" className="btn btn-primary" onClick={onSave}>
            Tallenna
          </button>
        </footer>
      </div>
    </div>
  );
}
