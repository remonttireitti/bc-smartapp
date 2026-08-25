import type { MaintenanceReportTabId } from './maintenanceReportTabs';

/** Dokumenttinäkymässä otsikon klikkaus avaa popup-dialogin (kuten huomiot-moduuli). */
export const MAINTENANCE_DIALOG_LAUNCHER_TABS = new Set<MaintenanceReportTabId>([
  'raportointi',
  'kylmaaine',
  'lauhdutuspiiri',
  'nestelauhduttimet',
  'jaahdytysvesi',
  'vapaajahdytys',
  'lampopumppu',
  'huomiot',
  'huoltotiedot',
  'tiiveyskoe',
  'tyhjiointi',
]);

export function maintenanceTabUsesDialogLauncher(tabId: string): tabId is MaintenanceReportTabId {
  return MAINTENANCE_DIALOG_LAUNCHER_TABS.has(tabId as MaintenanceReportTabId);
}
