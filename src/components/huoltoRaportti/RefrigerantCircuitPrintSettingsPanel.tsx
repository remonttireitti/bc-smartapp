import ToggleSwitch from '../ToggleSwitch';
import { kylmaainePiiriCircuitLabel } from '../../lib/huoltoRaportti/sectionTitles';
import type { HuoltoReportData, RefrigerantCircuitData } from '../../lib/huoltoRaportti/types';

type Props = {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
};

export function RefrigerantCircuitPrintSettingsPanel({ form, onChange }: Props) {
  const circuitCount = Math.min(3, Math.max(1, parseInt(form.kylmaainePiireja, 10) || 1));

  function updateCircuit(
    circuitNumber: 1 | 2 | 3,
    patch: Partial<RefrigerantCircuitData>,
  ) {
    const key = `kylmaainePiiri${circuitNumber}` as const;
    const current =
      circuitNumber === 1
        ? form.kylmaainePiiri1
        : circuitNumber === 2
          ? form.kylmaainePiiri2
          : form.kylmaainePiiri3;
    if (!current) return;
    onChange({ [key]: { ...current, ...patch } } as Partial<HuoltoReportData>);
  }

  return (
    <div className="maintenance-section-settings-panel">
      {Array.from({ length: circuitCount }, (_, index) => {
        const circuitNumber = (index + 1) as 1 | 2 | 3;
        const circuit =
          circuitNumber === 1
            ? form.kylmaainePiiri1
            : circuitNumber === 2
              ? form.kylmaainePiiri2
              : form.kylmaainePiiri3;
        if (!circuit?.onKaytossa) return null;

        return (
          <div key={circuitNumber} className="maintenance-section-settings-group panel-inset">
            <h3>{kylmaainePiiriCircuitLabel(form.laiteTyyppi, circuitNumber)}</h3>
            <div className="toggle-grid">
              <ToggleSwitch
                label="Tulistuslaskelma tulosteeseen"
                checked={circuit.tulistusTulosteeseen === true}
                onChange={(checked) =>
                  updateCircuit(circuitNumber, { tulistusTulosteeseen: checked })
                }
              />
              <ToggleSwitch
                label="Alijäähdytyslaskelma tulosteeseen"
                checked={circuit.alijahdytysTulosteeseen === true}
                onChange={(checked) =>
                  updateCircuit(circuitNumber, { alijahdytysTulosteeseen: checked })
                }
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
