import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import type { LampopumppuDocumentUnitId } from '../../lib/huoltoRaportti/lampopumppuDocumentHelpers';
import { lampopumppuSummaryRows } from '../../lib/huoltoRaportti/moduleSummaryRows';
import { DocumentModuleInspection } from './DocumentModuleInspection';
import { LampopumppuSection } from './LampopumppuSection';

type Props = {
  form: HuoltoReportData;
  unitId: LampopumppuDocumentUnitId;
  onChange: (patch: Partial<HuoltoReportData>) => void;
  documentUnitKey?: string;
};

const UNIT_TITLES: Record<LampopumppuDocumentUnitId, string> = {
  ulkoyksikko: 'Ulkoyksikkö',
  sisayksikko: 'Sisäyksiköt',
  mittaukset: 'Mittaukset',
};

export function LampopumppuDocumentUnit({
  form,
  unitId,
  onChange,
  documentUnitKey,
}: Props) {
  const title = UNIT_TITLES[unitId];

  return (
    <DocumentModuleInspection
      data={form}
      onChange={(next) => onChange(next)}
      documentModuleKey={documentUnitKey}
      title={title}
      titleId={`lampopumppu-${unitId}-dialog-title`}
      summaryRows={lampopumppuSummaryRows(form)}
      editLabel={`Muokkaa: ${title.toLowerCase()}`}
      emptyHint={`Täytä ${title.toLowerCase()} painamalla Muokkaa.`}
    >
      {(draft, patchDraft) => (
        <LampopumppuSection form={draft} onChange={patchDraft} part={unitId} />
      )}
    </DocumentModuleInspection>
  );
}
