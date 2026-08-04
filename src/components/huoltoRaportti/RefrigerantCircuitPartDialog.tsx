import { useEffect, useState } from 'react';
import type { RefrigerantCircuitData } from '../../lib/huoltoRaportti/types';
import { expansionValveTypes } from '../../lib/huoltoRaportti/constants';
import { refrigerantCircuitHasMagnetValve } from '../../lib/huoltoRaportti/deviceModuleLogic';
import {
  applyDryerInspectionPatch,
  applyExpansionValveInspectionPatch,
  applyMagnetValveInspectionPatch,
  dryerInspectionStatus,
  expansionValveInspectionStatus,
  magnetValveInspectionStatus,
  type HuoltoInspectionStatus,
} from '../../lib/huoltoRaportti/huoltoInspectionStatus';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';
import { TriStateInspectionToggle } from './TriStateInspectionToggle';

export type RefrigerantCircuitPartKey = 'paisuntaventtiili' | 'magneettiventtiili' | 'kuivain';

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
  const showMagnetValve = refrigerantCircuitHasMagnetValve(laiteTyyppi, draft.paisuntaventtiiliTyyppi);

  useEffect(() => {
    if (open) setDraft(data);
  }, [open, data]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const title =
    part === 'paisuntaventtiili'
      ? `Paisuntaventtiili — piiri ${circuitNumber}`
      : part === 'magneettiventtiili'
        ? `Magneettiventtiili — piiri ${circuitNumber}`
        : `Kuivain — piiri ${circuitNumber}`;

  const setStatus = (status: Exclude<HuoltoInspectionStatus, null>) => {
    if (part === 'paisuntaventtiili') {
      setDraft((prev) => ({ ...prev, ...applyExpansionValveInspectionPatch(status) }));
      return;
    }
    if (part === 'magneettiventtiili') {
      setDraft((prev) => ({ ...prev, ...applyMagnetValveInspectionPatch(status) }));
      return;
    }
    setDraft((prev) => ({ ...prev, ...applyDryerInspectionPatch(status) }));
  };

  const currentStatus =
    part === 'paisuntaventtiili'
      ? expansionValveInspectionStatus(draft)
      : part === 'magneettiventtiili'
        ? magnetValveInspectionStatus(draft)
        : dryerInspectionStatus(draft);

  const showDetails = currentStatus === 'ok' || currentStatus === 'faulty';

  return (
    <div className="leave-draft-overlay konvektori-dialog-overlay" role="presentation" onClick={onClose}>
      <div
        className="leave-draft-dialog panel konvektori-tarkastus-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="circuit-part-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="circuit-part-dialog-title">{title}</h2>
        <p className="muted konvektori-dialog-help">
          Valitse onko osa tarkastettu ja kunnossa, viallinen vai ei kuulu tarkastukseen (ei laitteessa).
        </p>

        <div className="konvektori-tarkastus-item">
          <span className="konvektori-tarkastus-label">Tarkastuksen tulos</span>
          <TriStateInspectionToggle
            name={`${part}-tila`}
            value={currentStatus}
            onChange={setStatus}
          />
        </div>

        {showDetails && part === 'paisuntaventtiili' ? (
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

        {showDetails && part === 'magneettiventtiili' ? (
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

        {showDetails && part === 'kuivain' ? (
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
            {currentStatus === 'ok' ? (
              <FormInput
                label="Lisätieto"
                value={draft.kuivainLisatieto ?? ''}
                onChange={(v) => setDraft((prev) => ({ ...prev, kuivainLisatieto: v }))}
              />
            ) : null}
          </div>
        ) : null}

        {currentStatus === 'faulty' ? (
          <label className="konvektori-huomio-field">
            <span className="konvektori-tarkastus-label">Mikä on vikana?</span>
            <textarea
              rows={3}
              value={
                part === 'paisuntaventtiili'
                  ? draft.paisuntaventtiiliHuomio ?? ''
                  : part === 'magneettiventtiili'
                    ? draft.magneettiventtiiliHuomio ?? ''
                    : draft.kuivainLisatieto ?? ''
              }
              onChange={(e) => {
                const value = e.target.value;
                if (part === 'paisuntaventtiili') {
                  setDraft((prev) => ({ ...prev, paisuntaventtiiliHuomio: value }));
                } else if (part === 'magneettiventtiili') {
                  setDraft((prev) => ({ ...prev, magneettiventtiiliHuomio: value }));
                } else {
                  setDraft((prev) => ({ ...prev, kuivainLisatieto: value }));
                }
              }}
              placeholder="Kuvaile vika…"
            />
          </label>
        ) : null}

        <div className="leave-draft-actions konvektori-dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Peruuta
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={currentStatus === null}
            onClick={() => {
              onSave(draft);
              onClose();
            }}
          >
            Tallenna
          </button>
        </div>
      </div>
    </div>
  );
}

export function circuitPartSubtitle(
  part: RefrigerantCircuitPartKey,
  data: RefrigerantCircuitData,
  laiteTyyppi = '',
): string {
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
    if (!refrigerantCircuitHasMagnetValve(laiteTyyppi, data.paisuntaventtiiliTyyppi)) return 'Ei magneettiventtiiliä';
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
