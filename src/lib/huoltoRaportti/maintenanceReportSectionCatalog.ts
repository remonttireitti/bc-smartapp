import {
  energiatehokkuusSectionTitle,
  hoyrystinSectionTitle,
  huoltoTiedotSectionTitle,
  huomiotSectionTitle,
  jaahdytysvesiSectionTitle,
  kiinteistoPiiriSectionTitle,
  konvektoritSectionTitle,
  kylmaaineChargeTitle,
  kylmaainePiiriSectionTitle,
  lauhdutinSectionTitle,
  lauhdutuspiiriSectionTitle,
  nestelauhduttimetSectionTitle,
  raportointiLaitetiedotTabTitle,
} from './sectionTitles';
import { mlpSectionTitle } from './deviceModuleLogic';
import type { ModuleThemeKey } from './moduleThemes';
import type {
  BuiltInMaintenanceReportTabId,
  MaintenanceReportTabBuildInput,
} from './maintenanceReportTabTypes';

export type MaintenanceReportSectionDefinition = {
  id: BuiltInMaintenanceReportTabId;
  themeKey: ModuleThemeKey;
  /** Tulosteen HTML-lohkot (printHtml.ts) — sama järjestys kuin lomake. */
  printBlocks: readonly string[];
  label: (laiteTyyppi: string) => string;
  isVisible: (input: MaintenanceReportTabBuildInput) => boolean;
  hasPrintSettings?: boolean;
};

const RAPORTOINTI_THEME = 'kylmaaineCharge' as const;

function showKylmaaineCharge(input: MaintenanceReportTabBuildInput): boolean {
  return Boolean(input.laiteTyyppi)
    && (input.selectedModules.kylmaainePiiri || input.laiteTyyppi === 'lämpöpumppu');
}

