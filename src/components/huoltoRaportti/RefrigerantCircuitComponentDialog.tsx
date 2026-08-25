import { useCallback, useEffect, useState } from 'react';
import type { RefrigerantCircuitComponent } from '../../lib/huoltoRaportti/types';
import { expansionValveTypes } from '../../lib/huoltoRaportti/constants';
import { refrigerantCircuitComponentLabel } from '../../lib/huoltoRaportti/refrigerantCircuitComponents';
import { binaryChoiceFromStatus } from '../../lib/huoltoRaportti/circuitPartInspection';
import type { HuoltoInspectionStatus } from '../../lib/huoltoRaportti/huoltoInspectionStatus';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';
import { HuoltoInspectionDialogShell } from './HuoltoInspectionDialogShell';
import { BinaryInspectionToggle } from './BinaryInspectionToggle';

interface Props {
  open: boolean;
  component: RefrigerantCircuitComponent | null;
  circuitNumber: number;
  onClose: () => void;
  onSave: (component: RefrigerantCircuitComponent) => void;
}

function componentHasData(component: RefrigerantCircuitComponent): boolean {
  return Boolean(
    String(component.valmistaja ?? '').trim()
    || String(component.malli ?? '').trim()
    || String(component.kommentti ?? '').trim()
    || (component.type === 'custom' && String(component.customName ?? '').trim())
    || (component.type === 'paisuntaventtiili' && String(component.paisuntaventtiiliTyyppi ?? '').trim()),
  );
}

export function RefrigerantCircuitComponentDialog({
  open,
  component,
  circuitNumber,
  onClose,
  onSave,
}: Props) {
  const [draft, setDraft] = useState<RefrigerantCircuitComponent | null>(component);
  const [okChoice, setOkChoice] = useState<boolean | null>(null);

  useEffect(() => {
    if (!open || !component) return;
    setDraft(component);
    setOkChoice(binaryChoiceFromStatus(component.tila ?? null));
  }, [open, component]);

  const hasData = draft ? componentHasData(draft) : false;
  const canSave = !hasData || okChoice !== null;

  const handleClose = useCallback(() => {
    if (!draft) {
      onClose();
      return;
    }
    if (canSave) {
      const next: RefrigerantCircuitComponent = {
        ...draft,
        tila: hasData
          ? ((okChoice ? 'ok' : 'faulty') as Exclude<HuoltoInspectionStatus, null | 'na'>)
          : 'na',
      };
      onSave(next);
    }
    onClose();
  }, [canSave, draft, hasData, okChoice, onClose, onSave]);

  if (!draft) return null;

  const title = `${refrigerantCircuitComponentLabel(draft)} — piiri ${circuitNumber}`;

  return (
    <HuoltoInspectionDialogShell
      open={open}
      title={title}
      titleId="circuit-component-dialog-title"
      onClose={handleClose}
    >
      <p className="muted konvektori-dialog-help">
        Täytä komponentin tiedot. Jätä tyhjäksi jos komponenttia ei ole laitteessa.
      </p>

      <div className="line-form-grid konvektori-mittaukset-grid">
        {draft.type === 'custom' ? (
          <FormInput
            label="Komponentin nimi"
            value={draft.customName ?? ''}
            onChange={(value) => setDraft((prev) => (prev ? { ...prev, customName: value } : prev))}
            className="huolto-span-all"
          />
        ) : null}

        {draft.type === 'paisuntaventtiili' ? (
          <>
            <label>
              Paisuntaventtiilin tyyppi
              <select
                value={draft.paisuntaventtiiliTyyppi ?? ''}
                onChange={(e) =>
                  setDraft((prev) =>
                    prev ? { ...prev, paisuntaventtiiliTyyppi: e.target.value } : prev,
                  )
                }
              >
                <option value="">Valitse…</option>
                {expansionValveTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
            {draft.paisuntaventtiiliTyyppi === 'MUU' ? (
              <FormInput
                label="Muu tyyppi"
                value={draft.paisuntaventtiiliMuu ?? ''}
                onChange={(value) =>
                  setDraft((prev) => (prev ? { ...prev, paisuntaventtiiliMuu: value } : prev))
                }
              />
            ) : null}
          </>
        ) : null}

        {draft.type === 'kuivain' ? (
          <FormInput
            label="Kivien määrä"
            value={draft.kuivainKivienMaara ?? ''}
            onChange={(value) =>
              setDraft((prev) => (prev ? { ...prev, kuivainKivienMaara: value } : prev))
            }
            type="number"
          />
        ) : null}

        {draft.type === 'nestelasi' ? (
          <FormCheckbox
            label="Nestelasi kuiva"
            checked={!!draft.nestelasiKuiva}
            onChange={(value) =>
              setDraft((prev) => (prev ? { ...prev, nestelasiKuiva: value } : prev))
            }
          />
        ) : null}

        <FormInput
          label="Valmistaja"
          value={draft.valmistaja ?? ''}
          onChange={(value) => setDraft((prev) => (prev ? { ...prev, valmistaja: value } : prev))}
        />
        <FormInput
          label="Malli"
          value={draft.malli ?? ''}
          onChange={(value) => setDraft((prev) => (prev ? { ...prev, malli: value } : prev))}
        />
        <FormInput
          label="Kommentti"
          value={draft.kommentti ?? ''}
          onChange={(value) => setDraft((prev) => (prev ? { ...prev, kommentti: value } : prev))}
          className="huolto-span-all"
        />
      </div>

      {hasData ? (
        <>
          <div className="konvektori-tarkastus-item">
            <span className="konvektori-tarkastus-label">Tarkastuksen tulos</span>
            <BinaryInspectionToggle
              name={`component-${draft.id}-tila`}
              value={okChoice}
              onChange={(next) => setOkChoice(next)}
            />
          </div>
          {okChoice === false ? (
            <label className="konvektori-huomio-field">
              <span className="konvektori-tarkastus-label">Huomio / vika</span>
              <textarea
                rows={3}
                value={draft.kommentti ?? ''}
                onChange={(e) =>
                  setDraft((prev) => (prev ? { ...prev, kommentti: e.target.value } : prev))
                }
                placeholder="Kuvaile vika tai puute…"
              />
            </label>
          ) : null}
        </>
      ) : null}
    </HuoltoInspectionDialogShell>
  );
}
