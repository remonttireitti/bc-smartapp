import type { HuoltoReportData, VapaajahdytysData, VapaajahdytysOhjaus } from '../../lib/huoltoRaportti/types';
import { useMaintenanceDocumentLayout } from '../../hooks/useMaintenanceDocumentLayout';
import { HuoltoModuleSection } from './HuoltoModuleSection';
import { VapaajahdytysInspection } from './VapaajahdytysInspection';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
}

export function VapaajahdytysSection({ form, onChange }: Props) {
  const documentLayout = useMaintenanceDocumentLayout();
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

  const content = (
    <VapaajahdytysInspection
      data={data}
      onChange={patch}
      documentModuleKey={documentLayout ? 'vapaajahdytys' : undefined}
    />
  );

  if (documentLayout) return content;

  return (
    <HuoltoModuleSection moduleKey="vapaajahdytys" title="Vapaajäähdytys">
      <div className="huolto-part-inspection-list">{content}</div>
    </HuoltoModuleSection>
  );
}
