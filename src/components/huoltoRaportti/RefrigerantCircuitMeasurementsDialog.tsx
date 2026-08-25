import type { RefrigerantCircuitData } from '../../lib/huoltoRaportti/types';
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
import {
  circuitSubcoolingPrintEnabled,
  circuitSuperheatPrintEnabled,
} from '../../lib/huoltoRaportti/refrigerantCircuitPrint';
export { circuitMeasurementsStatus, circuitMeasurementsSubtitle } from '../../lib/huoltoRaportti/refrigerantCircuitHelpers';
import {
  circuitMeasurementsStatus,
  circuitMeasurementsSubtitle,
} from '../../lib/huoltoRaportti/refrigerantCircuitHelpers';
import ToggleSwitch from '../ToggleSwitch';
import { FormInput } from './FormInput';
import { HuoltoPartInspectionRow } from './HuoltoPartInspectionRow';
import { HuoltoInspectionDialogShell, useHuoltoInspectionDialog } from './HuoltoInspectionDialogShell';
import { useHuoltoPrintFormLayout } from '../../hooks/useHuoltoPrintFormLayout';

interface Props {
  circuitNumber: number;
  data: RefrigerantCircuitData;
  onChange: (data: RefrigerantCircuitData) => void;
  refrigerantType?: string;
  laiteTyyppi?: string;
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

export function CircuitMeasurementsFields({
  data,
  onChange,
  refrigerantType = '',
  laiteTyyppi = 'muu',
  printSettingsInPopup = true,
}: Omit<Props, 'circuitNumber'>) {
  const calcRefrigerant =
    refrigerantType && refrigerantType !== 'muu' && refrigerantType !== 'Muu' ? refrigerantType : '';
  const ptSupported = calcRefrigerant ? hasRefrigerantPtData(calcRefrigerant) : false;
  const ptApproximate = calcRefrigerant ? isRefrigerantPtApproximate(calcRefrigerant) : false;

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

  const patch = (patchData: Partial<RefrigerantCircuitData>) => onChange({ ...data, ...patchData });

  return (
    <>
      <div className="line-form-grid">
        <FormInput
          label="Imupaine (bar)"
          value={data.imupaine}
          onChange={(v) => patch({ imupaine: v })}
          placeholder="0.0"
          type="number"
          className={showLowSuperheatWarning ? 'input-warning' : ''}
        />
        <FormInput
          label="Imu lämpötila (°C)"
          value={data.imuLampotila}
          onChange={(v) => patch({ imuLampotila: v })}
          placeholder="0.0"
          type="number"
        />
        <FormInput
          label="Korkeapaine (bar)"
          value={data.korkeapaine}
          onChange={(v) => patch({ korkeapaine: v })}
          placeholder="0.0"
          type="number"
        />
        <FormInput
          label="Nesteputki (°C)"
          value={data.nestePutkiLampotila}
          onChange={(v) => patch({ nestePutkiLampotila: v })}
          placeholder="0.0"
          type="number"
          className={showLowSubcoolingWarning ? 'input-warning' : ''}
        />
        <FormInput
          label="Kuumakaasu (°C)"
          value={data.kuumakaasuLampotila}
          onChange={(v) => patch({ kuumakaasuLampotila: v })}
          placeholder="0.0"
          type="number"
        />
      </div>

      <div className="huolto-calc-row">
        <div className="huolto-calc-metric">
          <div className="huolto-calc-metric-head">
            <span className="muted">Tulistus (K)</span>
            {!printSettingsInPopup ? (
              <ToggleSwitch
                checked={showSuperheatCalc}
                onChange={(v) => patch({ tulistusTulosteeseen: v })}
                label="Tulosteeseen"
                className="toggle-switch-inline huolto-calc-print-toggle"
              />
            ) : null}
          </div>
          {showSuperheatCalc ? (
            <strong
              className={
                showLowSuperheatWarning ? 'calc-bad' : showHighSuperheatWarning ? 'calc-warn' : 'calc-ok'
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
                onChange={(v) => patch({ alijahdytysTulosteeseen: v })}
                label="Tulosteeseen"
                className="toggle-switch-inline huolto-calc-print-toggle"
              />
            ) : null}
          </div>
          {showSubcoolingCalc ? (
            <strong
              className={
                showLowSubcoolingWarning ? 'calc-bad' : showHighSubcoolingWarning ? 'calc-warn' : 'calc-ok'
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
          PT-taulukkoa ei ole aineelle {calcRefrigerant} — syötä tulistus ja alijäähdytys käsin tai valitse
          listasta tunnettu vasta-aine.
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
          Matala tulistus ({superheatValue.toFixed(1)} K &lt; {superheatLimits.low} K) → tarkista kylmäaine
          tai paisuntaventtiili.
        </div>
      )}
      {showHighSuperheatWarning && (
        <div className="huolto-alert huolto-alert-warning">
          Korkea tulistus ({superheatValue.toFixed(1)} K &gt; {superheatLimits.high} K) → höyrystin tukossa
          tai kylmäainetta liian vähän.
        </div>
      )}
      {showLowSubcoolingWarning && (
        <div className="huolto-alert huolto-alert-danger">
          Matala alijäähdytys ({subcoolingValue.toFixed(1)} K &lt; {subcoolingLimits.low} K) → tarkista
          lauhduttimen virtaus.
        </div>
      )}
      {showHighSubcoolingWarning && (
        <div className="huolto-alert huolto-alert-warning">
          Korkea alijäähdytys ({subcoolingValue.toFixed(1)} K &gt; {subcoolingLimits.high} K) → nesteen
          alijohtumisriski.
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
    </>
  );
}

export function RefrigerantCircuitMeasurementsDialog({
  circuitNumber,
  data,
  onChange,
  refrigerantType,
  laiteTyyppi,
  printSettingsInPopup = true,
}: Props) {
  const printLayout = useHuoltoPrintFormLayout();
  const title = `Mittaukset — piiri ${circuitNumber}`;
  const status = circuitMeasurementsStatus(data);
  const subtitle = circuitMeasurementsSubtitle(data);

  const { open, openDialog, closeDialog, draft, setDraft } = useHuoltoInspectionDialog({
    data,
    onChange,
  });

  if (!printLayout) {
    return (
      <div className="huolto-circuit-part-module">
        <h3 className="huolto-circuit-part-module-title">Mittaukset</h3>
        <CircuitMeasurementsFields
          data={data}
          onChange={onChange}
          refrigerantType={refrigerantType}
          laiteTyyppi={laiteTyyppi}
          printSettingsInPopup={printSettingsInPopup}
        />
      </div>
    );
  }

  return (
    <>
      <HuoltoPartInspectionRow
        title={title}
        subtitle={subtitle || undefined}
        status={status}
        onInspect={openDialog}
      />

      <HuoltoInspectionDialogShell
        open={open}
        title={title}
        titleId={`circuit-measurements-dialog-${circuitNumber}`}
        onClose={closeDialog}
      >
        <CircuitMeasurementsFields
          data={draft}
          onChange={setDraft}
          refrigerantType={refrigerantType}
          laiteTyyppi={laiteTyyppi}
          printSettingsInPopup={printSettingsInPopup}
        />
      </HuoltoInspectionDialogShell>
    </>
  );
}
