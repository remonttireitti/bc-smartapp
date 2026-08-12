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
  type RefrigerantCircuitPartKey,
} from '../../lib/huoltoRaportti/circuitPartInspection';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';
import { BinaryInspectionToggle } from './BinaryInspectionToggle';
import { PrintGridField, PrintInspectionBlock } from './print/MaintenancePrintLayout';

interface Props {
  part: RefrigerantCircuitPartKey;
  data: RefrigerantCircuitData;
  laiteTyyppi?: string;
  disabled?: boolean;
  onChange: (data: RefrigerantCircuitData) => void;
}

export function RefrigerantCircuitPartFields({
  part,
  data,
  laiteTyyppi = '',
  disabled = false,
  onChange,
}: Props) {
  const showMagnetValve = refrigerantCircuitHasMagnetValve(laiteTyyppi, data.paisuntaventtiiliTyyppi);
  const hasData = circuitPartHasData(data, part);
  const okChoice = binaryChoiceFromStatus(circuitPartStatus(data, part));

  const patch = (next: Partial<RefrigerantCircuitData>) => onChange({ ...data, ...next });

  const setStatus = (ok: boolean) => {
    if (part === 'paisuntaventtiili') {
      onChange({ ...data, ...applyExpansionValveInspectionPatch(ok ? 'ok' : 'faulty') });
      return;
    }
    if (part === 'magneettiventtiili') {
      onChange({ ...data, ...applyMagnetValveInspectionPatch(ok ? 'ok' : 'faulty') });
      return;
    }
    onChange({ ...data, ...applyDryerInspectionPatch(ok ? 'ok' : 'faulty') });
  };

  const faultNote =
    part === 'paisuntaventtiili'
      ? data.paisuntaventtiiliHuomio ?? ''
      : part === 'magneettiventtiili'
        ? data.magneettiventtiiliHuomio ?? ''
        : data.kuivainLisatieto ?? '';

  const setFaultNote = (value: string) => {
    if (part === 'paisuntaventtiili') patch({ paisuntaventtiiliHuomio: value });
    else if (part === 'magneettiventtiili') patch({ magneettiventtiiliHuomio: value });
    else patch({ kuivainLisatieto: value });
  };

  return (
    <>
      {part === 'paisuntaventtiili' ? (
        <div className="line-form-grid konvektori-mittaukset-grid">
          <label className="huolto-span-all">
            Paisuntaventtiilin tyyppi
            <select
              value={data.paisuntaventtiiliTyyppi}
              disabled={disabled}
              onChange={(e) => {
                const tyyppi = e.target.value;
                const next = { ...data, paisuntaventtiiliTyyppi: tyyppi };
                if (!refrigerantCircuitHasMagnetValve(laiteTyyppi, tyyppi)) {
                  next.magneettiventtiiliTila = 'na';
                  next.magneettiventtiiliTestattu = false;
                  next.magneettiventtiiliValmistaja = '';
                  next.magneettiventtiiliMalli = '';
                }
                onChange(next);
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
          {data.paisuntaventtiiliTyyppi === 'MUU' ? (
            <FormInput
              label="Muu tyyppi"
              value={data.paisuntaventtiiliMuu ?? ''}
              disabled={disabled}
              onChange={(v) => patch({ paisuntaventtiiliMuu: v })}
            />
          ) : null}
          <FormInput
            label="Valmistaja"
            value={data.paisuntaventtiiliValmistaja ?? ''}
            disabled={disabled}
            onChange={(v) => patch({ paisuntaventtiiliValmistaja: v })}
          />
          <FormInput
            label="Malli"
            value={data.paisuntaventtiiliMalli ?? ''}
            disabled={disabled}
            onChange={(v) => patch({ paisuntaventtiiliMalli: v })}
          />
          {!showMagnetValve ? (
            <FormCheckbox
              label="Nestelasi kuiva"
              checked={!!data.nestelasiKuiva}
              disabled={disabled}
              onChange={(v) => patch({ nestelasiKuiva: v })}
            />
          ) : null}
        </div>
      ) : null}

      {part === 'magneettiventtiili' ? (
        <div className="line-form-grid konvektori-mittaukset-grid">
          <FormInput
            label="Valmistaja"
            value={data.magneettiventtiiliValmistaja ?? ''}
            disabled={disabled}
            onChange={(v) => patch({ magneettiventtiiliValmistaja: v })}
          />
          <FormInput
            label="Malli"
            value={data.magneettiventtiiliMalli ?? ''}
            disabled={disabled}
            onChange={(v) => patch({ magneettiventtiiliMalli: v })}
          />
          <FormCheckbox
            label="Nestelasi kuiva"
            checked={!!data.nestelasiKuiva}
            disabled={disabled}
            onChange={(v) => patch({ nestelasiKuiva: v })}
          />
        </div>
      ) : null}

      {part === 'kuivain' ? (
        <div className="line-form-grid konvektori-mittaukset-grid">
          <FormInput
            label="Valmistaja"
            value={data.kuivainValmistaja ?? ''}
            disabled={disabled}
            onChange={(v) => patch({ kuivainValmistaja: v })}
          />
          <FormInput
            label="Malli"
            value={data.kuivainMalli ?? ''}
            disabled={disabled}
            onChange={(v) => patch({ kuivainMalli: v })}
          />
          <FormInput
            label="Kivien määrä"
            value={data.kuivainKivienMaara ?? ''}
            disabled={disabled}
            onChange={(v) => patch({ kuivainKivienMaara: v })}
            type="number"
          />
        </div>
      ) : null}

      {hasData ? (
        <>
          <PrintInspectionBlock label="Tarkastuksen tulos">
            <BinaryInspectionToggle
              name={`${part}-tila-inline`}
              value={okChoice}
              disabled={disabled}
              onChange={setStatus}
            />
          </PrintInspectionBlock>
          {okChoice === false ? (
            <PrintGridField label="Huomio / vika" className="huolto-span-all">
              <textarea
                rows={3}
                value={faultNote}
                disabled={disabled}
                placeholder="Kuvaile vika tai puute…"
                onChange={(e) => setFaultNote(e.target.value)}
              />
            </PrintGridField>
          ) : null}
        </>
      ) : (
        <p className="muted huolto-help">Jätä tyhjäksi jos osaa ei ole laitteessa.</p>
      )}
    </>
  );
}
