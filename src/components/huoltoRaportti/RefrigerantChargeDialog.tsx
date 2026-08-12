import { useMemo } from 'react';
import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { refrigerantTypes } from '../../lib/huoltoRaportti/constants';
import { calculateCO2Ekv, getRefrigerantGWP } from '../../lib/huoltoRaportti/utils';
import { kylmaaineChargeTitle } from '../../lib/huoltoRaportti/sectionTitles';
import { useMaintenanceDocumentLayout } from '../../hooks/useMaintenanceDocumentLayout';
import { FormInput } from './FormInput';
import { HuoltoPartSection } from './HuoltoPartSection';
import { HuoltoInspectionDialogShell, useHuoltoInspectionDialog } from './HuoltoInspectionDialogShell';
import { useRegisterHuoltoModuleDialog } from './HuoltoModuleDialogContext';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
  documentModuleKey?: string;
}

function calcTotalAmountKg(form: HuoltoReportData): number {
  const piireja = form.kylmaainePiireja;
  if (piireja === '1' || !piireja) {
    const valmistajaKg = parseFloat(form.kylmaaineValmistajaMaara || '') || 0;
    const lisattyKg = parseFloat(form.kylmaaineLisattyMaara || '') || 0;
    return valmistajaKg + lisattyKg;
  }
  const p1 = parseFloat(form.kylmaaineMaaraPiiri1 || '') || 0;
  const p2 = parseFloat(form.kylmaaineMaaraPiiri2 || '') || 0;
  const p3 = parseFloat(form.kylmaaineMaaraPiiri3 || '') || 0;
  const p4 = parseFloat(form.kylmaaineMaaraPiiri4 || '') || 0;
  return p1 + p2 + p3 + p4;
}

export function RefrigerantChargeDialogFields({
  form,
  onChange,
}: {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
}) {
  const hidePipeLength = form.laiteTyyppi === 'lämpöpumppu' || form.laiteTyyppi === 'mlp';
  const hideCircuitCount = form.laiteTyyppi === 'lämpöpumppu';
  const singleCircuit = form.kylmaainePiireja === '1' || !form.kylmaainePiireja;

  const totalKg = useMemo(() => calcTotalAmountKg(form), [form]);
  const gwp = form.kylmaaineTyyppi ? getRefrigerantGWP(form.kylmaaineTyyppi) : 0;
  const co2Tonnes = useMemo(() => {
    if (gwp <= 0 || totalKg <= 0) return '';
    return calculateCO2Ekv(totalKg, gwp).toFixed(2);
  }, [gwp, totalKg]);

  const totalDisplay = totalKg > 0 ? totalKg.toFixed(2) : '';

  return (
    <>
      <div className="line-form-grid">
        <label>
          Kylmäaine
          <select
            value={form.kylmaaineTyyppi}
            onChange={(e) => onChange({ kylmaaineTyyppi: e.target.value, kylmaaineLaatu: '' })}
          >
            <option value="">Valitse…</option>
            {refrigerantTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        {gwp > 0 ? (
          <FormInput label="GWP" value={String(gwp)} onChange={() => {}} disabled />
        ) : null}
        <FormInput
          label="CO₂-ekvivalentti (t)"
          value={co2Tonnes}
          onChange={() => {}}
          placeholder="Lasketaan automaattisesti"
          disabled
        />
      </div>

      {!hideCircuitCount ? (
        <HuoltoPartSection title="Kylmäpiirejä" defaultOpen>
          <div className="btn-group">
            {['1', '2', '3', '4'].map((num) => (
              <button
                key={num}
                type="button"
                className={`btn btn-secondary btn-sm ${form.kylmaainePiireja === num ? 'btn-active' : ''}`}
                onClick={() => onChange({ kylmaainePiireja: num })}
              >
                {num}
              </button>
            ))}
          </div>
        </HuoltoPartSection>
      ) : null}

      <div className="line-form-grid">
        {singleCircuit ? (
          <>
            <FormInput
              label="Valmistajan kylmäaine määrä (kg)"
              value={form.kylmaaineValmistajaMaara || ''}
              onChange={(v) => onChange({ kylmaaineValmistajaMaara: v })}
              type="number"
            />
            <FormInput
              label="Lisätty kylmäaine määrä (kg)"
              value={form.kylmaaineLisattyMaara || ''}
              onChange={(v) => onChange({ kylmaaineLisattyMaara: v })}
              type="number"
            />
            {!hidePipeLength ? (
              <FormInput
                label="Putkimatka (m)"
                value={form.kylmaainePutkimatka || ''}
                onChange={(v) => onChange({ kylmaainePutkimatka: v })}
                type="number"
              />
            ) : null}
          </>
        ) : (
          <>
            <FormInput
              label="Piiri 1 (kg)"
              value={form.kylmaaineMaaraPiiri1 || ''}
              onChange={(v) => onChange({ kylmaaineMaaraPiiri1: v })}
              type="number"
            />
            {form.kylmaainePiireja !== '1' ? (
              <FormInput
                label="Piiri 2 (kg)"
                value={form.kylmaaineMaaraPiiri2 || ''}
                onChange={(v) => onChange({ kylmaaineMaaraPiiri2: v })}
                type="number"
              />
            ) : null}
            {(form.kylmaainePiireja === '3' || form.kylmaainePiireja === '4') && (
              <FormInput
                label="Piiri 3 (kg)"
                value={form.kylmaaineMaaraPiiri3 || ''}
                onChange={(v) => onChange({ kylmaaineMaaraPiiri3: v })}
                type="number"
              />
            )}
            {form.kylmaainePiireja === '4' && (
              <FormInput
                label="Piiri 4 (kg)"
                value={form.kylmaaineMaaraPiiri4 || ''}
                onChange={(v) => onChange({ kylmaaineMaaraPiiri4: v })}
                type="number"
              />
            )}
          </>
        )}
        <FormInput
          label="Kylmäaineen määrä yhteensä (kg)"
          value={totalDisplay}
          onChange={() => {}}
          disabled
          type="number"
        />
      </div>
    </>
  );
}

export function RefrigerantChargeDialog({ form, onChange, documentModuleKey }: Props) {
  const documentLayout = useMaintenanceDocumentLayout();
  const hideLauncher = documentLayout && !!documentModuleKey;
  const title = kylmaaineChargeTitle(form.laiteTyyppi);

  const { open, openDialog, closeDialog, draft, setDraft } = useHuoltoInspectionDialog({
    data: form,
    onChange,
    canSave: (next) => Boolean(next.kylmaaineTyyppi?.trim()),
  });

  useRegisterHuoltoModuleDialog(documentModuleKey, openDialog);

  const patchDraft = (patch: Partial<HuoltoReportData>) => setDraft((prev) => ({ ...prev, ...patch }));

  return (
    <>
      {!hideLauncher ? (
        <button type="button" className="btn btn-secondary btn-sm" onClick={openDialog}>
          {title}
        </button>
      ) : null}

      <HuoltoInspectionDialogShell
        open={open}
        title={title}
        titleId="kylmaaine-charge-dialog-title"
        onClose={closeDialog}
      >
        <RefrigerantChargeDialogFields form={draft} onChange={patchDraft} />
      </HuoltoInspectionDialogShell>
    </>
  );
}
