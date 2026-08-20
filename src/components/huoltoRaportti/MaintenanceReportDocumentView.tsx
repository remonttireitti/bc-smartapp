import { useEffect, useMemo } from 'react';
import { HuoltoModuleDialogProvider, useHuoltoModuleDialog } from './HuoltoModuleDialogContext';
import { HuoltoModulePresentationProvider } from './HuoltoModulePresentationContext';
import { useHuoltoEditUi } from './HuoltoEditUiContext';
import { maintenanceTabUsesDialogLauncher } from '../../lib/huoltoRaportti/maintenanceDocumentDialogTabs';
import {
  buildMaintenanceDocumentEntries,
  documentEntryCompletion,
  documentEntryUsesDialogLauncher,
  documentNavTargetTabId,
} from '../../lib/huoltoRaportti/maintenanceDocumentUnitEntries';
import {
  MaintenanceReportDocumentSection,
  maintenanceSectionDomId,
} from './MaintenanceReportDocumentSection';
import { MaintenanceReportDocumentTile } from './MaintenanceReportDocumentTile';
import {
  MaintenanceReportTabContent,
  type MaintenanceReportTabContentProps,
} from './MaintenanceReportTabContent';
import { maintenanceDocumentTheme } from '../../lib/huoltoRaportti/maintenanceDocumentTheme';
import {
  buildMaintenanceDocumentTabSummary,
  maintenanceTabHasPrintSettings,
} from '../../lib/huoltoRaportti/maintenanceDocumentTabSummary';
import type { MaintenanceReportTabItem, MaintenanceReportTabId } from '../../lib/huoltoRaportti/maintenanceReportTabs';
import { useMaintenanceReportSectionSettings } from './MaintenanceReportSectionSettingsProvider';
import { HuoltoPrintForm } from './print/MaintenancePrintLayout';
import { EvaporatorCircuitsSync } from './EvaporatorCircuitsSync';
import { CondenserCircuitsSync } from './CondenserCircuitsSync';
import { EvaporatorModule } from './EvaporatorModule';
import { CondenserModule } from './CondenserModule';
import { createEvaporatorActions, evaporatorTitleForIndex } from './useEvaporatorCircuits';
import { lauhdutinUnitTitle } from '../../lib/huoltoRaportti/sectionTitles';
import type { MaintenanceTabCompletionState } from '../../lib/huoltoRaportti/maintenanceReportTabCompletion';

type Props = Omit<MaintenanceReportTabContentProps, 'tabId'> & {
  tabs: MaintenanceReportTabItem[];
  tabCompletion?: Partial<Record<string, MaintenanceTabCompletionState>>;
  navTargetTabId?: string | null;
  onNavTargetHandled?: () => void;
};

export function MaintenanceReportDocumentView(props: Props) {
  return (
    <HuoltoModuleDialogProvider>
      <MaintenanceReportDocumentViewInner {...props} />
    </HuoltoModuleDialogProvider>
  );
}

