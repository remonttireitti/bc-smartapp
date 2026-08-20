import type { ReactNode } from 'react';
import type { ModuleSummaryRow } from '../../lib/huoltoRaportti/moduleSummaryRows';
import { mergeHuoltoReportData } from '../../lib/huoltoRaportti/defaults';
import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { useMaintenanceDocumentLayout } from '../../hooks/useMaintenanceDocumentLayout';
import { HuoltoInspectionDialogShell, useHuoltoInspectionDialog } from './HuoltoInspectionDialogShell';
import { useRegisterHuoltoModuleDialog } from './HuoltoModuleDialogContext';
import { HuoltoModulePresentationProvider } from './HuoltoModulePresentationContext';

function mergeRaportointiDialogDraft(
  live: HuoltoReportData,
  draft: HuoltoReportData,
): HuoltoReportData {
  const merged = mergeHuoltoReportData(live, draft);
  if (live.laiteTyyppi.trim() && !draft.laiteTyyppi.trim()) {
    return mergeHuoltoReportData(merged, {
      laiteTyyppi: live.laiteTyyppi,
      laiteValmistaja: live.laiteValmistaja,
      laiteMalli: live.laiteMalli,
      laiteTunnus: live.laiteTunnus,
      laiteSarjanumero: live.laiteSarjanumero,
      laiteSijainti: live.laiteSijainti,
      laiteKayttotarkoitus: live.laiteKayttotarkoitus,
      vjOhjausData: live.vjOhjausData,
      selectedModules: live.selectedModules,
      hiddenTabIds: live.hiddenTabIds,
      moduleTabOrder: live.moduleTabOrder,
    });
  }
  return merged;
}

type Props<T> = {
  data: T;
  onChange: (next: T) => void;
  documentModuleKey?: string;
  title: string;
  titleId?: string;
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
  canSave,
  children,
}: Props<T>) {
  const documentLayout = useMaintenanceDocumentLayout();
  const hideLauncher = documentLayout && !!documentModuleKey;

  const { open, openDialog, closeDialog, draft, setDraft } = useHuoltoInspectionDialog({
    data,
    onChange: (draftData) => {
      if (documentModuleKey === 'raportointi') {
        onChange(
          mergeRaportointiDialogDraft(
            data as HuoltoReportData,
            draftData as HuoltoReportData,
          ) as T,
        );
        return;
      }
      onChange(draftData);
    },
    canSave,
  });

  useRegisterHuoltoModuleDialog(documentModuleKey, openDialog);

  const patchDraft = (patch: Partial<T>) => setDraft((prev) => ({ ...prev, ...patch }));

  if (!hideLauncher) {
    return <>{children(data, (patch) => onChange({ ...data, ...patch }))}</>;
  }

  return (
    <HuoltoInspectionDialogShell open={open} title={title} titleId={titleId} onClose={closeDialog}>
      <HuoltoModulePresentationProvider value="accordion">
        {children(draft, patchDraft)}
      </HuoltoModulePresentationProvider>
    </HuoltoInspectionDialogShell>
  );
}
