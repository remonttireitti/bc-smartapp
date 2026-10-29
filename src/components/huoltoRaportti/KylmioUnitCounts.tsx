import type { CondenserData, HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { createEmptyCondenserData, createEmptyEvaporatorData } from '../../lib/huoltoRaportti/defaults';
import { getCondenserCount, getEvaporatorCircuitCount } from '../../lib/huoltoRaportti/evaporatorHelpers';

type Props = {
  form: HuoltoReportData;
  onPatchForm: (patch: Partial<HuoltoReportData>) => void;
};

const MAX = 10;

function hasData(row: unknown, empty: unknown): boolean {
  return JSON.stringify(row ?? {}) !== JSON.stringify(empty);
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="huolto-count-stepper">
      <span className="huolto-count-label">{label}</span>
      <div className="konvektori-yesno" role="group" aria-label={label}>
        <button type="button" className="konvektori-yesno-btn" aria-label={`${label} −`} disabled={value <= 1} onClick={() => onChange(value - 1)}>−</button>
        <output className="huolto-count-value" aria-live="polite">{value}</output>
        <button type="button" className="konvektori-yesno-btn" aria-label={`${label} +`} disabled={value >= MAX} onClick={() => onChange(value + 1)}>+</button>
      </div>
    </div>
  );
}

/** Kylmiö: höyrystimien ja (erillisellä ilmalauhduttimella) lauhduttimien määrä. */
export function KylmioUnitCounts({ form, onPatchForm }: Props) {
  const evapCount = getEvaporatorCircuitCount(form);
  const condCount = getCondenserCount(form);
  const separateCondenser = form.lauhdutinTyyppiLaite === 'erillinen_ilma';

  const setEvap = (n: number) => {
    if (n < evapCount) {
      const emptyEv = createEmptyEvaporatorData(form.laiteTyyppi);
      const lost = form.evaporatorData.slice(n, evapCount).some((ev) => hasData(ev, emptyEv));
      if (lost && !window.confirm(`Poistetaanko höyrystin ${evapCount} kirjattuine tietoineen?`)) return;
    }
    const evaporatorData = form.evaporatorData.slice(0, n);
    while (evaporatorData.length < n) evaporatorData.push(createEmptyEvaporatorData(form.laiteTyyppi));
    onPatchForm({ hoyrystimienMaara: String(n), evaporatorData });
  };
  const setCond = (n: number) => {
    if (n < condCount) {
      const emptyCo = createEmptyCondenserData();
      const lost = form.condenserData.slice(n, condCount).some((co) => hasData(co, emptyCo));
      if (lost && !window.confirm(`Poistetaanko lauhdutin ${condCount} kirjattuine tietoineen?`)) return;
    }
    const condenserData = form.condenserData.slice(0, n);
    while (condenserData.length < n) condenserData.push({ ...createEmptyCondenserData(), tyyppi: (form.lauhdutinTyyppiLaite || undefined) as CondenserData['tyyppi'] });
    onPatchForm({ lauhduttimienMaara: String(n), condenserData });
  };

  return (
    <div className="huolto-unit-counts">
      <Stepper label="Höyrystimiä" value={evapCount} onChange={setEvap} />
      {separateCondenser ? <Stepper label="Lauhduttimia" value={condCount} onChange={setCond} /> : null}
    </div>
  );
}
