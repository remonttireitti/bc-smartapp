import {
  BUILDING_TYPE_OPTIONS,
  IILP_PURPOSE_LABELS,
  QUOTE_PROJECT_TYPE_LABELS,
  QUOTE_REGION_LABELS,
  isPumpQuoteType,
} from './constants';
import { createEmptyQuoteRequestData } from './defaults';
import type { QuoteEditSection, QuoteRequestData } from './types';

export type UnreviewedSiteDefault = {
  key: string;
  label: string;
};

function buildingTypeLabel(value: string): string {
  return BUILDING_TYPE_OPTIONS.find((opt) => opt.value === value)?.label ?? value;
}

export function listUnreviewedSiteDefaults(data: QuoteRequestData): UnreviewedSiteDefault[] {
  if (!isPumpQuoteType(data.type)) return [];

  const defaults = createEmptyQuoteRequestData(data.type);
  const unchecked: UnreviewedSiteDefault[] = [];

  if (data.buildingType === defaults.buildingType) {
    unchecked.push({
      key: 'buildingType',
      label: `Kiinteistön tyyppi (${buildingTypeLabel(defaults.buildingType)})`,
    });
  }
  if (data.region === defaults.region) {
    unchecked.push({
      key: 'region',
      label: `Sijainti (${QUOTE_REGION_LABELS[defaults.region]})`,
    });
  }
  if (Number(data.heatedArea) === Number(defaults.heatedArea)) {
    unchecked.push({
      key: 'heatedArea',
      label:
        data.type === 'ilma-ilma'
          ? `Vaikutusalue (${defaults.heatedArea} m²)`
          : `Lämmitettävä pinta-ala (${defaults.heatedArea} m²)`,
    });
  }

  if (data.type === 'ilma-ilma') {
    if (Number(data.roomHeight) === Number(defaults.roomHeight)) {
      unchecked.push({
        key: 'roomHeight',
        label: `Huonekorkeus (${defaults.roomHeight} m)`,
      });
    }
    if (
      data.buildingType !== 'kerrostalo' &&
      data.iilpPurpose === defaults.iilpPurpose
    ) {
      unchecked.push({
        key: 'iilpPurpose',
        label: `Käyttötarkoitus (${IILP_PURPOSE_LABELS[defaults.iilpPurpose]})`,
      });
    }
  }

  if (data.type === 'vesi-ilma') {
    if (Number(data.buildingYear) === Number(defaults.buildingYear)) {
      unchecked.push({
        key: 'buildingYear',
        label: `Rakennusvuosi (${defaults.buildingYear})`,
      });
    }
    if (data.projectType === defaults.projectType) {
      unchecked.push({
        key: 'projectType',
        label: `Projektin tyyppi (${QUOTE_PROJECT_TYPE_LABELS[defaults.projectType]})`,
      });
    }
  }

  return unchecked;
}

export function siteDefaultsReviewSection(unchecked: UnreviewedSiteDefault[]): QuoteEditSection {
  const kohdeKeys = new Set([
    'heatedArea',
    'roomHeight',
    'iilpPurpose',
    'buildingYear',
    'projectType',
  ]);
  if (unchecked.some((item) => kohdeKeys.has(item.key))) return 'kohde';
  return 'asiakas';
}

/** Palauttaa true jos tallennus voi jatkua. */
export function confirmUnreviewedSiteDefaults(data: QuoteRequestData): boolean {
  const unchecked = listUnreviewedSiteDefaults(data);
  if (unchecked.length === 0) return true;

  const list = unchecked.map((item) => `• ${item.label}`).join('\n');
  return window.confirm(
    `Seuraavat kohdetiedot ovat vielä oletusarvoja:\n\n${list}\n\nTarkista tiedot ennen tallennusta.\n\nTallenna silti?`,
  );
}
