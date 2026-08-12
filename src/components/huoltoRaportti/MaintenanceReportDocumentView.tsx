import { useEffect } from 'react';
import { HuoltoModuleDialogProvider, useHuoltoModuleDialog } from './HuoltoModuleDialogContext';
import { HuoltoModulePresentationProvider } from './HuoltoModulePresentationContext';
import { useHuoltoEditUi } from './HuoltoEditUiContext';
import { maintenanceTabUsesDialogLauncher } from '../../lib/huoltoRaportti/maintenanceDocumentDialogTabs';
import {
  MaintenanceReportDocumentSection,
  maintenanceSectionDomId,
} from './MaintenanceReportDocumentSection';
import {
  MaintenanceReportTabContent,
  type MaintenanceReportTabContentProps,
} from './MaintenanceReportTabContent';
import type { MaintenanceTabCompletionState } from '../../lib/huoltoRaportti/maintenanceReportTabCompletion';
import { maintenanceDocumentTheme } from '../../lib/huoltoRaportti/maintenanceDocumentTheme';
import {
  buildMaintenanceDocumentTabSummary,
  maintenanceTabHasPrintSettings,
} from '../../lib/huoltoRaportti/maintenanceDocumentTabSummary';
import type { MaintenanceReportTabItem } from '../../lib/huoltoRaportti/maintenanceReportTabs';
import { useMaintenanceReportSectionSettings } from './MaintenanceReportSectionSettingsProvider';
import { HuoltoPrintForm } from './print/MaintenancePrintLayout';

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

  useEffect(() => {
    if (!navTargetTabId || !ui) return;
    openMaintenanceDocumentSection(navTargetTabId, ui.setOpen);
    if (maintenanceTabUsesDialogLauncher(navTargetTabId)) {
      window.requestAnimationFrame(() => moduleDialog?.open(navTargetTabId));
    }
    onNavTargetHandled?.();
  }, [navTargetTabId, ui, moduleDialog, onNavTargetHandled]);

  return (
    <HuoltoModulePresentationProvider value="flat">
      <HuoltoPrintForm>
        <div className="maintenance-report-document">
          {tabs.map((tab) => {
            const completion = tabCompletion?.[tab.id];
            const dialogLauncher = maintenanceTabUsesDialogLauncher(tab.id);
            const defaultOpen = dialogLauncher ? true : completion !== 'ok';
            const theme = maintenanceDocumentTheme(tab.id);

            return (
              <MaintenanceReportDocumentSection
                key={tab.id}
                tabId={tab.id}
                title={tab.label}
                theme={theme}
                summary={buildMaintenanceDocumentTabSummary(tab.id, contentProps.form)}
                completion={completion}
                defaultOpen={defaultOpen}
                dialogLauncher={dialogLauncher}
                showSettings={maintenanceTabHasPrintSettings(tab.id, contentProps.form)}
                onOpenSettings={() => sectionSettings?.openSettings(tab.id)}
              >
                <MaintenanceReportTabContent tabId={tab.id} {...contentProps} />
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
