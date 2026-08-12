import { useEffect, useState } from 'react';
import type { CondenserData, RefrigerantCircuitData } from '../../lib/huoltoRaportti/types';
import {
  getBubblePointFromPressure,
  getCo2PtLimitBarGauge,
  getSaturationTempFromPressure,
  hasRefrigerantPtData,
  isRefrigerantPtApproximate,
} from '../../lib/huoltoRaportti/refrigerantPt';
import {
  calculateSubcoolingFromMeasurements,
  calculateSuperheatFromMeasurements,
  getRefrigerantPtChartUrl,
} from '../../lib/huoltoRaportti/utils';
import { piiriOhjaustapaOptions } from '../../lib/huoltoRaportti/constants';
import { refrigerantCircuitHasMagnetValve } from '../../lib/huoltoRaportti/deviceModuleLogic';
import {
  circuitSubcoolingPrintEnabled,
  circuitSuperheatPrintEnabled,
} from '../../lib/huoltoRaportti/refrigerantCircuitPrint';
import ToggleSwitch from '../ToggleSwitch';
import { ChillerCondenserInCircuit } from './ChillerCondenserInCircuit';
import { CompressorModule } from './CompressorModule';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';
import { HuoltoPartInspectionRow } from './HuoltoPartInspectionRow';
import { useHuoltoPrintFormLayout } from '../../hooks/useHuoltoPrintFormLayout';
import { PRINT_BOX_COLORS } from '../../lib/huoltoRaportti/printBoxColors';
import {
  PrintFieldGrid,
  PrintGridField,
  PrintInnerBox,
  PrintSubBox,
  PrintTextInput,
} from './print/MaintenancePrintLayout';
import { RefrigerantCircuitPartFields } from './RefrigerantCircuitPartFields';
import {
  circuitPartDisplayStatus,
  type RefrigerantCircuitPartKey,
} from '../../lib/huoltoRaportti/circuitPartInspection';
import {
  circuitPartSubtitle,
  RefrigerantCircuitPartDialog,
} from './RefrigerantCircuitPartDialog';

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
function deviceTypeForLimits(laiteTyyppi: string): string {
  const map: Record<string, string> = {
    vedenjäähdytyskone: 'Vedenjäähdytyskone',
    mlp: 'MLP',
    lämpöpumppu: 'lämpöpumppu',
    pakastin: 'pakastin',
    kylmäkoneikko: 'kylmäkoneikko',
    konvektorit: 'muu',
    muu: 'muu',
  };
  return map[laiteTyyppi] ?? (laiteTyyppi || 'muu');
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
  const [openPartDialog, setOpenPartDialog] = useState<RefrigerantCircuitPartKey | null>(null);
  const calcRefrigerant =
    refrigerantType && refrigerantType !== 'muu' && refrigerantType !== 'Muu' ? refrigerantType : '';
  const ptSupported = calcRefrigerant ? hasRefrigerantPtData(calcRefrigerant) : false;
  const ptApproximate = calcRefrigerant ? isRefrigerantPtApproximate(calcRefrigerant) : false;

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
  const showMagnetValve = refrigerantCircuitHasMagnetValve(laiteTyyppi, data.paisuntaventtiiliTyyppi);

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

  const calculateSuperheat = () => {
    if (!calcRefrigerant || !ptSupported) return '';
    if (data.imupaine && data.imuLampotila) {
      const suctionPressure = parseFloat(data.imupaine);
      const suctionTemp = parseFloat(data.imuLampotila);
      if (!isNaN(suctionPressure) && !isNaN(suctionTemp) && suctionPressure > 0) {
        const superheat = calculateSuperheatFromMeasurements(suctionPressure, suctionTemp, calcRefrigerant);
        if (superheat != null && superheat > -50 && superheat < 150) return superheat.toFixed(1);
      }
    }
    return '';
  };

  const calculateSubcooling = () => {
    if (!calcRefrigerant || !ptSupported) return '';
    if (data.korkeapaine && data.nestePutkiLampotila) {
      const highPressure = parseFloat(data.korkeapaine);
      const liquidTemp = parseFloat(data.nestePutkiLampotila);
      if (!isNaN(highPressure) && !isNaN(liquidTemp) && highPressure > 0) {
        const subcooling = calculateSubcoolingFromMeasurements(highPressure, liquidTemp, calcRefrigerant);
        if (subcooling != null && subcooling > -50 && subcooling < 150) return subcooling.toFixed(1);
      }
    }
    return '';
  };

  const suctionBar = parseFloat(data.imupaine || '');
  const highBar = parseFloat(data.korkeapaine || '');
  const dewSatC =
    calcRefrigerant && ptSupported && suctionBar > 0
      ? getSaturationTempFromPressure(suctionBar, calcRefrigerant)
      : NaN;
  const bubbleSatC =
    calcRefrigerant && ptSupported && highBar > 0
      ? getBubblePointFromPressure(highBar, calcRefrigerant)
      : NaN;
  const co2OverLimit =
    calcRefrigerant === 'R-744' &&
    ((suctionBar > getCo2PtLimitBarGauge() && suctionBar > 0) ||
      (highBar > getCo2PtLimitBarGauge() && highBar > 0));
  const ptChartUrl = calcRefrigerant ? getRefrigerantPtChartUrl(calcRefrigerant) : null;

  const showSuperheatCalc = circuitSuperheatPrintEnabled(data);
  const showSubcoolingCalc = circuitSubcoolingPrintEnabled(data);

  const calculatedSuperheat = showSuperheatCalc ? calculateSuperheat() : '';
  const calculatedSubcooling = showSubcoolingCalc ? calculateSubcooling() : '';
  const superheatValue = parseFloat(calculatedSuperheat || '0');
  const subcoolingValue = parseFloat(calculatedSubcooling || '0');

  const getSuperheatLimits = (deviceType: string, refrigerant: string) => {
    const lowLimits: Record<string, number> = {
      Vedenjäähdytyskone: 4,
      pakastin: 4,
      ilmastointilaite: 5,
      lämpöpumppu: 5,
      kylmäkoneikko: 4,
      MLP: 5,
      muu: 4,
    };
    const highLimits: Record<string, number> = {
      'R-410A': 12,
      'R-407C': 15,
      'R-134a': 10,
      'R-404A': 10,
      'R-744': 8,
      default: 12,
    };
    const deviceLow = lowLimits[deviceType] || 4;
    const refrigerantHigh = highLimits[refrigerant] || highLimits.default;
    const adjustedHigh =
      deviceType === 'MLP' || deviceType === 'lämpöpumppu' ? refrigerantHigh + 2 : refrigerantHigh;
    return { low: deviceLow, high: adjustedHigh };
  };

  const getSubcoolingLimits = (deviceType: string, refrigerant: string) => {
    const lowLimits: Record<string, number> = {
      Vedenjäähdytyskone: 2,
      pakastin: 2,
      ilmastointilaite: 3,
      lämpöpumppu: 3,
      kylmäkoneikko: 2,
      MLP: 3,
      muu: 2,
    };
    const highLimits: Record<string, number> = {
      'R-410A': 12,
      'R-407C': 10,
      'R-134a': 8,
      'R-404A': 8,
      'R-744': 6,
      default: 10,
    };
    const deviceLow = lowLimits[deviceType] || 2;
    const refrigerantHigh = highLimits[refrigerant] || highLimits.default;
    return { low: deviceLow, high: refrigerantHigh };
  };

  const deviceType = deviceTypeForLimits(laiteTyyppi);
  const superheatLimits = getSuperheatLimits(deviceType, calcRefrigerant);
  const subcoolingLimits = getSubcoolingLimits(deviceType, calcRefrigerant);

  const showLowSuperheatWarning =
    showSuperheatCalc && calculatedSuperheat && superheatValue < superheatLimits.low;
  const showHighSuperheatWarning =
    showSuperheatCalc && calculatedSuperheat && superheatValue > superheatLimits.high;
  const showLowSubcoolingWarning =
    showSubcoolingCalc && calculatedSubcooling && subcoolingValue < subcoolingLimits.low;
  const showHighSubcoolingWarning =
    showSubcoolingCalc && calculatedSubcooling && subcoolingValue > subcoolingLimits.high;
  const isSuperheatNormal =
    showSuperheatCalc && calculatedSuperheat && !showLowSuperheatWarning && !showHighSuperheatWarning;
  const isSubcoolingNormal =
    showSubcoolingCalc && calculatedSubcooling && !showLowSubcoolingWarning && !showHighSubcoolingWarning;
  const showNormalOperationMessage =
    (showSuperheatCalc || showSubcoolingCalc) &&
    (!showSuperheatCalc || isSuperheatNormal) &&
    (!showSubcoolingCalc || isSubcoolingNormal) &&
    (isSuperheatNormal || isSubcoolingNormal);

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
          <div className="huolto-circuit-part-module">
            <h3 className="huolto-circuit-part-module-title">Mittaukset</h3>
          {printLayout ? (
            <PrintFieldGrid columns={3}>
              <PrintGridField label="Imupaine (bar)">
                <PrintTextInput
                  type="number"
                  value={data.imupaine}
                  onChange={(v) => onChange({ ...data, imupaine: v })}
                  placeholder="0.0"
                  className={showLowSuperheatWarning ? 'input-warning' : ''}
                />
              </PrintGridField>
              <PrintGridField label="Imulämpötila (°C)">
                <PrintTextInput
                  type="number"
                  value={data.imuLampotila}
                  onChange={(v) => onChange({ ...data, imuLampotila: v })}
                  placeholder="0.0"
                />
              </PrintGridField>
              <PrintGridField label="Korkeapaine (bar)">
                <PrintTextInput
                  type="number"
                  value={data.korkeapaine}
                  onChange={(v) => onChange({ ...data, korkeapaine: v })}
                  placeholder="0.0"
                />
              </PrintGridField>
              <PrintGridField label="Nesteputki (°C)">
                <PrintTextInput
                  type="number"
                  value={data.nestePutkiLampotila}
                  onChange={(v) => onChange({ ...data, nestePutkiLampotila: v })}
                  placeholder="0.0"
                  className={showLowSubcoolingWarning ? 'input-warning' : ''}
                />
              </PrintGridField>
              <PrintGridField label="Kuumakaasu (°C)">
                <PrintTextInput
                  type="number"
                  value={data.kuumakaasuLampotila}
                  onChange={(v) => onChange({ ...data, kuumakaasuLampotila: v })}
                  placeholder="0.0"
                />
              </PrintGridField>
            </PrintFieldGrid>
          ) : (
          <div className="line-form-grid">
            <FormInput
              label="Imupaine (bar)"
              value={data.imupaine}
              onChange={(v) => onChange({ ...data, imupaine: v })}
              placeholder="0.0"
              type="number"
              className={showLowSuperheatWarning ? 'input-warning' : ''}
            />
            <FormInput
              label="Imu lämpötila (°C)"
              value={data.imuLampotila}
              onChange={(v) => onChange({ ...data, imuLampotila: v })}
              placeholder="0.0"
              type="number"
            />
            <FormInput
              label="Korkeapaine (bar)"
              value={data.korkeapaine}
              onChange={(v) => onChange({ ...data, korkeapaine: v })}
              placeholder="0.0"
              type="number"
            />
            <FormInput
              label="Nesteputki (°C)"
              value={data.nestePutkiLampotila}
              onChange={(v) => onChange({ ...data, nestePutkiLampotila: v })}
              placeholder="0.0"
              type="number"
              className={showLowSubcoolingWarning ? 'input-warning' : ''}
            />
            <FormInput
              label="Kuumakaasu (°C)"
              value={data.kuumakaasuLampotila}
              onChange={(v) => onChange({ ...data, kuumakaasuLampotila: v })}
              placeholder="0.0"
              type="number"
            />
          </div>
          )}

          <div className="huolto-calc-row">
            <div className="huolto-calc-metric">
              <div className="huolto-calc-metric-head">
                <span className="muted">Tulistus (K)</span>
                {!printSettingsInPopup ? (
                  <ToggleSwitch
                    checked={showSuperheatCalc}
                    onChange={(v) => onChange({ ...data, tulistusTulosteeseen: v })}
                    label="Tulosteeseen"
                    className="toggle-switch-inline huolto-calc-print-toggle"
                  />
                ) : null}
              </div>
              {showSuperheatCalc ? (
                <strong
                  className={
                    showLowSuperheatWarning
                      ? 'calc-bad'
                      : showHighSuperheatWarning
                        ? 'calc-warn'
                        : 'calc-ok'
                  }
                >
                  {calculatedSuperheat || '—'}
                </strong>
              ) : (
                <span className="muted huolto-calc-off-hint">
                  {printSettingsInPopup ? 'Ei tulosteeseen (⚙ asetukset)' : 'Laskelmaa ei tulosteta'}
                </span>
              )}
            </div>
            <div className="huolto-calc-metric">
              <div className="huolto-calc-metric-head">
                <span className="muted">Alijäähdytys (K)</span>
                {!printSettingsInPopup ? (
                  <ToggleSwitch
                    checked={showSubcoolingCalc}
                    onChange={(v) => onChange({ ...data, alijahdytysTulosteeseen: v })}
                    label="Tulosteeseen"
                    className="toggle-switch-inline huolto-calc-print-toggle"
                  />
                ) : null}
              </div>
              {showSubcoolingCalc ? (
                <strong
                  className={
                    showLowSubcoolingWarning
                      ? 'calc-bad'
                      : showHighSubcoolingWarning
                        ? 'calc-warn'
                        : 'calc-ok'
                  }
                >
                  {calculatedSubcooling || '—'}
                </strong>
              ) : (
                <span className="muted huolto-calc-off-hint">
                  {printSettingsInPopup ? 'Ei tulosteeseen (⚙ asetukset)' : 'Laskelmaa ei tulosteta'}
                </span>
              )}
            </div>
          </div>

          {(showSuperheatCalc || showSubcoolingCalc) && (
            <p className="muted huolto-help">
              {showSuperheatCalc && (
                <>
                  Tulistus = imu (°C) − kastepiste(P<sub>imu</sub>, höyry).
                  {calcRefrigerant.includes('407') && <> Zeotropisella R-407C: dew-piste.</>}
                  {ptSupported && Number.isFinite(dewSatC) && (
                    <>
                      {' '}
                      Kaste imupaineella: <strong>{dewSatC.toFixed(1)} °C</strong>.
                    </>
                  )}
                </>
              )}
              {showSuperheatCalc && showSubcoolingCalc && ' '}
              {showSubcoolingCalc && (
                <>
                  Alijäähdytys = kuplapiste(P<sub>korkea</sub>, neste) − nesteputki (°C).
                  {calcRefrigerant.includes('407') && <> R-407C: bubble-piste.</>}
                  {ptSupported && Number.isFinite(bubbleSatC) && (
                    <>
                      {' '}
                      Kupla korkeapaineella: <strong>{bubbleSatC.toFixed(1)} °C</strong>.
                    </>
                  )}
                </>
              )}
              {' '}
              Paineet manometribar.
              {ptChartUrl && (
                <>
                  {' '}
                  <a href={ptChartUrl} target="_blank" rel="noreferrer">
                    iGas P-T-kaavio (PDF)
                  </a>
                </>
              )}
            </p>
          )}

          {!calcRefrigerant && (showSuperheatCalc || showSubcoolingCalc) && (
            <div className="huolto-alert huolto-alert-warning">
              Valitse kylmäaine laitteen tiedoissa ennen tulistuksen ja alijäähdytyksen laskentaa.
            </div>
          )}
          {calcRefrigerant && !ptSupported && (showSuperheatCalc || showSubcoolingCalc) && (
            <div className="huolto-alert huolto-alert-warning">
              PT-taulukkoa ei ole aineelle {calcRefrigerant} — syötä tulistus ja alijäähdytys käsin tai
              valitse listasta tunnettu vasta-aine.
            </div>
          )}
          {ptApproximate && ptSupported && (showSuperheatCalc || showSubcoolingCalc) && (
            <div className="huolto-alert huolto-alert-warning">
              {calcRefrigerant}: laskenta perustuu lähimmän tunnetun aineen PT-käyrään (likimääräinen).
            </div>
          )}
          {co2OverLimit && (showSuperheatCalc || showSubcoolingCalc) && (
            <div className="huolto-alert huolto-alert-warning">
              R-744 (CO₂): paine yli {getCo2PtLimitBarGauge()} bar (man) — transkriittinen alue, automaattinen
              laskenta ei päde.
            </div>
          )}

          {showLowSuperheatWarning && (
            <div className="huolto-alert huolto-alert-danger">
              Matala tulistus ({superheatValue.toFixed(1)} K &lt; {superheatLimits.low} K) → tarkista
              kylmäaine tai paisuntaventtiili.
            </div>
          )}
          {showHighSuperheatWarning && (
            <div className="huolto-alert huolto-alert-warning">
              Korkea tulistus ({superheatValue.toFixed(1)} K &gt; {superheatLimits.high} K) → höyrystin
              tukossa tai kylmäainetta liian vähän.
            </div>
          )}
          {showLowSubcoolingWarning && (
            <div className="huolto-alert huolto-alert-danger">
              Matala alijäähdytys ({subcoolingValue.toFixed(1)} K &lt; {subcoolingLimits.low} K) →
              tarkista lauhduttimen virtaus.
            </div>
          )}
          {showHighSubcoolingWarning && (
            <div className="huolto-alert huolto-alert-warning">
              Korkea alijäähdytys ({subcoolingValue.toFixed(1)} K &gt; {subcoolingLimits.high} K) →
              nesteen alijohtumisriski.
            </div>
          )}
          {showNormalOperationMessage && (
            <div className="huolto-alert huolto-alert-success">
              Kylmäainepiiri toimii oikein
              {showSuperheatCalc && isSuperheatNormal ? ` — tulistus ${superheatValue.toFixed(1)} K` : ''}
              {showSubcoolingCalc && isSubcoolingNormal
                ? ` — alijäähdytys ${subcoolingValue.toFixed(1)} K`
                : ''}
              .
            </div>
          )}
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

          {isMLP && (
            <div className="line-form-grid">
              <label>
                Piirin ohjaustapa
                <select
                  value={data.ohjaustapa}
                  onChange={(e) => onChange({ ...data, ohjaustapa: e.target.value })}
                >
                  {piiriOhjaustapaOptions.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>
              {data.ohjaustapa === 'muu' && (
                <FormInput
                  label="Muu ohjaustapa"
                  value={data.ohjaustapaMuu ?? ''}
                  onChange={(v) => onChange({ ...data, ohjaustapaMuu: v })}
                />
              )}
            </div>
          )}

          <div className="huolto-circuit-part-module">
            <h3 className="huolto-circuit-part-module-title">Piirin osat</h3>
            {hasCrossCircuitSync && (
              <div className="huolto-part-inspection-sync">
                <FormCheckbox
                  label={`Piiri ${circuitNumber}: sama paisuntaventtiili kuin piirissä 1`}
                  checked={!!data.paisuntaventtiiliSamaKuinPiiri1}
                  onChange={(v) => setCrossCircuitFlag('paisuntaventtiiliSamaKuinPiiri1', v)}
                />
                {showMagnetValve ? (
                  <FormCheckbox
                    label={`Piiri ${circuitNumber}: sama magneettiventtiili kuin piirissä 1`}
                    checked={!!data.magneettiventtiiliSamaKuinPiiri1}
                    onChange={(v) => setCrossCircuitFlag('magneettiventtiiliSamaKuinPiiri1', v)}
                  />
                ) : null}
                <FormCheckbox
                  label={`Piiri ${circuitNumber}: sama kuivain kuin piirissä 1`}
                  checked={!!data.kuivainSamaKuinPiiri1}
                  onChange={(v) => setCrossCircuitFlag('kuivainSamaKuinPiiri1', v)}
                />
              </div>
            )}
            <div className="huolto-part-inspection-list huolto-part-inspection-list--print-inline">
              {printLayout ? (
                <>
                  <PrintSubBox title="PAISUNTAVENTTIILI" accent={PRINT_BOX_COLORS.circuit}>
                    <RefrigerantCircuitPartFields
                      part="paisuntaventtiili"
                      data={data}
                      laiteTyyppi={laiteTyyppi}
                      disabled={!!data.paisuntaventtiiliSamaKuinPiiri1}
                      onChange={onChange}
                    />
                  </PrintSubBox>
                  {showMagnetValve ? (
                    <PrintSubBox title="MAGNEETTIVENTTIILI" accent={PRINT_BOX_COLORS.circuit}>
                      <RefrigerantCircuitPartFields
                        part="magneettiventtiili"
                        data={data}
                        laiteTyyppi={laiteTyyppi}
                        disabled={!!data.magneettiventtiiliSamaKuinPiiri1}
                        onChange={onChange}
                      />
                    </PrintSubBox>
                  ) : null}
                  <PrintSubBox title="KUIVAIN" accent={PRINT_BOX_COLORS.circuit}>
                    <RefrigerantCircuitPartFields
                      part="kuivain"
                      data={data}
                      laiteTyyppi={laiteTyyppi}
                      disabled={!!data.kuivainSamaKuinPiiri1}
                      onChange={onChange}
                    />
                  </PrintSubBox>
                </>
              ) : (
                <>
              <HuoltoPartInspectionRow
                title="Paisuntaventtiili"
                subtitle={circuitPartSubtitle('paisuntaventtiili', data, laiteTyyppi) || undefined}
                status={circuitPartDisplayStatus(data, 'paisuntaventtiili')}
                disabled={!!data.paisuntaventtiiliSamaKuinPiiri1}
                onInspect={() => setOpenPartDialog('paisuntaventtiili')}
              />
              {showMagnetValve ? (
                <HuoltoPartInspectionRow
                  title="Magneettiventtiili"
                  subtitle={circuitPartSubtitle('magneettiventtiili', data, laiteTyyppi) || undefined}
                  status={circuitPartDisplayStatus(data, 'magneettiventtiili')}
                  disabled={!!data.magneettiventtiiliSamaKuinPiiri1}
                  onInspect={() => setOpenPartDialog('magneettiventtiili')}
                />
              ) : null}
              <HuoltoPartInspectionRow
                title="Kuivain"
                subtitle={circuitPartSubtitle('kuivain', data, laiteTyyppi) || undefined}
                status={circuitPartDisplayStatus(data, 'kuivain')}
                disabled={!!data.kuivainSamaKuinPiiri1}
                onInspect={() => setOpenPartDialog('kuivain')}
              />
                </>
              )}
            </div>
          </div>

          {!printLayout ? (
          <RefrigerantCircuitPartDialog
            open={openPartDialog !== null}
            part={openPartDialog ?? 'paisuntaventtiili'}
            circuitNumber={circuitNumber}
            data={data}
            laiteTyyppi={laiteTyyppi}
            onClose={() => setOpenPartDialog(null)}
            onSave={onChange}
          />
          ) : null}

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
