import { useEffect, useState } from 'react';
import { deviceTypes } from '../../lib/huoltoRaportti/constants';
import {
  isChillerLikeDevice,
  isKonvektoritDevice,
} from '../../lib/huoltoRaportti/maintenanceReportBasicsValidation';
import { createEmptyVjOhjausData } from '../../lib/huoltoRaportti/defaults';
import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { HuoltoInspectionDialogShell } from './HuoltoInspectionDialogShell';

type Props = {
  open: boolean;
  form: HuoltoReportData;
  fieldErrors: Record<string, string>;
  registryMessage?: string | null;
  copySiblingMode: boolean;
  onApply: (draft: HuoltoReportData) => boolean;
  onDeviceTypeSelect: (deviceType: string) => void;
  onClose: () => void;
};

export function MaintenanceDeviceDialog({
  open,
  form,
  fieldErrors,
  registryMessage,
  copySiblingMode,
  onApply,
  onDeviceTypeSelect,
  onClose,
}: Props) {
  const [draft, setDraft] = useState(form);

  useEffect(() => {
    if (open) setDraft(form);
  }, [open]);

  const patchDraft = (patch: Partial<HuoltoReportData>) => setDraft((prev) => ({ ...prev, ...patch }));

  const handleClose = () => {
    if (!onApply(draft)) return;
    onClose();
  };

  return (
    <HuoltoInspectionDialogShell
      open={open}
      title="Laitetiedot"
      titleId="maintenance-device-dialog-title"
      onClose={handleClose}
    >
      <label className="maintenance-device-type-select">
        Laitetyyppi *
        <select
          className={fieldErrors.laiteTyyppi ? 'field-error-input' : undefined}
          value={draft.laiteTyyppi}
          onChange={(e) => {
            const laiteTyyppi = e.target.value;
            patchDraft({ laiteTyyppi });
            if (laiteTyyppi) onDeviceTypeSelect(laiteTyyppi);
          }}
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

      {!draft.laiteTyyppi ? (
        <p className="muted">Valitse laitetyyppi jatkaaksesi.</p>
      ) : (
        <>
          {registryMessage ? <p className="muted">{registryMessage}</p> : null}
          {copySiblingMode && !isKonvektoritDevice(draft.laiteTyyppi) ? (
            <p className="muted">
              Täytä uuden laitteen tunnus. Laite rekisteriin ja uusi huoltopöytäkirja luodaan samalla.
            </p>
          ) : null}

          {isKonvektoritDevice(draft.laiteTyyppi) ? (
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
                    value={draft.laiteKayttotarkoitus}
                    onChange={(e) => patchDraft({ laiteKayttotarkoitus: e.target.value })}
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
                    value={draft.laiteSijainti}
                    onChange={(e) => patchDraft({ laiteSijainti: e.target.value })}
                    placeholder="esim. Rakennus A, kerrokset 2–4"
                  />
                  {fieldErrors.laiteSijainti ? (
                    <span className="field-error-text">{fieldErrors.laiteSijainti}</span>
                  ) : null}
                </label>
                <label>
                  Kohteen tunnus (valinnainen)
                  <input
                    value={draft.laiteTunnus}
                    onChange={(e) => patchDraft({ laiteTunnus: e.target.value })}
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
                  value={draft.laiteValmistaja}
                  onChange={(e) => patchDraft({ laiteValmistaja: e.target.value })}
                />
                {fieldErrors.laiteValmistaja ? (
                  <span className="field-error-text">{fieldErrors.laiteValmistaja}</span>
                ) : null}
              </label>
              <label>
                Malli *
                <input
                  className={fieldErrors.laiteMalli ? 'field-error-input' : undefined}
                  value={draft.laiteMalli}
                  onChange={(e) => patchDraft({ laiteMalli: e.target.value })}
                />
                {fieldErrors.laiteMalli ? (
                  <span className="field-error-text">{fieldErrors.laiteMalli}</span>
                ) : null}
              </label>
              <label>
                Laitetunnus *
                <input
                  className={fieldErrors.laiteTunnus ? 'field-error-input' : undefined}
                  value={draft.laiteTunnus}
                  onChange={(e) => patchDraft({ laiteTunnus: e.target.value })}
                />
                {fieldErrors.laiteTunnus ? (
                  <span className="field-error-text">{fieldErrors.laiteTunnus}</span>
                ) : null}
              </label>
              <label>
                Sarjanumero *
                <input
                  className={fieldErrors.laiteSarjanumero ? 'field-error-input' : undefined}
                  value={draft.laiteSarjanumero}
                  onChange={(e) => patchDraft({ laiteSarjanumero: e.target.value })}
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
                  value={draft.laiteSijainti}
                  onChange={(e) => patchDraft({ laiteSijainti: e.target.value })}
                />
                {fieldErrors.laiteSijainti ? (
                  <span className="field-error-text">{fieldErrors.laiteSijainti}</span>
                ) : null}
              </label>
              <label>
                Käyttötarkoitus
                <input
                  value={draft.laiteKayttotarkoitus}
                  onChange={(e) => patchDraft({ laiteKayttotarkoitus: e.target.value })}
                />
              </label>
              {isChillerLikeDevice(draft.laiteTyyppi) ? (
                <label className="huolto-span-all">
                  Asetusarvot
                  <input
                    value={draft.vjOhjausData?.asetusArvot ?? ''}
                    onChange={(e) =>
                      patchDraft({
                        vjOhjausData: {
                          ...(draft.vjOhjausData ?? createEmptyVjOhjausData()),
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
    </HuoltoInspectionDialogShell>
  );
}
