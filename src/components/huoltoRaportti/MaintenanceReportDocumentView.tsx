import { useEffect } from 'react';
import { HuoltoModulePresentationProvider } from './HuoltoModulePresentationContext';
import { useHuoltoEditUi } from './HuoltoEditUiContext';
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

type Props = Omit<MaintenanceReportTabContentProps, 'tabId'> & {
  tabs: MaintenanceReportTabItem[];
  tabCompletion?: Partial<Record<string, MaintenanceTabCompletionState>>;
  navTargetTabId?: string | null;
  onNavTargetHandled?: () => void;
};

export function MaintenanceReportDocumentView({
  tabs,
  tabCompletion,
  navTargetTabId,
  onNavTargetHandled,
  ...contentProps
}: Props) {
  const ui = useHuoltoEditUi();
  const sectionSettings = useMaintenanceReportSectionSettings();

  useEffect(() => {
    if (!navTargetTabId || !ui) return;
    openMaintenanceDocumentSection(navTargetTabId, ui.setOpen);
    onNavTargetHandled?.();
  }, [navTargetTabId, ui, onNavTargetHandled]);

  return (
    <HuoltoModulePresentationProvider value="flat">
      <div className="maintenance-report-document">
        {tabs.map((tab) => {
          const completion = tabCompletion?.[tab.id];
          const defaultOpen = completion !== 'ok';
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
              showSettings={maintenanceTabHasPrintSettings(tab.id, contentProps.form)}
              onOpenSettings={() => sectionSettings?.openSettings(tab.id)}
            >
              <MaintenanceReportTabContent tabId={tab.id} {...contentProps} />
            </MaintenanceReportDocumentSection>
          );
        })}
      </div>
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