/** Lomake + tuloste: yhteinen osiojärjestys ja metadata. */
export const MAINTENANCE_REPORT_BUILTIN_SECTIONS: readonly MaintenanceReportSectionDefinition[] = [
  {
    id: 'raportointi',
    themeKey: RAPORTOINTI_THEME,
    printBlocks: ['header', 'company', 'customer', 'device'],
    label: (laiteTyyppi) => raportointiLaitetiedotTabTitle(laiteTyyppi, false),
    isVisible: () => true,
  },
  {
    id: 'kylmaaine',
    themeKey: 'kylmaaineCharge',
    printBlocks: ['refrigerantCharge'],
    label: kylmaaineChargeTitle,
    isVisible: (input) => showKylmaaineCharge(input),
  },
  {
    id: 'kylmaainePiiri',
    themeKey: 'kylmaainePiiri',
    printBlocks: ['circuits', 'circuitWarnings'],
    label: kylmaainePiiriSectionTitle,
    isVisible: (input) => Boolean(input.selectedModules.kylmaainePiiri),
    hasPrintSettings: true,
  },
  {
    id: 'hoyrystin',
    themeKey: 'hoyrystin',
    printBlocks: ['evaporators'],
    label: hoyrystinSectionTitle,
    isVisible: (input) => input.showEvaporatorSection,
  },
  {
    id: 'lauhdutin',
    themeKey: 'lauhdutin',
    printBlocks: ['condensers'],
    label: lauhdutinSectionTitle,
    isVisible: (input) => input.showCondenserSection,
  },
  {
    id: 'lauhdutuspiiri',
    themeKey: 'vedenjajahdytyskone',
    printBlocks: ['lauhdutuspiiri'],
    label: lauhdutuspiiriSectionTitle,
    isVisible: (input) => input.showLauhdutuspiiriSection,
  },
  {
    id: 'nestelauhduttimet',
    themeKey: 'nestelauhduttimet',
    printBlocks: ['nestelauhduttimet'],
    label: nestelauhduttimetSectionTitle,
    isVisible: (input) => input.showNestelauhduttimetSection,
  },
  {
    id: 'jaahdytysvesi',
    themeKey: 'vedenjajahdytyskone',
    printBlocks: ['jaahdytysvesi'],
    label: jaahdytysvesiSectionTitle,
    isVisible: (input) => input.showJaahdytysvesiSection,
  },
  {
    id: 'vapaajahdytys',
    themeKey: 'vapaajahdytys',
    printBlocks: ['vapaajahdytys'],
    label: () => 'Vapaajäähdytys',
    isVisible: (input) => input.showVapaajahdytysSection,
  },
  {
    id: 'konvektorit',
    themeKey: 'konvektorit',
    printBlocks: ['konvektorit'],
    label: konvektoritSectionTitle,
    isVisible: (input) => input.showKonvektoritSection,
  },
  {
    id: 'lampopumppu',
    themeKey: 'ulkoyksikko',
    printBlocks: ['lampopumppu'],
    label: () => 'Lämpöpumppu',
    isVisible: (input) => input.showLampopumppuSection,
  },
  {
    id: 'mlp',
    themeKey: 'mlpPiirit',
    printBlocks: ['mlp'],
    label: mlpSectionTitle,
    isVisible: (input) => input.showMlpSection,
  },
  {
    id: 'kiinteistoJahdytys',
    themeKey: 'mlpKeruupiiri',
    printBlocks: ['mlpKiinteisto'],
    label: kiinteistoPiiriSectionTitle,
    isVisible: (input) => input.showChillerKiinteistoSection,
  },
  {
    id: 'energia',
    themeKey: 'mlpEnergia',
    printBlocks: ['chillerEnergy', 'mlpFull'],
    label: energiatehokkuusSectionTitle,
    isVisible: (input) => input.showChillerEnergySection,
  },
  {
    id: 'huomiot',
    themeKey: 'huomiot',
    printBlocks: ['customModules', 'huomiot'],
    label: huomiotSectionTitle,
    isVisible: (input) => Boolean(input.laiteTyyppi),
  },
  {
    id: 'huoltotiedot',
    themeKey: 'tiiveyskoe',
    printBlocks: ['status', 'tiiveyskoe', 'tyhjiointi', 'footer'],
    label: huoltoTiedotSectionTitle,
    isVisible: (input) => Boolean(input.laiteTyyppi),
    hasPrintSettings: true,
  },
] as const;

export function findMaintenanceReportSection(
  tabId: BuiltInMaintenanceReportTabId,
): MaintenanceReportSectionDefinition | undefined {
  return MAINTENANCE_REPORT_BUILTIN_SECTIONS.find((section) => section.id === tabId);
}

export function maintenanceSectionHasPrintSettings(
  tabId: string,
  form: { laiteTyyppi?: string; selectedModules: Record<string, boolean> },
): boolean {
  if (tabId === 'kylmaainePiiri') {
    return Boolean(form.selectedModules.kylmaainePiiri);
  }
  const section = findMaintenanceReportSection(tabId as BuiltInMaintenanceReportTabId);
  return section?.hasPrintSettings === true && Boolean(form.laiteTyyppi);
}

export function maintenanceSectionThemeKey(tabId: string): ModuleThemeKey | null {
  if (tabId === 'raportointi') return RAPORTOINTI_THEME;
  const section = findMaintenanceReportSection(tabId as BuiltInMaintenanceReportTabId);
  return section?.themeKey ?? null;
}

/** Tulosteen body-lohkojen järjestys (printHtml.ts generateMaintenanceReportHtml). */
export const MAINTENANCE_REPORT_PRINT_BODY_ORDER = [
  'header',
  'company',
  'customer',
  'device',
  'refrigerantCharge',
  'status',
  'lampopumppu',
  'circuits',
  'circuitWarnings',
  'evaporators',
  'condensers',
  'lauhdutuspiiri',
  'nestelauhduttimet',
  'jaahdytysvesi',
  'vapaajahdytys',
  'chillerEnergy',
  'mlpFull',
  'konvektorit',
  'tiiveyskoe',
  'tyhjiointi',
  'customModules',
  'huomiot',
  'footer',
] as const;
