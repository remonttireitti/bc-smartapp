import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { useMaintenanceDocumentLayout } from '../../hooks/useMaintenanceDocumentLayout';
import { RefrigerantCircuitsInspection } from './RefrigerantCircuitsInspection';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
}

export function RefrigerantCircuitsSection({ form, onChange }: Props) {
  const documentLayout = useMaintenanceDocumentLayout();

  return (
    <RefrigerantCircuitsInspection
      form={form}
      onChange={onChange}
      documentModuleKey={documentLayout ? 'kylmaainePiiri' : undefined}
    />
  );
}

export { RefrigerantCircuitsEditor } from './RefrigerantCircuitsEditor';
