import { customModuleTabId } from './customModuleTypes';
import { applyMaintenanceTabCustomization } from './maintenanceReportTabCustomization';
import { MAINTENANCE_REPORT_BUILTIN_SECTIONS } from './maintenanceReportSectionCatalog';
import type {
  BuiltInMaintenanceReportTabId,
  MaintenanceReportTabBuildInput,
  MaintenanceReportTabId,
  MaintenanceReportTabItem,
} from './maintenanceReportTabTypes';

export type {
  BuiltInMaintenanceReportTabId,
  MaintenanceReportTabBuildInput,
  MaintenanceReportTabId,
  MaintenanceReportTabItem,
} from './maintenanceReportTabTypes';

const TRAILING_TAB_IDS = new Set<BuiltInMaintenanceReportTabId>(['huomiot', 'huoltotiedot']);

function appendVisibleSections(
  tabs: MaintenanceReportTabItem[],
  input: MaintenanceReportTabBuildInput,
  trailingOnly: boolean,
) {
  for (const section of MAINTENANCE_REPORT_BUILTIN_SECTIONS) {
    const isTrailing = TRAILING_TAB_IDS.has(section.id);
    if (trailingOnly !== isTrailing) continue;
    if (section.id !== 'raportointi' && !input.laiteTyyppi) {
      if (!trailingOnly) break;
      continue;
    }
    if (!section.isVisible(input)) continue;
    tabs.push({
      id: section.id,
      label: section.label(input.laiteTyyppi),
    });
  }
}

export function buildMaintenanceReportTabs(input: MaintenanceReportTabBuildInput): MaintenanceReportTabItem[] {
  const tabs: MaintenanceReportTabItem[] = [];
  appendVisibleSections(tabs, input, false);

  for (const customModule of input.customModules ?? []) {
    tabs.push({
      id: customModuleTabId(customModule.id) as MaintenanceReportTabId,
      label: customModule.title,
    });
  }

  appendVisibleSections(tabs, input, true);

  return applyMaintenanceTabCustomization(
    tabs,
    input.hiddenTabIds,
    input.moduleTabOrder,
  );
}

export function readMaintenanceReportActiveTab(viewKey: string): MaintenanceReportTabId | null {
  try {
    const raw = sessionStorage.getItem(`${viewKey}:activeTab`);
    if (!raw) return null;
    if (
      raw === 'laitetyyppi'
      || raw === 'vjOhjaus'
      || raw === 'laitetiedot'
      || raw === 'asiakas'
    ) {
      return 'raportointi';
    }
    return raw as MaintenanceReportTabId;
  } catch {
    return null;
  }
}

export function persistMaintenanceReportActiveTab(viewKey: string, tabId: MaintenanceReportTabId) {
  try {
    sessionStorage.setItem(`${viewKey}:activeTab`, tabId);
  } catch {
    /* ignore */
  }
}
