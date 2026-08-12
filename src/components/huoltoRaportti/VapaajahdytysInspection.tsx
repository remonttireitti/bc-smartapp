import type { VapaajahdytysData, VapaajahdytysOhjaus } from '../../lib/huoltoRaportti/types';
import { mlpNestOptions } from '../../lib/huoltoRaportti/constants';
import {
  normalizeHuoltoInspectionStatus,
  vapaajahdytysInspectionStatus,
  type HuoltoInspectionStatus,
} from '../../lib/huoltoRaportti/huoltoInspectionStatus';
import { useMaintenanceDocumentLayout } from '../../hooks/useMaintenanceDocumentLayout';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';
import { HuoltoPartInspectionRow } from './HuoltoPartInspectionRow';
import { HuoltoInspectionDialogShell, useHuoltoInspectionDialog } from './HuoltoInspectionDialogShell';
import { useRegisterHuoltoModuleDialog } from './HuoltoModuleDialogContext';
import { TriStateInspectionToggle } from './TriStateInspectionToggle';

interface Props {
  data: VapaajahdytysData;
  onChange: (patch: Partial<VapaajahdytysData>) => void;
  /** Dokumenttinäkymä: rekisteröi moduulin popup avattavaksi otsikosta. */
  documentModuleKey?: string;
}

export function VapaajahdytysInspection({ data, onChange, documentModuleKey }: Props) {
  const documentLayout = useMaintenanceDocumentLayout();
  const hideLauncher = documentLayout && !!documentModuleKey;
  const status = vapaajahdytysInspectionStatus(data);

  const applyDraft = (next: VapaajahdytysData) => onChange(next);

  const { open, openDialog, closeDialog, draft, setDraft } = useHuoltoInspectionDialog({
    data,
    onChange: applyDraft,
    canSave: (next) => {
      const nextStatus =
        normalizeHuoltoInspectionStatus(next.tarkastusTila) ?? vapaajahdytysInspectionStatus(next);
      return nextStatus !== null;
    },
  });

  useRegisterHuoltoModuleDialog(documentModuleKey, openDialog);

  const draftStatus =
    normalizeHuoltoInspectionStatus(draft.tarkastusTila) ?? vapaajahdytysInspectionStatus(draft);
  const showDetails = draftStatus === 'ok' || draftStatus === 'faulty';
  const patchDraft = (patch: Partial<VapaajahdytysData>) => setDraft((prev) => ({ ...prev, ...patch }));

  return (
    <>
      {!hideLauncher ? (
        <HuoltoPartInspectionRow title="Vapaajäähdytys" status={status} onInspect={openDialog} />
      ) : null}

      <HuoltoInspectionDialogShell open={open} title="Vapaajäähdytys" titleId="vapaajahdytys-dialog-title" onClose={closeDialog}>
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
                    <option key={opt.label} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <FormInput label="Virtaus (m³/h)" value={draft.virtaus} onChange={(v) => patchDraft({ virtaus: v })} type="number" />
              <FormInput label="Meno (°C)" value={draft.meno} onChange={(v) => patchDraft({ meno: v })} type="number" />
              <FormInput label="Paluu (°C)" value={draft.tulo} onChange={(v) => patchDraft({ tulo: v })} type="number" />
            </div>
            <FormCheckbox
              label="Pumppu tarkastettu"
              checked={draft.pumppuTarkastettu}
              onChange={(v) => patchDraft({ pumppuTarkastettu: v })}
            />
            {draft.pumppuTarkastettu ? (
              <div className="line-form-grid">
                <FormInput
                  label="Pumpun valmistaja"
                  value={draft.pumppuValmistaja}
                  onChange={(v) => patchDraft({ pumppuValmistaja: v })}
                />
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
      </HuoltoInspectionDialogShell>
    </>
  );
}
