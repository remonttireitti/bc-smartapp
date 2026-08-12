import type { MaintenanceReportTabId } from './maintenanceReportTabs';

/** Dokumenttinäkymässä yksi popup-moduuli — otsikon klikkaus avaa dialogin suoraan. */
export const MAINTENANCE_DIALOG_LAUNCHER_TABS = new Set<MaintenanceReportTabId>([
  'raportointi',
  'kylmaaine',
  'kylmaainePiiri',
  'lauhdutuspiiri',
  'nestelauhduttimet',
  'jaahdytysvesi',
  'vapaajahdytys',
  'huomiot',
  'huoltotiedot',
]);

export function maintenanceTabUsesDialogLauncher(tabId: string): tabId is MaintenanceReportTabId {
  return MAINTENANCE_DIALOG_LAUNCHER_TABS.has(tabId as MaintenanceReportTabId);
}
