import { useEffect, useState } from 'react';
import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import {
  normalizeHuoltoInspectionStatus,
  ulkoyksikkoInspectionStatus,
  type HuoltoInspectionStatus,
} from '../../lib/huoltoRaportti/huoltoInspectionStatus';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';
import { HuoltoPartInspectionRow } from './HuoltoPartInspectionRow';
import { TriStateInspectionToggle } from './TriStateInspectionToggle';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
}

export function UlkoyksikkoInspection({ form, onChange }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState(form);
  const status = ulkoyksikkoInspectionStatus(form);

  useEffect(() => {
    if (dialogOpen) setDraft(form);
  }, [dialogOpen, form]);

  useEffect(() => {
    if (!dialogOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setDialogOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dialogOpen]);

  const draftStatus = normalizeHuoltoInspectionStatus(draft.ulkoyksikkoTarkastusTila) ?? ulkoyksikkoInspectionStatus(draft);
  const showDetails = draftStatus === 'ok' || draftStatus === 'faulty';
  const patchDraft = (patch: Partial<HuoltoReportData>) => setDraft((prev) => ({ ...prev, ...patch }));

  return (
    <>
      <HuoltoPartInspectionRow title="Ulkoyksikön tarkastus" status={status} onInspect={() => setDialogOpen(true)} />

      {dialogOpen ? (
        <div className="leave-draft-overlay konvektori-dialog-overlay" role="presentation" onClick={() => setDialogOpen(false)}>
          <div
            className="leave-draft-dialog panel konvektori-tarkastus-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ulkoyksikko-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="ulkoyksikko-dialog-title">Ulkoyksikön tarkastus</h2>

            <div className="konvektori-tarkastus-item">
              <span className="konvektori-tarkastus-label">Tarkastuksen tulos</span>
              <TriStateInspectionToggle
                name="ulkoyksikko-tila"
                value={draftStatus}
                onChange={(next: Exclude<HuoltoInspectionStatus, null>) => patchDraft({ ulkoyksikkoTarkastusTila: next })}
              />
            </div>

            {showDetails ? (
              <div className="checkbox-grid huolto-toggle-grid">
                <FormCheckbox
                  label="Kenno puhdistettu tai puhdas"
                  checked={!!draft.ulkoyksikkoKennosPuhdas}
                  onChange={(v) => patchDraft({ ulkoyksikkoKennosPuhdas: v, ...(v ? {} : { ulkoyksikkoKennoPuhdistustapa: '' }) })}
                />
                {draft.ulkoyksikkoKennosPuhdas ? (
                  <FormInput
                    label="Kennon puhdistustapa"
                    value={draft.ulkoyksikkoKennoPuhdistustapa || ''}
                    onChange={(v) => patchDraft({ ulkoyksikkoKennoPuhdistustapa: v })}
                    className="huolto-span-all"
                  />
                ) : null}
                <FormCheckbox
                  label="Ulkoyksiköllä sulatusveden keräily/ohjaus"
                  checked={!!draft.ulkoyksikkoSulatausVedenKeraily}
                  onChange={(v) => patchDraft({ ulkoyksikkoSulatausVedenKeraily: v })}
                />
                {draft.ulkoyksikkoSulatausVedenKeraily ? (
                  <FormCheckbox
                    label="Sulatusveden keräily tarkistettu/kunnossa"
                    checked={!!draft.ulkoyksikkoSulatausVedenTarkistettu}
                    onChange={(v) => patchDraft({ ulkoyksikkoSulatausVedenTarkistettu: v })}
                  />
                ) : null}
                <FormCheckbox label="Ulkoyksikön vieressä turvakytkin" checked={!!draft.ulkoyksikkoTurvakytkin} onChange={(v) => patchDraft({ ulkoyksikkoTurvakytkin: v })} />
                <FormCheckbox label="Ulkoyksiköllä suojakotelo" checked={!!draft.ulkoyksikkoSuojakotelo} onChange={(v) => patchDraft({ ulkoyksikkoSuojakotelo: v })} />
              </div>
            ) : null}

            {draftStatus === 'faulty' ? (
              <label className="konvektori-huomio-field">
                <span className="konvektori-tarkastus-label">Mikä on vikana?</span>
                <textarea rows={3} value={draft.ulkoyksikkoTarkastusHuomio ?? ''} onChange={(e) => patchDraft({ ulkoyksikkoTarkastusHuomio: e.target.value })} />
              </label>
            ) : null}

            <div className="leave-draft-actions konvektori-dialog-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setDialogOpen(false)}>Peruuta</button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={draftStatus === null}
                onClick={() => {
                  onChange({
                    ulkoyksikkoTarkastusTila: draft.ulkoyksikkoTarkastusTila,
                    ulkoyksikkoTarkastusHuomio: draft.ulkoyksikkoTarkastusHuomio,
                    ulkoyksikkoKennosPuhdas: draft.ulkoyksikkoKennosPuhdas,
                    ulkoyksikkoKennoPuhdistustapa: draft.ulkoyksikkoKennoPuhdistustapa,
                    ulkoyksikkoSulatausVedenKeraily: draft.ulkoyksikkoSulatausVedenKeraily,
                    ulkoyksikkoSulatausVedenTarkistettu: draft.ulkoyksikkoSulatausVedenTarkistettu,
                    ulkoyksikkoTurvakytkin: draft.ulkoyksikkoTurvakytkin,
                    ulkoyksikkoSuojakotelo: draft.ulkoyksikkoSuojakotelo,
                  });
                  setDialogOpen(false);
                }}
              >
                Tallenna
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
