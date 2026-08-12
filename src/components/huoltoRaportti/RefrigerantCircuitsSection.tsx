import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { RefrigerantCircuitsInspection } from './RefrigerantCircuitsInspection';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
}

export function RefrigerantCircuitsSection({ form, onChange }: Props) {
  return (
    <RefrigerantCircuitsInspection
      form={form}
      onChange={onChange}
      documentModuleKey="kylmaainePiiri"
    />
  );
}

export { RefrigerantCircuitsEditor } from './RefrigerantCircuitsEditor';
