import { useEffect, useState } from 'react';
import type { HuomioLuonne, KonvektoriRowData } from '../../lib/huoltoRaportti/types';
import {
  KONVEKTORI_TARKASTUS_ITEMS,
  type KonvektoriTarkastusField,
} from '../../lib/huoltoRaportti/konvektoriTarkastus';

interface Props {
  open: boolean;
  row: KonvektoriRowData;
  rowLabel: string;
  onClose: () => void;
  onSave: (row: KonvektoriRowData) => void;
}

function YesNoToggle({
  value,
  onChange,
  name,
}: {
  value: boolean | null;
  onChange: (next: boolean) => void;
  name: string;
}) {
  return (
    <div className="konvektori-yesno" role="group" aria-label={name}>
      <button
        type="button"
        className={`konvektori-yesno-btn${value === true ? ' konvektori-yesno-btn--active konvektori-yesno-btn--yes' : ''}`}
        aria-pressed={value === true}
        onClick={() => onChange(true)}
      >
        Kyllä
      </button>
      <button
        type="button"
        className={`konvektori-yesno-btn${value === false ? ' konvektori-yesno-btn--active konvektori-yesno-btn--no' : ''}`}
        aria-pressed={value === false}
        onClick={() => onChange(false)}
      >
        Ei
      </button>
    </div>
  );
}

export function KonvektoriTarkastusDialog({ open, row, rowLabel, onClose, onSave }: Props) {
  const [draft, setDraft] = useState(row);

  useEffect(() => {
    if (open) setDraft(row);
  }, [open, row]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const patchCheck = (field: KonvektoriTarkastusField, value: boolean) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="leave-draft-overlay konvektori-dialog-overlay" role="presentation" onClick={onClose}>
      <div
        className="leave-draft-dialog panel konvektori-tarkastus-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="konvektori-tarkastus-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="konvektori-tarkastus-title">Tarkastus: {rowLabel}</h2>
        <p className="muted konvektori-dialog-help">
          Täytä mittaukset ja vastaa jokaiseen kohtaan Kyllä tai Ei.
        </p>

        <div className="konvektori-mittaukset">
          <h3 className="konvektori-mittaukset-title">Mittaukset</h3>
          <div className="konvektori-mittaukset-grid">
            <label className="konvektori-mittaus-field">
              Huone °C (imuilma)
              <input
                type="text"
                inputMode="decimal"
                value={draft.huoneLampotila ?? ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, huoneLampotila: e.target.value }))}
                placeholder="esim. 24"
              />
            </label>
            <label className="konvektori-mittaus-field">
              Tulo °C
              <input
                type="text"
                inputMode="decimal"
                value={draft.tuloLampotila ?? ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, tuloLampotila: e.target.value }))}
                placeholder="esim. 45"
              />
            </label>
            <label className="konvektori-mittaus-field">
              Meno °C
              <input
                type="text"
                inputMode="decimal"
                value={draft.menoLampotila ?? ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, menoLampotila: e.target.value }))}
                placeholder="esim. 38"
              />
            </label>
            <label className="konvektori-mittaus-field">
              Puhallus °C
              <input
                type="text"
                inputMode="decimal"
                value={draft.puhallusLampotila ?? ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, puhallusLampotila: e.target.value }))}
                placeholder="esim. 22"
              />
            </label>
            <label className="konvektori-mittaus-field">
              Mitattu teho
              <input
                type="text"
                inputMode="decimal"
                value={draft.mitattuTeho ?? ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, mitattuTeho: e.target.value }))}
                placeholder="esim. 1,2 kW"
              />
            </label>
          </div>
          <p className="muted konvektori-mittaukset-hint">Puhalluslämpötila tai mitattu teho — riittää toinen.</p>
        </div>

        <div className="konvektori-tarkastus-list">
          {KONVEKTORI_TARKASTUS_ITEMS.map((item) => (
            <div key={item.field} className="konvektori-tarkastus-item">
              <span className="konvektori-tarkastus-label">{item.label}</span>
              <YesNoToggle
                name={item.label}
                value={
                  draft[item.field] === true || draft[item.field] === false
                    ? (draft[item.field] as boolean)
                    : null
                }
                onChange={(value) => patchCheck(item.field, value)}
              />
            </div>
          ))}
        </div>

        <div className="konvektori-huomio-type">
          <span className="konvektori-tarkastus-label">Huomion tyyppi</span>
          <div className="konvektori-huomio-type-toggle" role="group" aria-label="Huomion tyyppi">
            <button
              type="button"
              className={`konvektori-huomio-type-btn${draft.huomioTyyppi !== 'vika' ? ' konvektori-huomio-type-btn--active' : ''}`}
              aria-pressed={draft.huomioTyyppi !== 'vika'}
              onClick={() => setDraft((prev) => ({ ...prev, huomioTyyppi: 'kommentti' satisfies HuomioLuonne }))}
            >
              Kommentti
            </button>
            <button
              type="button"
              className={`konvektori-huomio-type-btn konvektori-huomio-type-btn--vika${draft.huomioTyyppi === 'vika' ? ' konvektori-huomio-type-btn--active' : ''}`}
              aria-pressed={draft.huomioTyyppi === 'vika'}
              onClick={() => setDraft((prev) => ({ ...prev, huomioTyyppi: 'vika' satisfies HuomioLuonne }))}
            >
              Vika (punainen)
            </button>
          </div>
        </div>

        <label className="konvektori-huomio-field">
          Kommentti / huomio
          <textarea
            rows={4}
            value={draft.huomio}
            onChange={(e) => setDraft((prev) => ({ ...prev, huomio: e.target.value }))}
            placeholder="Kirjoita huomio tähän…"
          />
        </label>

        <div className="leave-draft-actions konvektori-dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Peruuta
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onSave(draft);
              onClose();
            }}
          >
            Tallenna tarkastus
          </button>
        </div>
      </div>
    </div>
  );
}
