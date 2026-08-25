import type { MaintenanceReportTabId } from './maintenanceReportTabs';
import { getModuleTheme, type ModuleTheme } from './moduleThemes';
import { isCustomModuleTabId } from './customModuleTypes';
import { maintenanceSectionThemeKey } from './maintenanceReportSectionCatalog';

const RAPORTOINTI_THEME: ModuleTheme = {
  accent: '#2563eb',
  bg: '#eff6ff',
  border: '#93c5fd',
  header: '#1d4ed8',
};

export function maintenanceDocumentTheme(tabId: MaintenanceReportTabId | string): ModuleTheme {
  if (tabId === 'raportointi') return RAPORTOINTI_THEME;
  if (tabId === 'tiiveyskoe') return getModuleTheme('tiiveyskoe');
  if (tabId === 'tyhjiointi') return getModuleTheme('tyhjiointi');
  if (isCustomModuleTabId(tabId)) return getModuleTheme('huomiot');
  const themeKey = maintenanceSectionThemeKey(tabId);
  return themeKey ? getModuleTheme(themeKey) : RAPORTOINTI_THEME;
}
