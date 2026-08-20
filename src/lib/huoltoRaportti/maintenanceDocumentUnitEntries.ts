import { isChillerLikeDevice } from './deviceModuleLogic';
import {
  condenserInspectionStatus,
  entityInspectionStatus,
  type HuoltoInspectionStatus,
} from './huoltoInspectionStatus';
import type { MaintenanceTabCompletionState } from './maintenanceReportTabCompletion';
import type { MaintenanceReportTabItem } from './maintenanceReportTabs';
import type { HuoltoReportData } from './types';
import { getEvaporatorCircuitCount } from './evaporatorHelpers';

export type MaintenanceDocumentEntryKind = 'tab' | 'evaporatorUnit' | 'condenserUnit';

export type MaintenanceDocumentEntry = {
  key: string;
  kind: MaintenanceDocumentEntryKind;
  tabId: string;
  title: string;
  unitIndex?: number;
};

export function inspectionStatusToDocumentCompletion(
  status: HuoltoInspectionStatus,
): MaintenanceTabCompletionState {
  if (status === 'ok' || status === 'na') return 'ok';
  if (status === 'faulty') return 'attention';
  return 'incomplete';
}

export function buildMaintenanceDocumentEntries(
  tabs: MaintenanceReportTabItem[],
  form: HuoltoReportData,
): MaintenanceDocumentEntry[] {
  const entries: MaintenanceDocumentEntry[] = [];

  for (const tab of tabs) {
    if (tab.id === 'hoyrystin' && !isChillerLikeDevice(form.laiteTyyppi)) {
      const count = getEvaporatorCircuitCount(form);
      for (let index = 0; index < count; index += 1) {
        entries.push({
          key: `hoyrystin:${index}`,
          kind: 'evaporatorUnit',
          tabId: `hoyrystin:${index}`,
          title: count === 1 ? tab.label : `${tab.label} ${index + 1}`,
          unitIndex: index,
        });
      }
      continue;
    }

    if (tab.id === 'lauhdutin') {
      const count = Math.min(3, Math.max(1, parseInt(form.kylmaainePiireja, 10) || 1));
      for (let index = 0; index < count; index += 1) {
        entries.push({
          key: `lauhdutin:${index}`,
          kind: 'condenserUnit',
          tabId: `lauhdutin:${index}`,
          title: count === 1 ? tab.label : `${tab.label} ${index + 1}`,
          unitIndex: index,
        });
      }
      continue;
    }

    entries.push({
      key: tab.id,
      kind: 'tab',
      tabId: tab.id,
      title: tab.label,
    });
  }

  return entries;
}

export function documentEntryCompletion(
  entry: MaintenanceDocumentEntry,
  form: HuoltoReportData,
  tabCompletion?: Partial<Record<string, MaintenanceTabCompletionState>>,
): MaintenanceTabCompletionState | undefined {
  if (entry.kind === 'evaporatorUnit' && entry.unitIndex != null) {
    return inspectionStatusToDocumentCompletion(entityInspectionStatus(form.evaporatorData[entry.unitIndex]));
  }
  if (entry.kind === 'condenserUnit' && entry.unitIndex != null) {
    return inspectionStatusToDocumentCompletion(condenserInspectionStatus(form.condenserData[entry.unitIndex]));
  }
  return tabCompletion?.[entry.tabId];
}

export function documentNavTargetTabId(tabId: string, form: HuoltoReportData): string {
  if (tabId !== 'hoyrystin' && tabId !== 'lauhdutin') return tabId;
  if (tabId === 'hoyrystin' && !isChillerLikeDevice(form.laiteTyyppi)) {
    const count = getEvaporatorCircuitCount(form);
    return count > 0 ? 'hoyrystin:0' : tabId;
  }
  if (tabId === 'lauhdutin') {
    const count = Math.min(3, Math.max(1, parseInt(form.kylmaainePiireja, 10) || 1));
    return count > 0 ? 'lauhdutin:0' : tabId;
  }
  return tabId;
}

export function documentEntryUsesDialogLauncher(entry: MaintenanceDocumentEntry): boolean {
  if (entry.kind === 'evaporatorUnit' || entry.kind === 'condenserUnit') return true;
  return false;
}
