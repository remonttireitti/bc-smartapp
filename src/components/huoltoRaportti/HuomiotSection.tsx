import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { huomiotSectionTitle } from '../../lib/huoltoRaportti/sectionTitles';
import { useMaintenanceDocumentLayout } from '../../hooks/useMaintenanceDocumentLayout';
import { useHuoltoPrintFormLayout } from '../../hooks/useHuoltoPrintFormLayout';
import { HuoltoModuleSection } from './HuoltoModuleSection';
import { HuomiotInspection } from './HuomiotInspection';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
  reportId?: string;
  userId?: string;
}

export function HuomiotSection({ form, onChange, reportId, userId }: Props) {
  const printLayout = useHuoltoPrintFormLayout();
  const documentLayout = useMaintenanceDocumentLayout();
  const title = huomiotSectionTitle(form.laiteTyyppi);

  const inspection = (
    <HuomiotInspection
      form={form}
      onChange={onChange}
      reportId={reportId}
      userId={userId}
      documentModuleKey={documentLayout ? 'huomiot' : undefined}
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
    <HuoltoModuleSection moduleKey="huomiot" title={title}>
      {inspection}
    </HuoltoModuleSection>
  );
}
