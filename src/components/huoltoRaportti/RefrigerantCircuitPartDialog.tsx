import { useCallback, useEffect, useState } from 'react';
import type { RefrigerantCircuitData } from '../../lib/huoltoRaportti/types';
import { expansionValveTypes } from '../../lib/huoltoRaportti/constants';
import { refrigerantCircuitHasMagnetValve } from '../../lib/huoltoRaportti/deviceModuleLogic';
import {
  applyDryerInspectionPatch,
  applyExpansionValveInspectionPatch,
  applyMagnetValveInspectionPatch,
} from '../../lib/huoltoRaportti/huoltoInspectionStatus';
import {
  binaryChoiceFromStatus,
  circuitPartHasData,
  circuitPartStatus,
  finalizeCircuitPartDraft,
  type RefrigerantCircuitPartKey,
} from '../../lib/huoltoRaportti/circuitPartInspection';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';
import { HuoltoInspectionDialogShell } from './HuoltoInspectionDialogShell';
import { BinaryInspectionToggle } from './BinaryInspectionToggle';

export type { RefrigerantCircuitPartKey };

interface Props {
  open: boolean;
  part: RefrigerantCircuitPartKey;
  circuitNumber: number;
  data: RefrigerantCircuitData;
  laiteTyyppi?: string;
  onClose: () => void;
  onSave: (data: RefrigerantCircuitData) => void;
}

function expansionValveTypeLabel(value: string): string {
  return expansionValveTypes.find((t) => t.value === value)?.label ?? value;
}

