import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { useHuoltoPrintFormLayout } from '../../hooks/useHuoltoPrintFormLayout';
import { HuoltoModuleSection } from './HuoltoModuleSection';
import { VjLauhdutinConfigInspection } from './VjLauhdutinConfigInspection';

interface Props {
  form: HuoltoReportData;
  onCondenserTypeChange: (tyyppi: HuoltoReportData['lauhdutinTyyppiLaite']) => void;
  onFreeCoolingChange: (checked: boolean) => void;
  onChange: (patch: Partial<HuoltoReportData>) => void;
}

export function VjLauhdutinSection(props: Props) {
  const printLayout = useHuoltoPrintFormLayout();

  const config = (
    <VjLauhdutinConfigInspection
      form={props.form}
      onChange={props.onChange}
      onCondenserTypeChange={props.onCondenserTypeChange}
      onFreeCoolingChange={props.onFreeCoolingChange}
    />
  );

  if (printLayout) {
    return (
      <div className="huolto-part-inspection-list huolto-part-inspection-list--print-inline">
        {config}
      </div>
    );
  }

  return (
    <HuoltoModuleSection moduleKey="lauhdutin" title="Lauhdutin">
      {config}
    </HuoltoModuleSection>
  );
}
