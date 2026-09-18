import { lampopumppuSubmodules } from './deviceModuleLogic';
import type { HuoltoReportData } from './types';

export type LampopumppuDocumentUnitId = 'ulkoyksikko' | 'sisayksikko' | 'mittaukset';

export type LampopumppuDocumentUnit = {
  id: LampopumppuDocumentUnitId;
  tabId: string;
  title: string;
  themeKey: 'ulkoyksikko' | 'sisayksikko' | 'mittaukset';
};

export function buildLampopumppuDocumentUnits(form: HuoltoReportData): LampopumppuDocumentUnit[] {
  const parts = lampopumppuSubmodules(form.laiteTyyppi, form.selectedModules);
  const units: LampopumppuDocumentUnit[] = [];

  if (parts.ulkoyksikko) {
    units.push({
      id: 'ulkoyksikko',
      tabId: 'lampopumppu:ulkoyksikko',
      title: 'Ulkoyksikkö',
      themeKey: 'ulkoyksikko',
    });
  }
  if (parts.sisayksikko) {
    units.push({
      id: 'sisayksikko',
      tabId: 'lampopumppu:sisayksikko',
      title: 'Sisäyksiköt',
      themeKey: 'sisayksikko',
    });
  }
  if (parts.mittaukset) {
    units.push({
      id: 'mittaukset',
      tabId: 'lampopumppu:mittaukset',
      title: 'Mittaukset',
      themeKey: 'mittaukset',
    });
  }

  return units;
}

export function lampopumppuDocumentUnitIdFromTabId(tabId: string): LampopumppuDocumentUnitId | null {
  if (tabId === 'lampopumppu:ulkoyksikko') return 'ulkoyksikko';
  if (tabId === 'lampopumppu:sisayksikko') return 'sisayksikko';
  if (tabId === 'lampopumppu:mittaukset') return 'mittaukset';
  return null;
}
