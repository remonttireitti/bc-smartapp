import type { MaintenanceTabCompletionState } from './maintenanceReportTabCompletion';
import type { HuoltoReportData } from './types';

export function isMaintenanceModuleVisited(form: HuoltoReportData, tabId: string): boolean {
  return (form.visitedModuleIds ?? []).includes(tabId);
}

export function markMaintenanceModuleVisited(
  visitedModuleIds: string[] | undefined,
  tabId: string,
): string[] {
  const ids = visitedModuleIds ?? [];
  if (ids.includes(tabId)) return ids;
  return [...ids, tabId];
}

export type ModuleTilePresentation = {
  completion: MaintenanceTabCompletionState;
  visited: boolean;
  subtitle: string;
  showCheck: boolean;
  showAttention: boolean;
};

export function resolveModuleTilePresentation(
  tabId: string,
  form: HuoltoReportData,
  dataCompletion: MaintenanceTabCompletionState | undefined,
): ModuleTilePresentation {
  const visited = isMaintenanceModuleVisited(form, tabId);
  const completion = dataCompletion ?? 'incomplete';

  if (!visited) {
    return {
      completion: 'incomplete',
      visited: false,
      subtitle: 'Täyttämättä',
      showCheck: false,
      showAttention: false,
    };
  }

  if (completion === 'ok') {
    return {
      completion: 'ok',
      visited: true,
      subtitle: 'Valmis',
      showCheck: true,
      showAttention: false,
    };
  }

  if (completion === 'attention') {
    return {
      completion: 'attention',
      visited: true,
      subtitle: 'Tarkastettu, huomioita',
      showCheck: false,
      showAttention: true,
    };
  }

  return {
    completion: 'incomplete',
    visited: true,
    subtitle: 'Kesken',
    showCheck: false,
    showAttention: false,
  };
}
