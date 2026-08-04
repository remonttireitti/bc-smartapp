import { useEffect, useState } from 'react';
import type { VapaajahdytysData, VapaajahdytysOhjaus } from '../../lib/huoltoRaportti/types';
import { mlpNestOptions } from '../../lib/huoltoRaportti/constants';
import {
  normalizeHuoltoInspectionStatus,
  vapaajahdytysInspectionStatus,
  type HuoltoInspectionStatus,
} from '../../lib/huoltoRaportti/huoltoInspectionStatus';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';
import { HuoltoPartInspectionRow } from './HuoltoPartInspectionRow';
import { TriStateInspectionToggle } from './TriStateInspectionToggle';

interface Props {
  data: VapaajahdytysData;
  onChange: (patch: Partial<VapaajahdytysData>) => void;
}

export function VapaajahdytysInspection({ data, onChange }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState(data);
  const status = vapaajahdytysInspectionStatus(data);

  useEffect(() => {
    if (dialogOpen) setDraft(data);
  }, [dialogOpen, data]);

  useEffect(() => {
    if (!dialogOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setDialogOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dialogOpen]);

  const draftStatus = normalizeHuoltoInspectionStatus(draft.tarkastusTila) ?? vapaajahdytysInspectionStatus(draft);
  const showDetails = draftStatus === 'ok' || draftStatus === 'faulty';
  const patchDraft = (patch: Partial<VapaajahdytysData>) => setDraft((prev) => ({ ...prev, ...patch }));

  return (
    <>
      <HuoltoPartInspectionRow title="Vapaajäähdytys" status={status} onInspect={() => setDialogOpen(true)} />

      {dialogOpen ? (
        <div className="leave-draft-overlay konvektori-dialog-overlay" role="presentation" onClick={() => setDialogOpen(false)}>
          <div
            className="leave-draft-dialog panel konvektori-tarkastus-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="vapaajahdytys-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="vapaajahdytys-dialog-title">Vapaajäähdytys</h2>

            <div className="konvektori-tarkastus-item">
              <span className="konvektori-tarkastus-label">Tarkastuksen tulos</span>
              <TriStateInspectionToggle
                name="vapaajahdytys-tila"
                value={draftStatus}
                onChange={(next: Exclude<HuoltoInspectionStatus, null>) => patchDraft({ tarkastusTila: next })}
              />
            </div>

            {showDetails ? (
              <>
                <div className="line-form-grid">
                  <label>
                    Ohjaus
                    <select value={draft.ohjaus} onChange={(e) => patchDraft({ ohjaus: e.target.value as VapaajahdytysOhjaus })}>
                      <option value="">Valitse…</option>
                      <option value="kone">Kone ohjaa</option>
                      <option value="taloautomaatio">Taloautomaatio ohjaa</option>
                    </select>
                  </label>
                  <label>
                    Neste
                    <select value={draft.neste} onChange={(e) => patchDraft({ neste: e.target.value })}>
                      <option value="">Valitse…</option>
                      {mlpNestOptions.map((opt) => (
                        <option key={opt.label} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </label>
                  <FormInput label="Virtaus (m³/h)" value={draft.virtaus} onChange={(v) => patchDraft({ virtaus: v })} type="number" />
                  <FormInput label="Meno (°C)" value={draft.meno} onChange={(v) => patchDraft({ meno: v })} type="number" />
                  <FormInput label="Paluu (°C)" value={draft.tulo} onChange={(v) => patchDraft({ tulo: v })} type="number" />
                </div>
                <FormCheckbox label="Pumppu tarkastettu" checked={draft.pumppuTarkastettu} onChange={(v) => patchDraft({ pumppuTarkastettu: v })} />
                {draft.pumppuTarkastettu ? (
                  <div className="line-form-grid">
                    <FormInput label="Pumpun valmistaja" value={draft.pumppuValmistaja} onChange={(v) => patchDraft({ pumppuValmistaja: v })} />
                    <FormInput label="Pumpun malli" value={draft.pumppuMalli} onChange={(v) => patchDraft({ pumppuMalli: v })} />
                  </div>
                ) : null}
              </>
            ) : null}

            {draftStatus === 'faulty' ? (
              <label className="konvektori-huomio-field">
                <span className="konvektori-tarkastus-label">Mikä on vikana?</span>
                <textarea rows={3} value={draft.tarkastusHuomio ?? ''} onChange={(e) => patchDraft({ tarkastusHuomio: e.target.value })} />
              </label>
            ) : null}

            <div className="leave-draft-actions konvektori-dialog-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setDialogOpen(false)}>Peruuta</button>
              <button type="button" className="btn btn-primary" disabled={draftStatus === null} onClick={() => { onChange(draft); setDialogOpen(false); }}>
                Tallenna
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
