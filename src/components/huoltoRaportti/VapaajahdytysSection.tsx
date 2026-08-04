import type { HuoltoReportData, VapaajahdytysData, VapaajahdytysOhjaus } from '../../lib/huoltoRaportti/types';
import { HuoltoModuleSection } from './HuoltoModuleSection';
import { VapaajahdytysInspection } from './VapaajahdytysInspection';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
}

export function VapaajahdytysSection({ form, onChange }: Props) {
  const data: VapaajahdytysData = form.vapaajahdytysData ?? {
    neste: '',
    virtaus: '',
    meno: '',
    tulo: '',
    pumppuTarkastettu: false,
    pumppuValmistaja: '',
    pumppuMalli: '',
    ohjaus: '' as VapaajahdytysOhjaus,
  };

  const patch = (next: Partial<VapaajahdytysData>) =>
    onChange({ vapaajahdytysData: { ...data, ...next } });

  return (
    <HuoltoModuleSection moduleKey="vapaajahdytys" title="Vapaajäähdytys">
      <div className="huolto-part-inspection-list">
        <VapaajahdytysInspection data={data} onChange={patch} />
      </div>
    </HuoltoModuleSection>
  );
}
