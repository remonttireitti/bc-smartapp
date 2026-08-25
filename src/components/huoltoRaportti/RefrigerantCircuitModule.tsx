import { useEffect, useState } from 'react';
import type { CondenserData, RefrigerantCircuitData } from '../../lib/huoltoRaportti/types';
import { refrigerantCircuitHasMagnetValve } from '../../lib/huoltoRaportti/deviceModuleLogic';
import { ChillerCondenserInCircuit } from './ChillerCondenserInCircuit';
import { CompressorModule } from './CompressorModule';
import { FormCheckbox } from './FormCheckbox';
import { RefrigerantCircuitMeasurementsDialog } from './RefrigerantCircuitMeasurementsDialog';
import { RefrigerantCircuitComponentsModule } from './RefrigerantCircuitComponentsModule';
import { useHuoltoPrintFormLayout } from '../../hooks/useHuoltoPrintFormLayout';
import { PRINT_BOX_COLORS } from '../../lib/huoltoRaportti/printBoxColors';
import { PrintInnerBox } from './print/MaintenancePrintLayout';

interface RefrigerantCircuitModuleProps {
  circuitNumber: number;
  data: RefrigerantCircuitData;
  onChange: (data: RefrigerantCircuitData) => void;
  refrigerantType?: string;
  isMLP?: boolean;
  laiteTyyppi?: string;
  firstCircuitData?: RefrigerantCircuitData;
  chillerCondenser?: CondenserData;
  onChillerCondenserChange?: (patch: Partial<CondenserData>) => void;
  showChillerCondenserInCircuit?: boolean;
  /** Tulistus/alijäähdytys -valinnat osion ⚙-asetuksista, ei inline-vivuista. */
  printSettingsInPopup?: boolean;
}

