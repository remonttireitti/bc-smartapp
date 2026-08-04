import type { ModuleKey } from './constants';
import { isAirSourceHeatPump } from './deviceModuleLogic';
import type { MaintenanceReportTabId, MaintenanceReportTabItem } from './maintenanceReportTabs';
import { isCustomModuleTabId } from './customModuleTypes';
import type { HuoltoReportData } from './types';

export const PINNED_FIRST_TAB: MaintenanceReportTabId = 'raportointi';
export const PINNED_LAST_TABS: MaintenanceReportTabId[] = ['huomiot', 'huoltotiedot'];

export function isPinnedTab(tabId: MaintenanceReportTabId): boolean {
  if (isCustomModuleTabId(tabId)) return false;
  return tabId === PINNED_FIRST_TAB || PINNED_LAST_TABS.includes(tabId as typeof PINNED_LAST_TABS[number]);
}

export function tabIdToModuleKeys(tabId: MaintenanceReportTabId, laiteTyyppi: string): ModuleKey[] {
  if (isCustomModuleTabId(tabId)) return [];
  switch (tabId) {
    case 'kylmaaine':
    case 'kylmaainePiiri':
      return laiteTyyppi === 'lämpöpumppu' ? [] : ['kylmaainePiiri'];
    case 'hoyrystin':
      return ['hoyrystin'];
    case 'lauhdutin':
    case 'lauhdutuspiiri':
      return ['lauhdutin'];
    case 'nestelauhduttimet':
      return ['nestelauhduttimet'];
    case 'jaahdytysvesi':
      return ['vedenjajahdytyskone'];
    case 'vapaajahdytys':
      return ['vapaajahdytys'];
    case 'konvektorit':
      return ['konvektorit'];
    case 'lampopumppu':
      return isAirSourceHeatPump(laiteTyyppi)
        ? []
        : ['ulkoyksikko', 'sisayksikko', 'mittaukset'];
    case 'mlp':
      return ['mlpPiirit'];
    default:
      return [];
  }
}

export function applyMaintenanceTabCustomization(
  tabs: MaintenanceReportTabItem[],
  hiddenTabIds: MaintenanceReportTabId[] = [],
  moduleTabOrder: MaintenanceReportTabId[] = [],
): MaintenanceReportTabItem[] {
  const hidden = new Set(hiddenTabIds);
  const visible = tabs.filter((tab) => !hidden.has(tab.id));
  if (visible.length === 0) return tabs.filter((tab) => tab.id === PINNED_FIRST_TAB);

  const first = visible.find((tab) => tab.id === PINNED_FIRST_TAB);
  const last = PINNED_LAST_TABS
    .map((id) => visible.find((tab) => tab.id === id))
    .filter((tab): tab is MaintenanceReportTabItem => Boolean(tab));
  const middle = visible.filter(
    (tab) => tab.id !== PINNED_FIRST_TAB && !PINNED_LAST_TABS.includes(tab.id as typeof PINNED_LAST_TABS[number]),
  );

  const defaultIndex = new Map(tabs.map((tab, index) => [tab.id, index]));
  const orderIndex = new Map(moduleTabOrder.map((id, index) => [id, index]));

  middle.sort((a, b) => {
    const rank = (tabId: MaintenanceReportTabId) => {
      if (orderIndex.has(tabId)) return orderIndex.get(tabId)!;
      return 1000 + (defaultIndex.get(tabId) ?? 0);
    };
    return rank(a.id) - rank(b.id);
  });

  return [first, ...middle, ...last].filter((tab): tab is MaintenanceReportTabItem => Boolean(tab));
}

export function getHiddenMaintenanceTabs(
  defaultTabs: MaintenanceReportTabItem[],
  activeTabs: MaintenanceReportTabItem[],
): MaintenanceReportTabItem[] {
  const activeIds = new Set(activeTabs.map((tab) => tab.id));
  return defaultTabs.filter((tab) => !activeIds.has(tab.id) && !isPinnedTab(tab.id));
}

export function moveTabInOrder(
  order: MaintenanceReportTabId[],
  tabId: MaintenanceReportTabId,
  direction: 'up' | 'down',
  middleTabIds: MaintenanceReportTabId[],
): MaintenanceReportTabId[] {
  const baseOrder = order.length > 0 ? [...order] : [...middleTabIds];
  for (const id of middleTabIds) {
    if (!baseOrder.includes(id)) baseOrder.push(id);
  }
  const filtered = baseOrder.filter((id) => middleTabIds.includes(id));
  const index = filtered.indexOf(tabId);
  if (index < 0) return filtered;
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= filtered.length) return filtered;
  const next = [...filtered];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function setMaintenanceTabVisible(
  form: HuoltoReportData,
  tab: MaintenanceReportTabItem,
  visible: boolean,
): Partial<HuoltoReportData> {
  const hidden = new Set(form.hiddenTabIds ?? []);
  if (visible) {
    hidden.delete(tab.id);
  } else if (!isPinnedTab(tab.id)) {
    hidden.add(tab.id);
  }

  const patch: Partial<HuoltoReportData> = {
    hiddenTabIds: [...hidden],
  };

  const moduleKeys = tabIdToModuleKeys(tab.id, form.laiteTyyppi);
  if (moduleKeys.length === 0) return patch;

  const selectedModules = { ...form.selectedModules };
  for (const key of moduleKeys) {
    selectedModules[key] = visible;
  }
  patch.selectedModules = selectedModules;
  return patch;
}

export function normalizeHiddenTabIds(
  hiddenTabIds: MaintenanceReportTabId[] | undefined,
  defaultTabs: MaintenanceReportTabItem[],
): MaintenanceReportTabId[] {
  const valid = new Set(defaultTabs.map((tab) => tab.id));
  return (hiddenTabIds ?? []).filter((id) => valid.has(id) && !isPinnedTab(id));
}

export function normalizeModuleTabOrder(
  moduleTabOrder: MaintenanceReportTabId[] | undefined,
  defaultTabs: MaintenanceReportTabItem[],
): MaintenanceReportTabId[] {
  const validMiddle = new Set(
    defaultTabs
      .map((tab) => tab.id)
      .filter((id) => !isPinnedTab(id)),
  );
  return (moduleTabOrder ?? []).filter((id) => validMiddle.has(id));
}