function MaintenanceReportDocumentViewInner({
  tabs,
  tabCompletion,
  navTargetTabId,
  onNavTargetHandled,
  ...contentProps
}: Props) {
  const ui = useHuoltoEditUi();
  const sectionSettings = useMaintenanceReportSectionSettings();
  const moduleDialog = useHuoltoModuleDialog();
  const { form, onPatchForm, onSyncForm } = contentProps;

  const entries = useMemo(() => buildMaintenanceDocumentEntries(tabs, form), [tabs, form]);
  const hasEvaporatorUnits = entries.some((entry) => entry.kind === 'evaporatorUnit');
  const hasCondenserUnits = entries.some((entry) => entry.kind === 'condenserUnit');
  const evaporatorActions = useMemo(
    () => createEvaporatorActions(form, onPatchForm),
    [form, onPatchForm],
  );

  useEffect(() => {
    if (!navTargetTabId || !ui) return;
    const targetId = documentNavTargetTabId(navTargetTabId, form);
    const opensDialog =
      targetId.includes(':') || maintenanceTabUsesDialogLauncher(targetId as never);
    if (opensDialog) {
      window.requestAnimationFrame(() => {
        scrollToMaintenanceSection(targetId);
        moduleDialog?.open(targetId);
      });
    } else {
      openMaintenanceDocumentSection(targetId, ui.setOpen);
    }
    onNavTargetHandled?.();
  }, [navTargetTabId, ui, moduleDialog, onNavTargetHandled, form]);

  return (
    <HuoltoModulePresentationProvider value="flat">
      <HuoltoPrintForm>
        {hasEvaporatorUnits ? <EvaporatorCircuitsSync form={form} onChange={onSyncForm} /> : null}
        {hasCondenserUnits ? <CondenserCircuitsSync form={form} onChange={onPatchForm} /> : null}
        <div className="grid maintenance-report-document">
          {entries.map((entry) => {
            const completion = documentEntryCompletion(entry, form, tabCompletion);
            const dialogLauncher =
              documentEntryUsesDialogLauncher(entry) || maintenanceTabUsesDialogLauncher(entry.tabId);
            const defaultOpen = dialogLauncher ? false : completion !== 'ok';
            const theme = maintenanceDocumentTheme(
              entry.kind === 'evaporatorUnit'
                ? 'hoyrystin'
                : entry.kind === 'condenserUnit'
                  ? 'lauhdutin'
                  : (entry.tabId as Parameters<typeof maintenanceDocumentTheme>[0]),
            );

            const tabIdForSettings = entry.kind === 'tab' ? (entry.tabId as MaintenanceReportTabId) : null;

            const hiddenChildren =
              entry.kind === 'evaporatorUnit' && entry.unitIndex != null ? (
                <EvaporatorModule
                  index={entry.unitIndex}
                  laiteTyyppi={form.laiteTyyppi}
                  titleLabel={evaporatorTitleForIndex(form, entry.unitIndex)}
                  data={form.evaporatorData[entry.unitIndex]}
                  locked={false}
                  showSameAsFirst={entry.unitIndex > 0}
                  sameAsFirst={form.evaporatorSamaKuinEnsimmainen[entry.unitIndex]}
                  onSameAsFirstChange={(value) =>
                    evaporatorActions.setSameAsFirst(entry.unitIndex!, value)
                  }
                  onChange={(data) => evaporatorActions.updateEvaporator(entry.unitIndex!, data)}
                  documentUnitKey={entry.tabId}
                  hidePartRow
                />
              ) : entry.kind === 'condenserUnit' && entry.unitIndex != null ? (
                <CondenserModule
                  index={entry.unitIndex}
                  titleLabel={lauhdutinUnitTitle(form.laiteTyyppi, entry.unitIndex)}
                  data={form.condenserData[entry.unitIndex]}
                  onChange={(data) => {
                    const next = [...form.condenserData];
                    next[entry.unitIndex!] = data;
                    onPatchForm({ condenserData: next });
                  }}
                  documentUnitKey={entry.tabId}
                  hidePartRow
                />
              ) : (
                <MaintenanceReportTabContent
                  tabId={entry.tabId as MaintenanceReportTabContentProps['tabId']}
                  {...contentProps}
                />
              );

            if (dialogLauncher) {
              return (
                <MaintenanceReportDocumentTile
                  key={entry.key}
                  tabId={entry.tabId}
                  title={entry.title}
                  theme={theme}
                  completion={completion}
                  showSettings={tabIdForSettings ? maintenanceTabHasPrintSettings(tabIdForSettings, form) : false}
                  onOpenSettings={() => tabIdForSettings && sectionSettings?.openSettings(tabIdForSettings)}
                >
                  {hiddenChildren}
                </MaintenanceReportDocumentTile>
              );
            }

            return (
              <MaintenanceReportDocumentSection
                key={entry.key}
                tabId={entry.tabId}
                title={entry.title}
                theme={theme}
                summary={
                  tabIdForSettings
                    ? buildMaintenanceDocumentTabSummary(tabIdForSettings, form)
                    : undefined
                }
                completion={completion}
                defaultOpen={defaultOpen}
                dialogLauncher={false}
                showSettings={tabIdForSettings ? maintenanceTabHasPrintSettings(tabIdForSettings, form) : false}
                onOpenSettings={() => tabIdForSettings && sectionSettings?.openSettings(tabIdForSettings)}
              >
                {hiddenChildren}
              </MaintenanceReportDocumentSection>
            );
          })}
        </div>
      </HuoltoPrintForm>
    </HuoltoModulePresentationProvider>
  );
}

export function scrollToMaintenanceSection(tabId: string) {
  const el = document.getElementById(maintenanceSectionDomId(tabId));
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function openMaintenanceDocumentSection(
  tabId: string,
  setOpen: (key: string, open: boolean) => void,
) {
  setOpen(`document:${tabId}`, true);
  window.requestAnimationFrame(() => scrollToMaintenanceSection(tabId));
}
