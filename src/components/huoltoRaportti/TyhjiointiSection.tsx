import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { useMaintenanceDocumentLayout } from '../../hooks/useMaintenanceDocumentLayout';
import { useHuoltoPrintFormLayout } from '../../hooks/useHuoltoPrintFormLayout';
import { HuoltoModuleSection } from './HuoltoModuleSection';
import { TyhjiointiInspection } from './TyhjiointiInspection';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
  reportId?: string | null;
  userId?: string;
}

export function TyhjiointiSection({ form, onChange, reportId, userId }: Props) {
  const printLayout = useHuoltoPrintFormLayout();
  const documentLayout = useMaintenanceDocumentLayout();

  const inspection = (
    <TyhjiointiInspection
      form={form}
      onChange={onChange}
      reportId={reportId}
      userId={userId}
      documentModuleKey={documentLayout ? 'tyhjiointi' : undefined}
    />
  );

  if (printLayout && documentLayout) {
    return <div className="sr-only" aria-hidden="true">{inspection}</div>;
  }

  if (printLayout) {
    return (
      <div className="huolto-part-inspection-list huolto-part-inspection-list--print-inline">
        {inspection}
      </div>
    );
  }

  return (
    <HuoltoModuleSection moduleKey="tyhjiointi" title="Tyhjiöinti">
      {inspection}
    </HuoltoModuleSection>
  );
}
