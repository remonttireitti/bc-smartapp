import { useEffect } from 'react';
import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { createEmptyCondenserData } from '../../lib/huoltoRaportti/defaults';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
}

export function CondenserCircuitsSync({ form, onChange }: Props) {
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

  return null;
}
