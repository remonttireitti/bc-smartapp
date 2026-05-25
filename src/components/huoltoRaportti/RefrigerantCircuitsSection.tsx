import { useEffect } from 'react';

import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { createEmptyRefrigerantCircuitData } from '../../lib/huoltoRaportti/defaults';
import {
  isAirCondenserType,
  showChillerCondenserInCircuit,
  showEvaporatorInCircuit,
} from '../../lib/huoltoRaportti/deviceModuleLogic';
import { EvaporatorModule } from './EvaporatorModule';
import { HuoltoModuleSection } from './HuoltoModuleSection';
import { RefrigerantCircuitModule } from './RefrigerantCircuitModule';
import {
  createEvaporatorActions,
  evaporatorTitleForIndex,
} from './useEvaporatorCircuits';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
}

export function RefrigerantCircuitsSection({ form, onChange }: Props) {
  const circuitCount = Math.min(3, Math.max(1, parseInt(form.kylmaainePiireja, 10) || 1));
  const isMLP = form.laiteTyyppi === 'mlp' || form.laiteTyyppi === 'vesiilmalampopumppu';
  const condenserType = form.lauhdutinTyyppiLaite ?? form.condenserData[0]?.tyyppi;
  const showChillerCondenser = showChillerCondenserInCircuit(
    form.laiteTyyppi,
    form.selectedModules,
    condenserType,
  );
  const showInlineEvaporator = showEvaporatorInCircuit(form.laiteTyyppi, form.selectedModules);
  const { updateEvaporator, setSameAsFirst } = createEvaporatorActions(form, onChange);

  useEffect(() => {
    const patch: Partial<HuoltoReportData> = {};
    if (circuitCount >= 2 && !form.kylmaainePiiri2) {
      patch.kylmaainePiiri2 = createEmptyRefrigerantCircuitData();
    }
    if (circuitCount >= 3 && !form.kylmaainePiiri3) {
      patch.kylmaainePiiri3 = createEmptyRefrigerantCircuitData();
    }
    if (circuitCount < 2) {
      patch.kylmaainePiiri2 = null;
      patch.kylmaainePiiri3 = null;
    } else if (circuitCount < 3) {
      patch.kylmaainePiiri3 = null;
    }
    if (Object.keys(patch).length > 0) onChange(patch);
  }, [circuitCount, form.kylmaainePiiri2, form.kylmaainePiiri3, onChange]);

  function updateCircuit(
    circuitNumber: 1 | 2 | 3,
    data: HuoltoReportData['kylmaainePiiri1'],
  ) {
    const key = `kylmaainePiiri${circuitNumber}` as const;
    if (circuitNumber === 1) {
      onChange({ kylmaainePiiri1: data });
      return;
    }
    onChange({ [key]: data } as Partial<HuoltoReportData>);
  }

  function updateCondenser(circuitIndex: number, patch: Partial<HuoltoReportData['condenserData'][number]>) {
    const next = [...form.condenserData];
    next[circuitIndex] = { ...next[circuitIndex], ...patch, tyyppi: condenserType || next[circuitIndex]?.tyyppi };
    onChange({ condenserData: next });
  }

  function renderInlineEvaporator(circuitIndex: number) {
    if (!showInlineEvaporator) return null;
    const evaporator = form.evaporatorData[circuitIndex];
    if (!evaporator) return null;

    return (
      <EvaporatorModule
        key={`evaporator-${circuitIndex}`}
        index={circuitIndex}
        titleLabel={evaporatorTitleForIndex(form, circuitIndex)}
        data={evaporator}
        locked={false}
        showSameAsFirst={circuitIndex > 0}
        sameAsFirst={form.evaporatorSamaKuinEnsimmainen[circuitIndex]}
        onSameAsFirstChange={(v) => setSameAsFirst(circuitIndex, v)}
        onChange={(data) => updateEvaporator(circuitIndex, data)}
      />
    );
  }

  return (
    <HuoltoModuleSection moduleKey="kylmaainePiiri" title="Kylmäainepiiri">
      {isAirCondenserType(condenserType) && (
        <p className="muted huolto-help">
          Ilmalauhduttimen tiedot täytetään kylmäainepiirin alle. Nestekiertoista lauhdutuspiiriä ei käytetä.
        </p>
      )}
      {showInlineEvaporator && (
        <p className="muted huolto-help">
          Höyrystimen tiedot täytetään kylmäainepiirin alle. Täytä ensin piirin mittaukset ja komponentit, sitten
          höyrystin.
        </p>
      )}

      <RefrigerantCircuitModule
        circuitNumber={1}
        data={form.kylmaainePiiri1}
        onChange={(data) => updateCircuit(1, data)}
        refrigerantType={form.kylmaaineTyyppi}
        isMLP={isMLP}
        laiteTyyppi={form.laiteTyyppi}
        showChillerCondenserInCircuit={showChillerCondenser}
        chillerCondenser={showChillerCondenser ? form.condenserData[0] : undefined}
        onChillerCondenserChange={
          showChillerCondenser ? (patch) => updateCondenser(0, patch) : undefined
        }
      />
      {renderInlineEvaporator(0)}

      {circuitCount >= 2 && form.kylmaainePiiri2 && (
        <>
          <RefrigerantCircuitModule
            circuitNumber={2}
            data={form.kylmaainePiiri2}
            onChange={(data) => updateCircuit(2, data)}
            refrigerantType={form.kylmaaineTyyppi}
            isMLP={isMLP}
            laiteTyyppi={form.laiteTyyppi}
            firstCircuitData={form.kylmaainePiiri1}
            showChillerCondenserInCircuit={showChillerCondenser && !form.vjNestelauhdutusJaettu}
            chillerCondenser={
              showChillerCondenser && !form.vjNestelauhdutusJaettu ? form.condenserData[1] : undefined
            }
            onChillerCondenserChange={
              showChillerCondenser && !form.vjNestelauhdutusJaettu
                ? (patch) => updateCondenser(1, patch)
                : undefined
            }
          />
          {renderInlineEvaporator(1)}
        </>
      )}

      {circuitCount >= 3 && form.kylmaainePiiri3 && (
        <>
          <RefrigerantCircuitModule
            circuitNumber={3}
            data={form.kylmaainePiiri3}
            onChange={(data) => updateCircuit(3, data)}
            refrigerantType={form.kylmaaineTyyppi}
            isMLP={isMLP}
            laiteTyyppi={form.laiteTyyppi}
            firstCircuitData={form.kylmaainePiiri1}
            showChillerCondenserInCircuit={showChillerCondenser && !form.vjNestelauhdutusJaettu}
            chillerCondenser={
              showChillerCondenser && !form.vjNestelauhdutusJaettu ? form.condenserData[2] : undefined
            }
            onChillerCondenserChange={
              showChillerCondenser && !form.vjNestelauhdutusJaettu
                ? (patch) => updateCondenser(2, patch)
                : undefined
            }
          />
          {renderInlineEvaporator(2)}
        </>
      )}
    </HuoltoModuleSection>
  );
}
