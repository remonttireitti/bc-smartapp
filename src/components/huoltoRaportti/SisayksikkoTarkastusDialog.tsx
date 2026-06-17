import { useEffect, useState } from 'react';
import type { HuomioLuonne, MittausSisayksikkoData, SisayksikkoData } from '../../lib/huoltoRaportti/types';
import {
  SISAYKSIKKO_TARKASTUS_ITEMS,
  type SisayksikkoTarkastusField,
} from '../../lib/huoltoRaportti/sisayksikkoTarkastus';
import { sisayksikkoTyyppiLabel } from '../../lib/huoltoRaportti/sisayksikkoTypes';
import { RichCommentEditor } from './RichCommentEditor';
import { SisayksikkoSchematicPreview } from './SisayksikkoSchematicPreview';

interface Props {
  open: boolean;
  unit: SisayksikkoData;
  mittaus: MittausSisayksikkoData;
  rowLabel: string;
  onClose: () => void;
  onSave: (unit: SisayksikkoData, mittaus: MittausSisayksikkoData) => void;
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

export function SisayksikkoTarkastusDialog({
  open,
  unit,
  mittaus,
  rowLabel,
  onClose,
  onSave,
}: Props) {
  const [draftUnit, setDraftUnit] = useState(unit);
  const [draftMittaus, setDraftMittaus] = useState(mittaus);

  useEffect(() => {
    if (open) {
      setDraftUnit(unit);
      setDraftMittaus(mittaus);
    }
  }, [open, unit, mittaus]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const patchCheck = (field: SisayksikkoTarkastusField, value: boolean) => {
    setDraftUnit((prev) => ({ ...prev, [field]: value }));
  };

  const typeLabel = sisayksikkoTyyppiLabel(draftUnit.tyyppi);
  const kondenssiLabel =
    draftUnit.kondenssivesi === 'pumpulla'
      ? `Kondenssivesi: pumpulla${draftUnit.pumppuMalli?.trim() ? ` (${draftUnit.pumppuMalli.trim()})` : ''}`
      : draftUnit.kondenssivesi === 'painovoimainen'
        ? 'Kondenssivesi: painovoimainen'
        : '';

  return (
    <div className="leave-draft-overlay konvektori-dialog-overlay" role="presentation" onClick={onClose}>
      <div
        className="leave-draft-dialog panel konvektori-tarkastus-dialog sisayksikko-tarkastus-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sisayksikko-tarkastus-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="sisayksikko-tarkastus-title">Tarkastus: {rowLabel}</h2>
        <p className="muted konvektori-dialog-help">
          Täytä lämpötilat ja vastaa tarkastuskysymyksiin. Kylmäainepiirissä ei ole vesivirtauslaskentaa.
        </p>

        {(typeLabel || draftUnit.malli?.trim() || kondenssiLabel) && (
          <div className="sisayksikko-dialog-meta muted">
            {[typeLabel, draftUnit.malli?.trim(), draftUnit.sarjanumero?.trim(), kondenssiLabel]
              .filter(Boolean)
              .join(' · ')}
          </div>
        )}

        <SisayksikkoSchematicPreview unit={draftUnit} mittaus={draftMittaus} className="sisayksikko-schematic-preview--dialog" />

        <div className="konvektori-mittaukset">
          <h3 className="konvektori-mittaukset-title">Lämpötilat (°C)</h3>
          <div className="konvektori-mittaukset-grid">
            <label className="konvektori-mittaus-field">
              Huone / sisälämpötila
              <input
                type="text"
                inputMode="decimal"
                value={draftMittaus.sisalampotila ?? ''}
                onChange={(e) => setDraftMittaus((prev) => ({ ...prev, sisalampotila: e.target.value }))}
                placeholder="esim. 21,5"
              />
            </label>
            <label className="konvektori-mittaus-field">
              Puhalluslämpötila
              <input
                type="text"
                inputMode="decimal"
                value={draftMittaus.puhallusLampotila ?? ''}
                onChange={(e) => setDraftMittaus((prev) => ({ ...prev, puhallusLampotila: e.target.value }))}
                placeholder="esim. 12,0"
              />
            </label>
            <label className="konvektori-mittaus-field">
              Paluulämpötila
              <input
                type="text"
                inputMode="decimal"
                value={draftMittaus.paluuLampotila ?? ''}
                onChange={(e) => setDraftMittaus((prev) => ({ ...prev, paluuLampotila: e.target.value }))}
                placeholder="esim. 18,0"
              />
            </label>
          </div>
          <p className="muted konvektori-mittaukset-hint">
            Lämpötilat näkyvät huoltopöytäkirjan kuvassa. Paine- ja ilmamäärämittaukset täytetään Mittaukset-osiossa.
          </p>
        </div>

        <div className="konvektori-tarkastus-list">
          {SISAYKSIKKO_TARKASTUS_ITEMS.map((item) => (
            <div key={item.field} className="konvektori-tarkastus-item">
              <span className="konvektori-tarkastus-label">{item.label}</span>
              <YesNoToggle
                name={item.label}
                value={
                  draftUnit[item.field] === true || draftUnit[item.field] === false
                    ? (draftUnit[item.field] as boolean)
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
              className={`konvektori-huomio-type-btn${draftUnit.huomioTyyppi !== 'vika' ? ' konvektori-huomio-type-btn--active' : ''}`}
              aria-pressed={draftUnit.huomioTyyppi !== 'vika'}
              onClick={() => setDraftUnit((prev) => ({ ...prev, huomioTyyppi: 'kommentti' satisfies HuomioLuonne }))}
            >
              Kommentti
            </button>
            <button
              type="button"
              className={`konvektori-huomio-type-btn konvektori-huomio-type-btn--vika${draftUnit.huomioTyyppi === 'vika' ? ' konvektori-huomio-type-btn--active' : ''}`}
              aria-pressed={draftUnit.huomioTyyppi === 'vika'}
              onClick={() => setDraftUnit((prev) => ({ ...prev, huomioTyyppi: 'vika' satisfies HuomioLuonne }))}
            >
              Vika (punainen)
            </button>
          </div>
        </div>

        <label className="konvektori-huomio-field">
          Kommentti / huomio
          <RichCommentEditor
            rows={4}
            value={draftUnit.huomio ?? ''}
            onChange={(huomio) => setDraftUnit((prev) => ({ ...prev, huomio }))}
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
              onSave(
                { ...draftUnit, huoneLampotila: draftMittaus.sisalampotila },
                draftMittaus,
              );
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
