import {
  isChillerLikeDevice,
  showChillerPropertySubsections,
  showMlpKeruupiiriSubsection,
  showMlpLatauspiiriSubsection,
  showMlpMaalampoSubsections,
} from './deviceModuleLogic';
import {
  energiatehokkuusSectionTitle,
  kiinteistoPiiriSectionTitle,
  mlpJaahdytyspiiriSectionTitle,
  mlpKeruupiiriSectionTitle,
} from './sectionTitles';
import type { HuoltoReportData, LauhdutinType } from './types';

export type MlpDocumentUnitId =
  | 'keruupiiri'
  | 'jaahdytyspiiri'
  | 'latauspiiri'
  | 'kayttovesi'
  | 'lampopiirit'
  | 'energia';

export type MlpDocumentUnit = {
  id: MlpDocumentUnitId;
  tabId: string;
  title: string;
  themeKey:
    | 'mlpKeruupiiri'
    | 'mlpJaahdytyspiiri'
    | 'mlpLatauspiiri'
    | 'mlpKayttovesi'
    | 'mlpLampopiirit'
    | 'mlpEnergia';
};

function condenserType(form: HuoltoReportData): LauhdutinType | '' {
  return (form.lauhdutinTyyppiLaite ?? form.condenserData[0]?.tyyppi ?? '') as LauhdutinType | '';
}

export function buildMlpDocumentUnits(form: HuoltoReportData, tabId: string): MlpDocumentUnit[] {
  if (!form.mlpData) return [];

  const laiteTyyppi = form.laiteTyyppi;
  const showMaalampoOnly = showMlpMaalampoSubsections(laiteTyyppi);
  const showKeruupiiri = showMlpKeruupiiriSubsection(laiteTyyppi);
  const showChillerParts = showChillerPropertySubsections(laiteTyyppi);
  const showLatauspiiri = showMlpLatauspiiriSubsection(laiteTyyppi, condenserType(form));
  const showHeatPumpCircuits = !isChillerLikeDevice(laiteTyyppi);
  const showKiinteistoBlock = showHeatPumpCircuits || showChillerParts;
  const showEnergyBlock = showMaalampoOnly || showChillerParts;

  const units: MlpDocumentUnit[] = [];

  if (tabId === 'mlp') {
    if (showKeruupiiri) {
      units.push({
        id: 'keruupiiri',
        tabId: 'mlp:keruupiiri',
        title: mlpKeruupiiriSectionTitle(laiteTyyppi),
        themeKey: 'mlpKeruupiiri',
      });
    }
    if (showMaalampoOnly) {
      units.push({
        id: 'jaahdytyspiiri',
        tabId: 'mlp:jaahdytyspiiri',
        title: mlpJaahdytyspiiriSectionTitle(laiteTyyppi),
        themeKey: 'mlpJaahdytyspiiri',
      });
    }
    if (showLatauspiiri && showHeatPumpCircuits) {
      units.push({
        id: 'latauspiiri',
        tabId: 'mlp:latauspiiri',
        title: 'Latauspiiri',
        themeKey: 'mlpLatauspiiri',
      });
    }
    if (showHeatPumpCircuits) {
      units.push({
        id: 'kayttovesi',
        tabId: 'mlp:kayttovesi',
        title: 'Käyttöveden lämmitys',
        themeKey: 'mlpKayttovesi',
      });
    }
    if (showKiinteistoBlock) {
      units.push({
        id: 'lampopiirit',
        tabId: 'mlp:lampopiirit',
        title: kiinteistoPiiriSectionTitle(laiteTyyppi),
        themeKey: 'mlpLampopiirit',
      });
    }
    if (showEnergyBlock) {
      units.push({
        id: 'energia',
        tabId: 'mlp:energia',
        title: energiatehokkuusSectionTitle(laiteTyyppi),
        themeKey: 'mlpEnergia',
      });
    }
    return units;
  }

  if (tabId === 'kiinteistoJahdytys' && showKiinteistoBlock) {
    units.push({
      id: 'lampopiirit',
      tabId: 'mlp:lampopiirit',
      title: kiinteistoPiiriSectionTitle(laiteTyyppi),
      themeKey: 'mlpLampopiirit',
    });
    return units;
  }

  if (tabId === 'energia' && showEnergyBlock) {
    units.push({
      id: 'energia',
      tabId: 'mlp:energia',
      title: energiatehokkuusSectionTitle(laiteTyyppi),
      themeKey: 'mlpEnergia',
    });
  }

  return units;
}

export function mlpDocumentUnitIdFromTabId(tabId: string): MlpDocumentUnitId | null {
  if (!tabId.startsWith('mlp:')) return null;
  return tabId.slice('mlp:'.length) as MlpDocumentUnitId;
}
