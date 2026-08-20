import type { ReactNode } from 'react';
import type { ModuleSummaryRow } from '../../lib/huoltoRaportti/moduleSummaryRows';
import { useMaintenanceDocumentLayout } from '../../hooks/useMaintenanceDocumentLayout';
import { HuoltoInspectionDialogShell, useHuoltoInspectionDialog } from './HuoltoInspectionDialogShell';
import { useRegisterHuoltoModuleDialog } from './HuoltoModuleDialogContext';
import { HuoltoModulePresentationProvider } from './HuoltoModulePresentationContext';
import { HuoltoModuleSummaryPanel } from './HuoltoModuleSummaryPanel';

type Props<T> = {
  data: T;
  onChange: (next: T) => void;
  documentModuleKey?: string;
  title: string;
  titleId?: string;
  summaryRows: ModuleSummaryRow[];
  complete?: boolean;
  editLabel?: string;
  emptyHint?: string;
  canSave?: (draft: T) => boolean;
  children: (draft: T, patchDraft: (patch: Partial<T>) => void) => ReactNode;
};

export function DocumentModuleInspection<T extends object>({
  data,
  onChange,
  documentModuleKey,
  title,
  titleId,
  summaryRows,
  complete = false,
  editLabel = 'Muokkaa',
  emptyHint,
  canSave,
  children,
}: Props<T>) {
  const documentLayout = useMaintenanceDocumentLayout();
  const hideLauncher = documentLayout && !!documentModuleKey;

  const { open, openDialog, closeDialog, draft, setDraft } = useHuoltoInspectionDialog({
    data,
    onChange,
    canSave,
  });

  useRegisterHuoltoModuleDialog(documentModuleKey, openDialog);

  const patchDraft = (patch: Partial<T>) => setDraft((prev) => ({ ...prev, ...patch }));

  if (!hideLauncher) {
    return <>{children(data, (patch) => onChange({ ...data, ...patch }))}</>;
  }

  return (
    <>
      <HuoltoModuleSummaryPanel
        rows={summaryRows}
        complete={complete}
        onEdit={openDialog}
        editLabel={editLabel}
        emptyHint={emptyHint}
      />
      <HuoltoInspectionDialogShell open={open} title={title} titleId={titleId} onClose={closeDialog}>
        <HuoltoModulePresentationProvider value="accordion">
          {children(draft, patchDraft)}
        </HuoltoModulePresentationProvider>
      </HuoltoInspectionDialogShell>
    </>
  );
}
