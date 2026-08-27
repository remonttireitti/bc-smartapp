import { konvektoriRowIsFaulty } from '../../lib/huoltoRaportti/konvektoriTarkastus';
import {
  konvektoritSummaryRows,
  konvektoritTabComplete,
} from '../../lib/huoltoRaportti/moduleSummaryRows';
import { konvektoritSectionTitle } from '../../lib/huoltoRaportti/sectionTitles';
import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { useMaintenanceDocumentLayout } from '../../hooks/useMaintenanceDocumentLayout';
import { DocumentModuleInspection } from './DocumentModuleInspection';
import { KonvektoritSection } from './KonvektoritSection';

type Props = {
  form: HuoltoReportData;
  onPatchForm: (patch: Partial<HuoltoReportData>) => void;
  onPrintKonvektoriFaults?: () => void;
  printBusy: boolean;
};

export function KonvektoritTabSection({
  form,
  onPatchForm,
  onPrintKonvektoriFaults,
  printBusy,
}: Props) {
  const documentLayout = useMaintenanceDocumentLayout();
  const title = konvektoritSectionTitle(form.laiteTyyppi);
  const rows = form.konvektoriRows ?? [];
  const complete = konvektoritTabComplete(rows);
  const hasFaults = rows.some((row) => konvektoriRowIsFaulty(row));

  return (
    <DocumentModuleInspection
      data={form}
      onChange={(next) => onPatchForm(next)}
      documentModuleKey={documentLayout ? 'konvektorit' : undefined}
      title={title}
      titleId="konvektorit-dialog-title"
      dialogClassName="konvektori-list-dialog"
      summaryRows={konvektoritSummaryRows(form)}
      complete={complete && !hasFaults}
      editLabel="Muokkaa konvektoreita"
      emptyHint="Lisää konvektorit listaan painamalla Muokkaa."
    >
      {(draft, patchDraft) => (
        <KonvektoritSection
          rows={draft.konvektoriRows ?? []}
          onChange={(konvektoriRows) => patchDraft({ konvektoriRows })}
          onPrintFaults={onPrintKonvektoriFaults}
          printFaultsBusy={printBusy}
          embeddedInParentDialog
        />
      )}
    </DocumentModuleInspection>
  );
}
