import { useEffect } from 'react';

import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { createEmptyRefrigerantCircuitData } from '../../lib/huoltoRaportti/defaults';
import {
  isAirCondenserType,
  isHeatPumpCircuitsDevice,
  isSharedEvaporatorAcrossCircuits,
  showChillerCondenserInCircuit,
  showEvaporatorInCircuit,
} from '../../lib/huoltoRaportti/deviceModuleLogic';
import { buildRefrigerantCircuitWarnings } from '../../lib/huoltoRaportti/mlpEnergyCalc';
import { hideMaintenancePrintWarnings } from '../../lib/huoltoRaportti/defaults';
import { kylmaainePiiriCircuitLabel, kylmaainePiiriSectionTitle } from '../../lib/huoltoRaportti/sectionTitles';
import { useHuoltoPrintFormLayout } from '../../hooks/useHuoltoPrintFormLayout';
import ToggleSwitch from '../ToggleSwitch';
import { EvaporatorModule } from './EvaporatorModule';
import { HuoltoModuleSection } from './HuoltoModuleSection';
import { RefrigerantCircuitModule } from './RefrigerantCircuitModule';
import { PrintWarningBanner } from './print/MaintenancePrintLayout';
import {
  createEvaporatorActions,
  evaporatorTitleForIndex,
} from './useEvaporatorCircuits';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
}