export function RefrigerantCircuitPartDialog({
  open,
  part,
  circuitNumber,
  data,
  laiteTyyppi = '',
  onClose,
  onSave,
}: Props) {
  const [draft, setDraft] = useState(data);
  const [okChoice, setOkChoice] = useState<boolean | null>(null);
  const showMagnetValve = refrigerantCircuitHasMagnetValve(laiteTyyppi, draft.paisuntaventtiiliTyyppi);

  useEffect(() => {
    if (!open) return;
    setDraft(data);
    setOkChoice(binaryChoiceFromStatus(circuitPartStatus(data, part)));
  }, [open, data, part]);

  const hasData = circuitPartHasData(draft, part);
  const canSave = !hasData || okChoice !== null;

  const handleClose = useCallback(() => {
    if (canSave) onSave(finalizeCircuitPartDraft(draft, part, okChoice));
    onClose();
  }, [canSave, draft, okChoice, onClose, onSave, part]);

  const title =
    part === 'paisuntaventtiili'
      ? `Paisuntaventtiili — piiri ${circuitNumber}`
      : part === 'magneettiventtiili'
        ? `Magneettiventtiili — piiri ${circuitNumber}`
        : `Kuivain — piiri ${circuitNumber}`;

  const setStatusPatch = (ok: boolean) => {
    if (part === 'paisuntaventtiili') {
      setDraft((prev) => ({ ...prev, ...applyExpansionValveInspectionPatch(ok ? 'ok' : 'faulty') }));
      return;
    }
    if (part === 'magneettiventtiili') {
      setDraft((prev) => ({ ...prev, ...applyMagnetValveInspectionPatch(ok ? 'ok' : 'faulty') }));
      return;
    }
    setDraft((prev) => ({ ...prev, ...applyDryerInspectionPatch(ok ? 'ok' : 'faulty') }));
  };

  const handleOkChoice = (next: boolean) => {
    setOkChoice(next);
    setStatusPatch(next);
  };

  const faultNote =
    part === 'paisuntaventtiili'
      ? draft.paisuntaventtiiliHuomio ?? ''
      : part === 'magneettiventtiili'
        ? draft.magneettiventtiiliHuomio ?? ''
        : draft.kuivainLisatieto ?? '';

  const setFaultNote = (value: string) => {
    if (part === 'paisuntaventtiili') {
      setDraft((prev) => ({ ...prev, paisuntaventtiiliHuomio: value }));
      return;
    }
    if (part === 'magneettiventtiili') {
      setDraft((prev) => ({ ...prev, magneettiventtiiliHuomio: value }));
      return;
    }
    setDraft((prev) => ({ ...prev, kuivainLisatieto: value }));
  };

  return (
    <HuoltoInspectionDialogShell
      open={open}
      title={title}
      titleId="circuit-part-dialog-title"
      onClose={handleClose}
    >
      <p className="muted konvektori-dialog-help">
        Täytä tiedot jos osa on laitteessa. Jätä tyhjäksi jos osaa ei ole — tyhjä tulkataan &quot;ei laitteessa&quot;.
        Merkitse lopuksi kunnossa tai ei kunnossa.
      </p>

      {part === 'paisuntaventtiili' ? (
        <div className="line-form-grid konvektori-mittaukset-grid">
          <label>
            Paisuntaventtiilin tyyppi
            <select
              value={draft.paisuntaventtiiliTyyppi}
              onChange={(e) => {
                const tyyppi = e.target.value;
                setDraft((prev) => {
                  const next = { ...prev, paisuntaventtiiliTyyppi: tyyppi };
                  if (!refrigerantCircuitHasMagnetValve(laiteTyyppi, tyyppi)) {
                    next.magneettiventtiiliTila = 'na';
                    next.magneettiventtiiliTestattu = false;
                    next.magneettiventtiiliValmistaja = '';
                    next.magneettiventtiiliMalli = '';
                  }
                  return next;
                });
              }}
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
              onChange={(v) => setDraft((prev) => ({ ...prev, paisuntaventtiiliMuu: v }))}
            />
          ) : null}
          <FormInput
            label="Valmistaja"
            value={draft.paisuntaventtiiliValmistaja ?? ''}
            onChange={(v) => setDraft((prev) => ({ ...prev, paisuntaventtiiliValmistaja: v }))}
          />
          <FormInput
            label="Malli"
            value={draft.paisuntaventtiiliMalli ?? ''}
            onChange={(v) => setDraft((prev) => ({ ...prev, paisuntaventtiiliMalli: v }))}
          />
          {!showMagnetValve ? (
            <FormCheckbox
              label="Nestelasi kuiva"
              checked={!!draft.nestelasiKuiva}
              onChange={(v) => setDraft((prev) => ({ ...prev, nestelasiKuiva: v }))}
            />
          ) : null}
        </div>
      ) : null}

      {part === 'magneettiventtiili' ? (
        <div className="line-form-grid konvektori-mittaukset-grid">
          <FormInput
            label="Valmistaja"
            value={draft.magneettiventtiiliValmistaja ?? ''}
            onChange={(v) => setDraft((prev) => ({ ...prev, magneettiventtiiliValmistaja: v }))}
          />
          <FormInput
            label="Malli"
            value={draft.magneettiventtiiliMalli ?? ''}
            onChange={(v) => setDraft((prev) => ({ ...prev, magneettiventtiiliMalli: v }))}
          />
          <FormCheckbox
            label="Nestelasi kuiva"
            checked={!!draft.nestelasiKuiva}
            onChange={(v) => setDraft((prev) => ({ ...prev, nestelasiKuiva: v }))}
          />
        </div>
      ) : null}

      {part === 'kuivain' ? (
        <div className="line-form-grid konvektori-mittaukset-grid">
          <FormInput
            label="Valmistaja"
            value={draft.kuivainValmistaja ?? ''}
            onChange={(v) => setDraft((prev) => ({ ...prev, kuivainValmistaja: v }))}
          />
          <FormInput
            label="Malli"
            value={draft.kuivainMalli ?? ''}
            onChange={(v) => setDraft((prev) => ({ ...prev, kuivainMalli: v }))}
          />
          <FormInput
            label="Kivien määrä"
            value={draft.kuivainKivienMaara ?? ''}
            onChange={(v) => setDraft((prev) => ({ ...prev, kuivainKivienMaara: v }))}
            type="number"
          />
        </div>
      ) : null}

      {hasData ? (
        <>
          <div className="konvektori-tarkastus-item">
            <span className="konvektori-tarkastus-label">Tarkastuksen tulos</span>
            <BinaryInspectionToggle
              name={`${part}-tila`}
              value={okChoice}
              onChange={handleOkChoice}
            />
          </div>
          {okChoice === false ? (
            <label className="konvektori-huomio-field">
              <span className="konvektori-tarkastus-label">Huomio / vika</span>
              <textarea
                rows={3}
                value={faultNote}
                onChange={(e) => setFaultNote(e.target.value)}
                placeholder="Kuvaile vika tai puute…"
              />
            </label>
          ) : null}
        </>
      ) : null}
    </HuoltoInspectionDialogShell>
  );
}

export function circuitPartSubtitle(
  part: RefrigerantCircuitPartKey,
  data: RefrigerantCircuitData,
  laiteTyyppi = '',
): string {
  const status = circuitPartStatus(data, part);
  if (status === 'na' || !circuitPartHasData(data, part)) return '';

  if (part === 'paisuntaventtiili') {
    const tyyppi = data.paisuntaventtiiliTyyppi
      ? expansionValveTypeLabel(data.paisuntaventtiiliTyyppi)
      : '';
    return [tyyppi, data.paisuntaventtiiliValmistaja, data.paisuntaventtiiliMalli]
      .map((v) => String(v ?? '').trim())
      .filter(Boolean)
      .join(' · ');
  }
  if (part === 'magneettiventtiili') {
    if (!refrigerantCircuitHasMagnetValve(laiteTyyppi, data.paisuntaventtiiliTyyppi)) return '';
    return [data.magneettiventtiiliValmistaja, data.magneettiventtiiliMalli]
      .map((v) => String(v ?? '').trim())
      .filter(Boolean)
      .join(' · ');
  }
  return [data.kuivainValmistaja, data.kuivainMalli]
    .map((v) => String(v ?? '').trim())
    .filter(Boolean)
    .join(' · ');
}
