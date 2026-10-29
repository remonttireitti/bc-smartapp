import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { createEmptyEvaporatorData } from '../../lib/huoltoRaportti/defaults';
import { kylmioEvaporatorCircuitCounts } from '../../lib/huoltoRaportti/evaporatorHelpers';
import { CountStepper } from './CountStepper';

type Props = {
  form: HuoltoReportData;
  /** Kylmäainepiiri (0-pohjainen), jonka höyrystinmäärä asetetaan. */
  circuit: number;
  onPatchForm: (patch: Partial<HuoltoReportData>) => void;
};

const MAX_TOTAL = 10;

function hasData(row: unknown, empty: unknown): boolean {
  return JSON.stringify(row ?? {}) !== JSON.stringify(empty);
}

/** Muutos, kun piirin höyrystinmäärä vaihtuu: päivittää piireittäiset määrät, kokonaismäärän ja höyrystinrivit. */
export function evaporatorCircuitCountPatch(form: HuoltoReportData, circuit: number, n: number): Partial<HuoltoReportData> {
  const counts = kylmioEvaporatorCircuitCounts(form);
  const empty = () => createEmptyEvaporatorData(form.laiteTyyppi);
  const next = counts.map((c, i) => (i === circuit ? n : c));
  const evaporatorData: HuoltoReportData['evaporatorData'] = [];
  let start = 0;
  counts.forEach((c, i) => {
    const slice = Array.from({ length: c }, (_, k) => form.evaporatorData[start + k] ?? empty());
    evaporatorData.push(...(i === circuit ? Array.from({ length: n }, (_, k) => slice[k] ?? empty()) : slice));
    start += c;
  });
  return {
    hoyrystimetPiireittain: next.join(','),
    hoyrystimienMaara: String(next.reduce((a, b) => a + b, 0)),
    evaporatorData,
  };
}

/** Kylmäainepiirin höyrystimien määrä (piirikohtainen). */
export function EvaporatorCircuitCount({ form, circuit, onPatchForm }: Props) {
  const counts = kylmioEvaporatorCircuitCounts(form);
  const value = counts[circuit] ?? 0;
  const total = counts.reduce((a, b) => a + b, 0);

  const set = (n: number) => {
    if (n < value) {
      let start = 0;
      for (let i = 0; i < circuit; i += 1) start += counts[i];
      const emptyEv = createEmptyEvaporatorData(form.laiteTyyppi);
      const lost = form.evaporatorData.slice(start + n, start + value).some((ev) => hasData(ev, emptyEv));
      if (lost && !window.confirm('Poistetaanko höyrystin kirjattuine tietoineen?')) return;
    }
    onPatchForm(evaporatorCircuitCountPatch(form, circuit, n));
  };

  return (
    <div className="huolto-unit-counts">
      <CountStepper
        label="Höyrystimiä"
        value={value}
        min={circuit === 0 ? 1 : 0}
        max={value + (MAX_TOTAL - total)}
        onChange={set}
      />
    </div>
  );
}