export function RefrigerantCircuitsSection({ form, onChange }: Props) {
  const printLayout = useHuoltoPrintFormLayout();
  const circuitCount = Math.min(3, Math.max(1, parseInt(form.kylmaainePiireja, 10) || 1));
  const isMLP = form.laiteTyyppi === 'mlp';
  const splitHeatPumpCircuits = isHeatPumpCircuitsDevice(form.laiteTyyppi);
  const condenserType = form.lauhdutinTyyppiLaite ?? form.condenserData[0]?.tyyppi;
  const showChillerCondenser = showChillerCondenserInCircuit(
    form.laiteTyyppi,
    form.selectedModules,
    condenserType,
  );
  const showInlineEvaporator = showEvaporatorInCircuit(form.laiteTyyppi, form.selectedModules);
  const sharedEvaporator = isSharedEvaporatorAcrossCircuits(
    form.laiteTyyppi,
    form.hoyrystinYhteinenPiireissa,
  );
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
    if (sharedEvaporator && circuitIndex > 0) return null;
    const evaporator = form.evaporatorData[circuitIndex];
    if (!evaporator) return null;

    return (
      <EvaporatorModule
        key={`evaporator-${circuitIndex}`}
        index={circuitIndex}
        laiteTyyppi={form.laiteTyyppi}
        titleLabel={evaporatorTitleForIndex(form, circuitIndex)}
        data={evaporator}
        locked={false}
        showSameAsFirst={circuitIndex > 0 && !sharedEvaporator}
        sameAsFirst={form.evaporatorSamaKuinEnsimmainen[circuitIndex]}
        onSameAsFirstChange={(v) => setSameAsFirst(circuitIndex, v)}
        onChange={(data) => updateEvaporator(circuitIndex, data)}
      />
    );
  }

  function renderCircuitBlock(
    circuitNumber: 1 | 2 | 3,
    circuitData: HuoltoReportData['kylmaainePiiri1'],
    circuitIndex: number,
  ) {
    const firstCircuit = circuitNumber > 1 ? form.kylmaainePiiri1 : undefined;
    return (
      <>
        <RefrigerantCircuitModule
          circuitNumber={circuitNumber}
          data={circuitData}
          onChange={(data) => updateCircuit(circuitNumber, data)}
          refrigerantType={form.kylmaaineTyyppi}
          isMLP={isMLP}
          laiteTyyppi={form.laiteTyyppi}
          firstCircuitData={firstCircuit}
          showChillerCondenserInCircuit={
            showChillerCondenser && (circuitNumber === 1 || !form.vjNestelauhdutusJaettu)
          }
          chillerCondenser={
            showChillerCondenser && (circuitNumber === 1 || !form.vjNestelauhdutusJaettu)
              ? form.condenserData[circuitIndex]
              : undefined
          }
          onChillerCondenserChange={
            showChillerCondenser && (circuitNumber === 1 || !form.vjNestelauhdutusJaettu)
              ? (patch) => updateCondenser(circuitIndex, patch)
              : undefined
          }
        />
        {renderInlineEvaporator(circuitIndex)}
      </>
    );
  }

  const chillerHelp = (
    <>
      {isAirCondenserType(condenserType) && (
        <p className="muted huolto-help">
          Ilmalauhduttimen tiedot täytetään kylmäainepiirin alle. Nestekiertoista lauhdutuspiiriä ei käytetä.
        </p>
      )}
      {showInlineEvaporator && form.laiteTyyppi === 'vakioilmastointtikone' && (
        <label className="checkbox-inline huolto-span-all">
          <ToggleSwitch
            label="Yhteinen höyrystin kaikille kylmäainepiireille"
            checked={form.hoyrystinYhteinenPiireissa ?? true}
            onChange={(checked) => onChange({ hoyrystinYhteinenPiireissa: checked })}
          />
        </label>
      )}
      {showInlineEvaporator && (
        <p className="muted huolto-help">
          {sharedEvaporator
            ? 'Yhteinen höyrystin — täytä tiedot vain ensimmäisen piirin alle.'
            : 'Höyrystimen tiedot täytetään kylmäainepiirin alle. Täytä ensin piirin mittaukset ja komponentit, sitten höyrystin.'}
        </p>
      )}
    </>
  );

  const circuitWarnings =
    printLayout && !hideMaintenancePrintWarnings(form) && form.laiteTyyppi !== 'lämpöpumppu'
      ? buildRefrigerantCircuitWarnings(form)
      : [];

  const warningsBanner =
    circuitWarnings.length > 0 ? (
      <PrintWarningBanner title="Huomioitavaa — kylmäainepiiri">
        <ul>
          {circuitWarnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </PrintWarningBanner>
    ) : null;

  if (splitHeatPumpCircuits) {
    return (
      <>
        <HuoltoModuleSection
          moduleKey="kylmaainePiiri"
          title={kylmaainePiiriCircuitLabel(form.laiteTyyppi, 1)}
        >
          {renderCircuitBlock(1, form.kylmaainePiiri1, 0)}
        </HuoltoModuleSection>
        {circuitCount >= 2 && form.kylmaainePiiri2 ? (
          <HuoltoModuleSection
            moduleKey="kylmaainePiiri"
            title={kylmaainePiiriCircuitLabel(form.laiteTyyppi, 2)}
          >
            {renderCircuitBlock(2, form.kylmaainePiiri2, 1)}
          </HuoltoModuleSection>
        ) : null}
        {circuitCount >= 3 && form.kylmaainePiiri3 ? (
          <HuoltoModuleSection
            moduleKey="kylmaainePiiri"
            title={kylmaainePiiriCircuitLabel(form.laiteTyyppi, 3)}
          >
            {renderCircuitBlock(3, form.kylmaainePiiri3, 2)}
          </HuoltoModuleSection>
        ) : null}
        {warningsBanner}
      </>
    );
  }

  return (
    <HuoltoModuleSection
      moduleKey="kylmaainePiiri"
      title={kylmaainePiiriSectionTitle(form.laiteTyyppi)}
    >
      {chillerHelp}
      {renderCircuitBlock(1, form.kylmaainePiiri1, 0)}
      {circuitCount >= 2 && form.kylmaainePiiri2 ? renderCircuitBlock(2, form.kylmaainePiiri2, 1) : null}
      {circuitCount >= 3 && form.kylmaainePiiri3 ? renderCircuitBlock(3, form.kylmaainePiiri3, 2) : null}
      {warningsBanner}
    </HuoltoModuleSection>
  );
}
