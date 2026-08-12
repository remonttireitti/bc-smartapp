import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { kylmaainePiiriSectionTitle } from '../../lib/huoltoRaportti/sectionTitles';
import {
  refrigerantCircuitsSummaryComplete,
  refrigerantCircuitsSummaryRows,
} from '../../lib/huoltoRaportti/moduleSummaryRows';
import { useMaintenanceDocumentLayout } from '../../hooks/useMaintenanceDocumentLayout';
import { HuoltoInspectionDialogShell, useHuoltoInspectionDialog } from './HuoltoInspectionDialogShell';
import { useRegisterHuoltoModuleDialog } from './HuoltoModuleDialogContext';
import { HuoltoModulePresentationProvider } from './HuoltoModulePresentationContext';
import { HuoltoModuleSummaryPanel } from './HuoltoModuleSummaryPanel';
import { RefrigerantCircuitsEditor } from './RefrigerantCircuitsEditor';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
  documentModuleKey?: string;
}

export function RefrigerantCircuitsInspection({ form, onChange, documentModuleKey }: Props) {
  const documentLayout = useMaintenanceDocumentLayout();
  const hideLauncher = documentLayout && !!documentModuleKey;
  const title = kylmaainePiiriSectionTitle(form.laiteTyyppi);

  const applyDraft = (next: HuoltoReportData) => onChange(next);

  const { open, openDialog, closeDialog, draft, setDraft } = useHuoltoInspectionDialog({
    data: form,
    onChange: applyDraft,
  });

  useRegisterHuoltoModuleDialog(documentModuleKey, openDialog);

  const patchDraft = (patch: Partial<HuoltoReportData>) => setDraft((prev) => ({ ...prev, ...patch }));

  if (!hideLauncher) {
    return <RefrigerantCircuitsEditor form={form} onChange={onChange} />;
  }

  return (
    <>
      <HuoltoModuleSummaryPanel
        rows={refrigerantCircuitsSummaryRows(form)}
        complete={refrigerantCircuitsSummaryComplete(form)}
        onEdit={openDialog}
        editLabel="Muokkaa kylmäainepiiriä"
      />

      <HuoltoInspectionDialogShell
        open={open}
        title={title}
        titleId="kylmaaine-piiri-dialog-title"
        onClose={closeDialog}
      >
        <HuoltoModulePresentationProvider value="accordion">
          <RefrigerantCircuitsEditor form={draft} onChange={patchDraft} />
        </HuoltoModulePresentationProvider>
      </HuoltoInspectionDialogShell>
    </>
  );
}
