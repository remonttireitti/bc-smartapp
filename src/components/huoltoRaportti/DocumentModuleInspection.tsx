import { useCallback, type ReactNode } from 'react';
import type { ModuleSummaryRow } from '../../lib/huoltoRaportti/moduleSummaryRows';
import { mergeRaportointiDialogClose } from '../../lib/huoltoRaportti/maintenanceDeviceDraft';
import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { useMaintenanceDocumentLayout } from '../../hooks/useMaintenanceDocumentLayout';
import { HuoltoInspectionDialogShell, useHuoltoInspectionDialog } from './HuoltoInspectionDialogShell';
import { useRegisterHuoltoModuleDialog } from './HuoltoModuleDialogContext';
import { HuoltoModulePresentationProvider } from './HuoltoModulePresentationContext';

type Props<T> = {
  data: T;
  onChange: (next: T) => void;
  documentModuleKey?: string;
  title: string;
  titleId?: string;
  dialogClassName?: string;
  summaryRows?: ModuleSummaryRow[];
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
  dialogClassName,
  canSave,
  children,
}: Props<T>) {
  const documentLayout = useMaintenanceDocumentLayout();
  const hideLauncher = documentLayout && !!documentModuleKey;

  const commitPatch = useCallback((patch: Partial<T>) => {
    if (documentModuleKey === 'raportointi') {
      onChange(
        mergeRaportointiDialogClose(
          data as HuoltoReportData,
          { ...(data as HuoltoReportData), ...(patch as Partial<HuoltoReportData>) },
        ) as T,
      );
      return;
    }
    onChange({ ...data, ...patch });
  }, [data, documentModuleKey, onChange]);

  const { open, openDialog, closeDialog, draft, patchDraft } = useHuoltoInspectionDialog({
    data,
    onPatch: hideLauncher ? commitPatch : undefined,
    canSave,
  });

  useRegisterHuoltoModuleDialog(documentModuleKey, openDialog);

  if (!hideLauncher) {
    return <>{children(data, commitPatch)}</>;
  }

  return (
    <HuoltoInspectionDialogShell
      open={open}
      title={title}
      titleId={titleId}
      dialogClassName={dialogClassName}
      onClose={closeDialog}
    >
      <HuoltoModulePresentationProvider value="accordion">
        {children(draft, patchDraft)}
      </HuoltoModulePresentationProvider>
    </HuoltoInspectionDialogShell>
  );
}
