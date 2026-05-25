import { useMemo } from 'react';
import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { refrigerantTypes } from '../../lib/huoltoRaportti/constants';
import { calculateCO2Ekv, getRefrigerantGWP } from '../../lib/huoltoRaportti/utils';
import { FormInput } from './FormInput';
import { HuoltoModuleSection } from './HuoltoModuleSection';
import { HuoltoPartSection } from './HuoltoPartSection';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
  defaultOpen?: boolean;
}

function calcTotalAmountKg(form: HuoltoReportData): number {
  const piireja = form.kylmaainePiireja;
  if (piireja === '1' || !piireja) {
    const valmistajaG = parseFloat(form.kylmaaineValmistajaMaara || '') || 0;
    const lisattyG = parseFloat(form.kylmaaineLisattyMaara || '') || 0;
    return (valmistajaG + lisattyG) / 1000;
  }
  const p1 = parseFloat(form.kylmaaineMaaraPiiri1 || '') || 0;
  const p2 = parseFloat(form.kylmaaineMaaraPiiri2 || '') || 0;
  const p3 = parseFloat(form.kylmaaineMaaraPiiri3 || '') || 0;
  const p4 = parseFloat(form.kylmaaineMaaraPiiri4 || '') || 0;
  return p1 + p2 + p3 + p4;
}

export function RefrigerantChargeSection({ form, onChange, defaultOpen }: Props) {
  const hidePipeLength = form.laiteTyyppi === 'lämpöpumppu' || form.laiteTyyppi === 'mlp';
  const hideCircuitCount = form.laiteTyyppi === 'lämpöpumppu';
  const singleCircuit = form.kylmaainePiireja === '1' || !form.kylmaainePiireja;

  const totalKg = useMemo(() => calcTotalAmountKg(form), [form]);
  const co2Tonnes = useMemo(() => {
    const gwp = getRefrigerantGWP(form.kylmaaineTyyppi);
    if (gwp <= 0 || totalKg <= 0) return '';
    return calculateCO2Ekv(totalKg, gwp).toFixed(2);
  }, [form.kylmaaineTyyppi, totalKg]);

  const totalDisplay = singleCircuit
    ? (() => {
        const valmistajaG = parseFloat(form.kylmaaineValmistajaMaara || '') || 0;
        const lisattyG = parseFloat(form.kylmaaineLisattyMaara || '') || 0;
        const totalG = valmistajaG + lisattyG;
        return totalG > 0 ? totalG.toFixed(2) : '';
      })()
    : totalKg > 0
      ? totalKg.toFixed(2)
      : '';

  return (
    <HuoltoModuleSection moduleKey="kylmaaineCharge" title="Kylmäaine" defaultOpen={defaultOpen}>
      <div className="line-form-grid">
        <label>
          Kylmäaine
          <select
            value={form.kylmaaineTyyppi}
            onChange={(e) => onChange({ kylmaaineTyyppi: e.target.value })}
          >
            <option value="">Valitse…</option>
            {refrigerantTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <FormInput
          label="Kylmäaineen laatu"
          value={form.kylmaaineLaatu || ''}
          onChange={(v) => onChange({ kylmaaineLaatu: v })}
        />
        <FormInput
          label="CO₂-ekvivalentti (t)"
          value={co2Tonnes}
          onChange={() => {}}
          placeholder="Lasketaan automaattisesti"
          disabled
        />
      </div>

      {!hideCircuitCount && (
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
      )}

      <div className="line-form-grid">
        {singleCircuit ? (
          <>
            <FormInput
              label="Valmistajan kylmäaine määrä (g)"
              value={form.kylmaaineValmistajaMaara || ''}
              onChange={(v) => onChange({ kylmaaineValmistajaMaara: v })}
              type="number"
            />
            <FormInput
              label="Lisätty kylmäaine määrä (g)"
              value={form.kylmaaineLisattyMaara || ''}
              onChange={(v) => onChange({ kylmaaineLisattyMaara: v })}
              type="number"
            />
            {!hidePipeLength && (
              <FormInput
                label="Putkimatka (m)"
                value={form.kylmaainePutkimatka || ''}
                onChange={(v) => onChange({ kylmaainePutkimatka: v })}
                type="number"
              />
            )}
          </>
        ) : (
          <>
            <FormInput
              label="Piiri 1 (kg)"
              value={form.kylmaaineMaaraPiiri1 || ''}
              onChange={(v) => onChange({ kylmaaineMaaraPiiri1: v })}
              type="number"
            />
            {form.kylmaainePiireja !== '1' && (
              <FormInput
                label="Piiri 2 (kg)"
                value={form.kylmaaineMaaraPiiri2 || ''}
                onChange={(v) => onChange({ kylmaaineMaaraPiiri2: v })}
                type="number"
              />
            )}
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
          label={singleCircuit ? 'Kylmäaineen määrä yhteensä (g)' : 'Kylmäaineen määrä yhteensä (kg)'}
          value={totalDisplay}
          onChange={() => {}}
          disabled
          type="number"
        />
      </div>
    </HuoltoModuleSection>
  );
}
