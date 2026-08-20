import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { mlpSectionTitle } from '../../lib/huoltoRaportti/deviceModuleLogic';
import {
  energiatehokkuusSectionTitle,
  kiinteistoPiiriSectionTitle,
} from '../../lib/huoltoRaportti/sectionTitles';
import { mlpSummaryRows } from '../../lib/huoltoRaportti/moduleSummaryRows';
import { useMaintenanceDocumentLayout } from '../../hooks/useMaintenanceDocumentLayout';
import { DocumentModuleInspection } from './DocumentModuleInspection';
import { MlpSection } from './MlpSection';

type Props = {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
  part?: 'kiinteisto' | 'energia';
};

function resolveMlpDocumentKey(part: Props['part']): string | undefined {
  if (part === 'kiinteisto') return 'kiinteistoJahdytys';
  if (part === 'energia') return 'energia';
  return 'mlp';
}

function resolveMlpTitle(form: HuoltoReportData, part: Props['part']): string {
  if (part === 'kiinteisto') return kiinteistoPiiriSectionTitle(form.laiteTyyppi);
  if (part === 'energia') return energiatehokkuusSectionTitle(form.laiteTyyppi);
  return mlpSectionTitle(form.laiteTyyppi);
}

export function MlpDocumentSection({ form, onChange, part }: Props) {
  const documentLayout = useMaintenanceDocumentLayout();
  const moduleKey = resolveMlpDocumentKey(part);
  const title = resolveMlpTitle(form, part);

  return (
    <DocumentModuleInspection
      data={form}
      onChange={(next) => onChange(next)}
      documentModuleKey={documentLayout ? moduleKey : undefined}
      title={title}
      titleId={`${moduleKey}-dialog-title`}
      summaryRows={mlpSummaryRows(form, part)}
      editLabel={`Muokkaa ${title.toLowerCase()}`}
      emptyHint="Täytä tiedot painamalla Muokkaa."
    >
      {(draft, patchDraft) => <MlpSection form={draft} onChange={patchDraft} part={part} />}
    </DocumentModuleInspection>
  );
}
