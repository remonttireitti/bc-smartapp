import type { CondenserData, HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { chillerLauhdutinTypeOptions, lauhdutinTypeOptions } from '../../lib/huoltoRaportti/constants';
import { createEmptyCondenserData } from '../../lib/huoltoRaportti/defaults';
import { hasExternalNestelauhdutin } from '../../lib/huoltoRaportti/deviceModuleLogic';
import { getCondenserCount } from '../../lib/huoltoRaportti/evaporatorHelpers';
import { isKylmioDevice } from '../../lib/huoltoRaportti/deviceKokoonpano';
import ToggleSwitch from '../ToggleSwitch';
import { CountStepper } from './CountStepper';

type Props = {
  form: HuoltoReportData;
  onPatchForm: (patch: Partial<HuoltoReportData>) => void;
  onCondenserTypeChange: (tyyppi: HuoltoReportData['lauhdutinTyyppiLaite']) => void;
};

function hasData(row: unknown, empty: unknown): boolean {
  return JSON.stringify(row ?? {}) !== JSON.stringify(empty);
}

/**
 * Lauhdutin-moduulin asetukset: lauhdutustapa ja (kylmiö + erillinen ilmalauhdutin) lauhduttimien määrä.
 * Arvot tallentuvat laitekorttiin ja esitäyttyvät uudelle raportille.
 */
export function CondenserConfigModule({ form, onPatchForm, onCondenserTypeChange }: Props) {
  const kylmio = isKylmioDevice(form.laiteTyyppi);
  const options = kylmio ? lauhdutinTypeOptions : chillerLauhdutinTypeOptions;
  const condCount = getCondenserCount(form);
  const showCount = kylmio && form.lauhdutinTyyppiLaite === 'erillinen_ilma';

  const setCond = (n: number) => {
    if (n < condCount) {
      const emptyCo = createEmptyCondenserData();
      const lost = form.condenserData.slice(n, condCount).some((co) => hasData(co, emptyCo));
      if (lost && !window.confirm(`Poistetaanko lauhdutin ${condCount} kirjattuine tietoineen?`)) return;
    }
    const condenserData = form.condenserData.slice(0, n);
    while (condenserData.length < n) {
      condenserData.push({ ...createEmptyCondenserData(), tyyppi: (form.lauhdutinTyyppiLaite || undefined) as CondenserData['tyyppi'] });
    }
    onPatchForm({ lauhduttimienMaara: String(n), condenserData });
  };

  return (
    <section className="maintenance-report-tab-section huolto-condenser-config form-grid">
      <label className="huolto-condenser-config-type">
        Lauhdutustapa *
        <select
          value={form.lauhdutinTyyppiLaite ?? ''}
          onChange={(e) => onCondenserTypeChange(e.target.value as HuoltoReportData['lauhdutinTyyppiLaite'])}
        >
          {options.map((opt) => (
            <option key={opt.value || 'empty'} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </label>
      {showCount ? <CountStepper label="Lauhduttimia" value={condCount} onChange={setCond} /> : null}
      {!kylmio && hasExternalNestelauhdutin(form.lauhdutinTyyppiLaite) ? (
        <ToggleSwitch
          className="form-toggle huolto-span-all"
          label="Yhteinen nestelauhdutus kaikille piireille"
          checked={form.vjNestelauhdutusJaettu ?? true}
          onChange={(checked) => onPatchForm({ vjNestelauhdutusJaettu: checked })}
        />
      ) : null}
    </section>
  );
}
