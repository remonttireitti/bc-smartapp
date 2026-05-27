import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { EvaporatorModule } from './EvaporatorModule';
import { hoyrystinSectionTitle } from '../../lib/huoltoRaportti/sectionTitles';
import { HuoltoModuleSection } from './HuoltoModuleSection';
import {
  createEvaporatorActions,
  evaporatorTitleForIndex,
  getEvaporatorCircuitCount,
} from './useEvaporatorCircuits';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
}

export function EvaporatorsSection({ form, onChange }: Props) {
  const isKylmakoneikko = form.laiteTyyppi === 'kylmäkoneikko';
  const circuitCount = getEvaporatorCircuitCount(form);
  const { updateEvaporator, setCount, setSameAsFirst } = createEvaporatorActions(form, onChange);

  return (
    <HuoltoModuleSection moduleKey="hoyrystin" title={hoyrystinSectionTitle(form.laiteTyyppi)}>
      {isKylmakoneikko && (
        <label>
          Höyrystimien määrä (1–10)
          <select
            value={form.evaporatorData.length}
            onChange={(e) => setCount(parseInt(e.target.value, 10))}
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      )}

      {form.evaporatorData.slice(0, circuitCount).map((evaporator, index) => (
        <EvaporatorModule
          key={index}
          index={index}
          laiteTyyppi={form.laiteTyyppi}
          titleLabel={evaporatorTitleForIndex(form, index)}
          data={evaporator}
          locked={false}
          showSameAsFirst={index > 0}
          sameAsFirst={form.evaporatorSamaKuinEnsimmainen[index]}
          onSameAsFirstChange={(v) => setSameAsFirst(index, v)}
          onChange={(data) => updateEvaporator(index, data)}
        />
      ))}
    </HuoltoModuleSection>
  );
}
