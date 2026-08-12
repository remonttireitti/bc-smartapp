import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { kylmaaineChargeTitle } from '../../lib/huoltoRaportti/sectionTitles';
import { useMaintenanceDocumentLayout } from '../../hooks/useMaintenanceDocumentLayout';
import { useHuoltoPrintFormLayout } from '../../hooks/useHuoltoPrintFormLayout';
import { HuoltoModuleSection } from './HuoltoModuleSection';
import { RefrigerantChargeDialog, RefrigerantChargeDialogFields } from './RefrigerantChargeDialog';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
  defaultOpen?: boolean;
}

export function RefrigerantChargeSection({ form, onChange, defaultOpen }: Props) {
  const printLayout = useHuoltoPrintFormLayout();
  const documentLayout = useMaintenanceDocumentLayout();

  const chargeDialog = (
    <RefrigerantChargeDialog
      form={form}
      onChange={onChange}
      documentModuleKey={documentLayout ? 'kylmaaine' : undefined}
    />
  );

  if (printLayout) {
    return <div className="sr-only" aria-hidden="true">{chargeDialog}</div>;
  }

  return (
    <HuoltoModuleSection
      moduleKey="kylmaaineCharge"
      title={kylmaaineChargeTitle(form.laiteTyyppi)}
      defaultOpen={defaultOpen}
    >
      <RefrigerantChargeDialogFields form={form} onChange={onChange} />
      {chargeDialog}
    </HuoltoModuleSection>
  );
}