export function RefrigerantCircuitModule({
  circuitNumber,
  data,
  onChange,
  refrigerantType = '',
  isMLP = false,
  laiteTyyppi = 'muu',
  firstCircuitData,
  chillerCondenser,
  onChillerCondenserChange,
  showChillerCondenserInCircuit = false,
  printSettingsInPopup = true,
}: RefrigerantCircuitModuleProps) {
  const printLayout = useHuoltoPrintFormLayout();
  const [expanded, setExpanded] = useState(true);

  type CompressorKey =
    | 'kompressori1'
    | 'kompressori2'
    | 'kompressori3'
    | 'kompressori4'
    | 'kompressori5'
    | 'kompressori6';
  type SameAsFirstKey =
    | 'kompressori2SamaKuin1'
    | 'kompressori3SamaKuin1'
    | 'kompressori4SamaKuin1'
    | 'kompressori5SamaKuin1'
    | 'kompressori6SamaKuin1';

  const compressorByIndex: Record<number, CompressorKey> = {
    1: 'kompressori1',
    2: 'kompressori2',
    3: 'kompressori3',
    4: 'kompressori4',
    5: 'kompressori5',
    6: 'kompressori6',
  };
  const sameAsFirstByIndex: Partial<Record<number, SameAsFirstKey>> = {
    2: 'kompressori2SamaKuin1',
    3: 'kompressori3SamaKuin1',
    4: 'kompressori4SamaKuin1',
    5: 'kompressori5SamaKuin1',
    6: 'kompressori6SamaKuin1',
  };

  const syncLegacyTyyppi = (valmistaja: string | undefined, malli: string | undefined) =>
    [valmistaja, malli].map((s) => String(s ?? '').trim()).filter(Boolean).join(' ');

  const applySameManufacturerAndModelAsFirst = (target: RefrigerantCircuitData[CompressorKey]) => ({
    ...target,
    valmistaja: data.kompressori1.valmistaja ?? '',
    malli: data.kompressori1.malli ?? '',
    tyyppi: syncLegacyTyyppi(data.kompressori1.valmistaja, data.kompressori1.malli),
  });

  const updateCompressor = (index: number, nextCompressorData: RefrigerantCircuitData[CompressorKey]) => {
    const compressorKey = compressorByIndex[index];
    if (!compressorKey) return;
    const nextData: RefrigerantCircuitData = { ...data, [compressorKey]: nextCompressorData };

    if (index === 1) {
      for (const i of [2, 3, 4, 5, 6]) {
        const sameKey = sameAsFirstByIndex[i];
        const targetKey = compressorByIndex[i];
        if (!sameKey || !targetKey) continue;
        if (nextData[sameKey]) {
          nextData[targetKey] = {
            ...nextData[targetKey],
            valmistaja: nextCompressorData.valmistaja ?? '',
            malli: nextCompressorData.malli ?? '',
            tyyppi: syncLegacyTyyppi(nextCompressorData.valmistaja, nextCompressorData.malli),
          };
        }
      }
    } else {
      const sameKey = sameAsFirstByIndex[index];
      if (sameKey && nextData[sameKey]) {
        nextData[compressorKey] = applySameManufacturerAndModelAsFirst(nextData[compressorKey]);
      }
    }

    onChange(nextData);
  };

  const setSameAsFirst = (index: number, checked: boolean) => {
    const sameKey = sameAsFirstByIndex[index];
    const compressorKey = compressorByIndex[index];
    if (!sameKey || !compressorKey) return;
    const nextData: RefrigerantCircuitData = { ...data, [sameKey]: checked };
    if (checked) {
      nextData[compressorKey] = applySameManufacturerAndModelAsFirst(nextData[compressorKey]);
    }
    onChange(nextData);
  };

  const applyCrossCircuitSameAsFirst = (
    source: RefrigerantCircuitData,
    target: RefrigerantCircuitData,
  ): RefrigerantCircuitData => {
    let next = { ...target };
    if (next.kompressoritSamaKuinPiiri1) {
      next = {
        ...next,
        kompressorienMaara: source.kompressorienMaara,
        kompressori1: { ...source.kompressori1 },
        kompressori2: { ...source.kompressori2 },
        kompressori3: { ...source.kompressori3 },
        kompressori4: { ...source.kompressori4 },
        kompressori5: { ...source.kompressori5 },
        kompressori6: { ...source.kompressori6 },
      };
    }
    if (next.paisuntaventtiiliSamaKuinPiiri1) {
      next = {
        ...next,
        paisuntaventtiiliTyyppi: source.paisuntaventtiiliTyyppi,
        paisuntaventtiiliMuu: source.paisuntaventtiiliMuu ?? '',
        paisuntaventtiiliValmistaja: source.paisuntaventtiiliValmistaja ?? '',
        paisuntaventtiiliMalli: source.paisuntaventtiiliMalli ?? '',
        paisuntaventtiiliTila: source.paisuntaventtiiliTila ?? null,
        paisuntaventtiiliHuomio: source.paisuntaventtiiliHuomio ?? '',
        nestelasiKuiva: !!source.nestelasiKuiva,
      };
      if (!refrigerantCircuitHasMagnetValve(laiteTyyppi, next.paisuntaventtiiliTyyppi)) {
        next.magneettiventtiiliTestattu = false;
        next.magneettiventtiiliTila = 'na';
        next.magneettiventtiiliValmistaja = '';
        next.magneettiventtiiliMalli = '';
        next.magneettiventtiiliHuomio = '';
        next.magneettiventtiiliSamaKuinPiiri1 = false;
      }
    }
    if (
      next.magneettiventtiiliSamaKuinPiiri1 &&
      refrigerantCircuitHasMagnetValve(laiteTyyppi, next.paisuntaventtiiliTyyppi)
    ) {
      next = {
        ...next,
        magneettiventtiiliTestattu: !!source.magneettiventtiiliTestattu,
        magneettiventtiiliTila: source.magneettiventtiiliTila ?? null,
        magneettiventtiiliHuomio: source.magneettiventtiiliHuomio ?? '',
        magneettiventtiiliValmistaja: source.magneettiventtiiliValmistaja ?? '',
        magneettiventtiiliMalli: source.magneettiventtiiliMalli ?? '',
        nestelasiKuiva: !!source.nestelasiKuiva,
      };
    } else if (
      next.paisuntaventtiiliSamaKuinPiiri1 &&
      !refrigerantCircuitHasMagnetValve(laiteTyyppi, next.paisuntaventtiiliTyyppi)
    ) {
      next.nestelasiKuiva = !!source.nestelasiKuiva;
    }
    if (next.kuivainSamaKuinPiiri1) {
      next = {
        ...next,
        kuivainOK: !!source.kuivainOK,
        kuivainTila: source.kuivainTila ?? null,
        kuivainLisatieto: source.kuivainLisatieto ?? '',
        kuivainValmistaja: source.kuivainValmistaja ?? '',
        kuivainMalli: source.kuivainMalli ?? '',
        kuivainKivienMaara: source.kuivainKivienMaara ?? '',
      };
    }
    return next;
  };

  const hasCrossCircuitSync = circuitNumber > 1 && !!firstCircuitData;

  useEffect(() => {
    if (!hasCrossCircuitSync || !firstCircuitData) return;
    const synced = applyCrossCircuitSameAsFirst(firstCircuitData, data);
    if (JSON.stringify(synced) !== JSON.stringify(data)) {
      onChange(synced);
    }
  }, [hasCrossCircuitSync, firstCircuitData, data]);

  const setCrossCircuitFlag = (
    key:
      | 'kompressoritSamaKuinPiiri1'
      | 'paisuntaventtiiliSamaKuinPiiri1'
      | 'magneettiventtiiliSamaKuinPiiri1'
      | 'kuivainSamaKuinPiiri1',
    value: boolean,
  ) => {
    const next = { ...data, [key]: value };
    onChange(firstCircuitData ? applyCrossCircuitSameAsFirst(firstCircuitData, next) : next);
  };

  const renderCompressor = (index: number) => {
    const key = compressorByIndex[index];
    const sameKey = sameAsFirstByIndex[index];
    if (!key) return null;
    return (
      <div key={key} className="huolto-circuit-compressor-item">
        {index > 1 && sameKey && (
          <FormCheckbox
            label={`Sama kuin kompressori 1 (valmistaja + malli)`}
            checked={!!data[sameKey]}
            onChange={(v) => setSameAsFirst(index, v)}
          />
        )}
        <CompressorModule
          number={index}
          data={data[key]}
          lockManufacturerModel={
            (index > 1 && !!(sameKey && data[sameKey])) ||
            (!!data.kompressoritSamaKuinPiiri1 && hasCrossCircuitSync)
          }
          onChange={(newData) => updateCompressor(index, newData)}
        />
      </div>
    );
  };

  const circuitBody = data.onKaytossa ? (
        <div className="huolto-circuit-body">
          <div className={`huolto-circuit-part-module${printLayout ? ' huolto-part-inspection-list huolto-part-inspection-list--print-inline' : ''}`}>
            <RefrigerantCircuitMeasurementsDialog
              circuitNumber={circuitNumber}
              data={data}
              onChange={onChange}
              refrigerantType={refrigerantType}
              laiteTyyppi={laiteTyyppi}
              printSettingsInPopup={printSettingsInPopup}
            />
          </div>

          <div className="huolto-circuit-part-module">
            <h3 className="huolto-circuit-part-module-title">Kompressorit</h3>
            {hasCrossCircuitSync && (
              <FormCheckbox
                label={`Piiri ${circuitNumber}: sama kompressorimäärä ja kompressorit kuin piirissä 1`}
                checked={!!data.kompressoritSamaKuinPiiri1}
                onChange={(v) => setCrossCircuitFlag('kompressoritSamaKuinPiiri1', v)}
              />
            )}
            <label className="huolto-circuit-count-field">
              Kompressoreita piirissä
              <select
                value={data.kompressorienMaara || '1'}
                disabled={!!data.kompressoritSamaKuinPiiri1}
                onChange={(e) => onChange({ ...data, kompressorienMaara: e.target.value })}
              >
                {[1, 2, 3, 4, 5, 6].map((count) => (
                  <option key={count} value={String(count)}>
                    {count}
                  </option>
                ))}
              </select>
            </label>
            <div className="huolto-part-inspection-list huolto-part-inspection-list--flat">
              {parseInt(data.kompressorienMaara, 10) >= 1 && renderCompressor(1)}
              {parseInt(data.kompressorienMaara, 10) >= 2 && renderCompressor(2)}
              {parseInt(data.kompressorienMaara, 10) >= 3 && renderCompressor(3)}
              {parseInt(data.kompressorienMaara, 10) >= 4 && renderCompressor(4)}
              {parseInt(data.kompressorienMaara, 10) >= 5 && renderCompressor(5)}
              {parseInt(data.kompressorienMaara, 10) >= 6 && renderCompressor(6)}
            </div>
          </div>

          <RefrigerantCircuitComponentsModule
            circuitNumber={circuitNumber}
            data={data}
            onChange={onChange}
            laiteTyyppi={laiteTyyppi}
            isMLP={isMLP}
            firstCircuitData={firstCircuitData}
          />

          {showChillerCondenserInCircuit && chillerCondenser && onChillerCondenserChange && (
            <ChillerCondenserInCircuit
              circuitNumber={circuitNumber}
              condenser={chillerCondenser}
              onChange={onChillerCondenserChange}
            />
          )}
        </div>
  ) : null;

  return (
    <div className={`huolto-submodule huolto-circuit${printLayout ? ' huolto-circuit--print' : ''}`}>
      {printLayout ? (
        <PrintInnerBox
          title={`KYLMÄAINEPIIRI ${circuitNumber}`}
          accent={PRINT_BOX_COLORS.circuit}
          className="huolto-circuit-print-box"
        >
          <FormCheckbox
            label={`Piiri ${circuitNumber} käytössä`}
            checked={data.onKaytossa}
            onChange={(v) => onChange({ ...data, onKaytossa: v })}
          />
          {circuitBody}
        </PrintInnerBox>
      ) : (
        <>
          <div className="huolto-circuit-header">
            <FormCheckbox
              label={`Piiri ${circuitNumber}`}
              checked={data.onKaytossa}
              onChange={(v) => onChange({ ...data, onKaytossa: v })}
            />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setExpanded((v) => !v)}>
              {expanded ? 'Piilota' : 'Näytä'}
            </button>
          </div>
          {expanded ? circuitBody : null}
        </>
      )}
    </div>
  );
}
