import { useEffect } from 'react';
import type { CondenserData, HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { createEmptyCondenserData } from '../../lib/huoltoRaportti/defaults';
import { CondenserModule } from './CondenserModule';
import { HuoltoModuleSection } from './HuoltoModuleSection';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
}

export function CondensersSection({ form, onChange }: Props) {
  const circuitCount = Math.min(3, Math.max(1, parseInt(form.kylmaainePiireja, 10) || 1));

  useEffect(() => {
    if (form.condenserData.length === circuitCount) return;
    if (form.condenserData.length < circuitCount) {
      onChange({
        condenserData: [
          ...form.condenserData,
          ...Array.from({ length: circuitCount - form.condenserData.length }, () =>
            createEmptyCondenserData(),
          ),
        ],
      });
    } else {
      onChange({ condenserData: form.condenserData.slice(0, circuitCount) });
    }
  }, [circuitCount, form.condenserData, onChange]);

  function updateCondenser(index: number, data: CondenserData) {
    const next = [...form.condenserData];
    next[index] = data;
    onChange({ condenserData: next });
  }

  return (
    <HuoltoModuleSection moduleKey="lauhdutin" title="Lauhdutin">
      {form.condenserData.slice(0, circuitCount).map((condenser, index) => (
        <CondenserModule
          key={index}
          index={index}
          titleLabel={`Lauhdutin — piiri ${index + 1}`}
          data={condenser}
          onChange={(data) => updateCondenser(index, data)}
        />
      ))}
    </HuoltoModuleSection>
  );
}
