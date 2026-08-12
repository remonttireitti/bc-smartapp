import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { useHuoltoPrintFormLayout } from '../../hooks/useHuoltoPrintFormLayout';
import { HuoltoModuleSection } from './HuoltoModuleSection';
import { TiiveyskoeInspection } from './TiiveyskoeInspection';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
  reportId?: string | null;
  userId?: string;
}

export function TiiveyskoeSection({ form, onChange, reportId, userId }: Props) {
  const printLayout = useHuoltoPrintFormLayout();
  const inspection = <TiiveyskoeInspection form={form} onChange={onChange} reportId={reportId} userId={userId} />;

  if (printLayout) {
    return (
      <div className="huolto-part-inspection-list huolto-part-inspection-list--print-inline">
        {inspection}
      </div>
    );
  }

  return (
    <HuoltoModuleSection moduleKey="tiiveyskoe" title="Tiiveyskoe">
      {inspection}
    </HuoltoModuleSection>
  );
}
