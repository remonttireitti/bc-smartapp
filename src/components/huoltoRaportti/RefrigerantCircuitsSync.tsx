import { useEffect } from 'react';
import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { createEmptyRefrigerantCircuitData } from '../../lib/huoltoRaportti/defaults';
import { getRefrigerantCircuitCount } from '../../lib/huoltoRaportti/refrigerantCircuitHelpers';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
}

export function RefrigerantCircuitsSync({ form, onChange }: Props) {
  const circuitCount = getRefrigerantCircuitCount(form);

  useEffect(() => {
    const patch: Partial<HuoltoReportData> = {};
    if (circuitCount >= 2 && !form.kylmaainePiiri2) {
      patch.kylmaainePiiri2 = createEmptyRefrigerantCircuitData();
    }
    if (circuitCount >= 3 && !form.kylmaainePiiri3) {
      patch.kylmaainePiiri3 = createEmptyRefrigerantCircuitData();
    }
    if (circuitCount < 2) {
      patch.kylmaainePiiri2 = null;
      patch.kylmaainePiiri3 = null;
    } else if (circuitCount < 3) {
      patch.kylmaainePiiri3 = null;
    }
    if (Object.keys(patch).length > 0) onChange(patch);
  }, [circuitCount, form.kylmaainePiiri2, form.kylmaainePiiri3, onChange]);

  return null;
}
