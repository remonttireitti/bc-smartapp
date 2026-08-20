import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { lampopumppuSummaryRows } from '../../lib/huoltoRaportti/moduleSummaryRows';
import { useMaintenanceDocumentLayout } from '../../hooks/useMaintenanceDocumentLayout';
import { DocumentModuleInspection } from './DocumentModuleInspection';
import { LampopumppuSection } from './LampopumppuSection';

type Props = {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
  showUlkoyksikko?: boolean;
  showSisayksikko?: boolean;
  showMittaukset?: boolean;
};

export function LampopumppuDocumentSection({
  form,
  onChange,
  showUlkoyksikko,
  showSisayksikko,
  showMittaukset,
}: Props) {
  const documentLayout = useMaintenanceDocumentLayout();

  return (
    <DocumentModuleInspection
      data={form}
      onChange={(next) => onChange(next)}
      documentModuleKey={documentLayout ? 'lampopumppu' : undefined}
      title="Lämpöpumppu"
      titleId="lampopumppu-dialog-title"
      summaryRows={lampopumppuSummaryRows(form)}
      editLabel="Muokkaa lämpöpumppua"
      emptyHint="Täytä lämpöpumpun tiedot painamalla Muokkaa."
    >
      {(draft, patchDraft) => (
        <LampopumppuSection
          form={draft}
          onChange={patchDraft}
          showUlkoyksikko={showUlkoyksikko}
          showSisayksikko={showSisayksikko}
          showMittaukset={showMittaukset}
        />
      )}
    </DocumentModuleInspection>
  );
}
