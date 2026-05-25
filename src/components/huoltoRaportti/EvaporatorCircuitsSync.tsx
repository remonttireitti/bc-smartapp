import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { useEvaporatorCircuitsSync } from './useEvaporatorCircuits';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
}

export function EvaporatorCircuitsSync({ form, onChange }: Props) {
  useEvaporatorCircuitsSync(form, onChange);
  return null;
}
