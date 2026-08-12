import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
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
  const inspection = <TyhjiointiInspection form={form} onChange={onChange} reportId={reportId} userId={userId} />;

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
