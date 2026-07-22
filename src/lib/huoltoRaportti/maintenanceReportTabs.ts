import { huoltoTiedotSectionTitle, kylmaainePiiriSectionTitle, hoyrystinSectionTitle, lauhdutinSectionTitle, konvektoritSectionTitle, huomiotSectionTitle, jaahdytysvesiSectionTitle, nestelauhduttimetSectionTitle, lauhdutuspiiriSectionTitle, kiinteistoPiiriSectionTitle, energiatehokkuusSectionTitle, raportointiLaitetiedotTabTitle } from './sectionTitles';
import { mlpSectionTitle } from './deviceModuleLogic';

export type MaintenanceReportTabId =
  | 'raportointi'
  | 'kylmaainePiiri'
  | 'hoyrystin'
  | 'lauhdutin'
  | 'lauhdutuspiiri'
  | 'nestelauhduttimet'
  | 'jaahdytysvesi'
  | 'vapaajahdytys'
  | 'konvektorit'
  | 'lampopumppu'
  | 'mlp'
  | 'kiinteistoJahdytys'
  | 'energia'
  | 'huomiot'
  | 'huoltotiedot';

export type MaintenanceReportTabItem = {
  id: MaintenanceReportTabId;
  label: string;
};

type TabVisibilityInput = {
  laiteTyyppi: string;
  selectedModules: Record<string, boolean>;
  showEvaporatorSection: boolean;
  showCondenserSection: boolean;
  showLauhdutuspiiriSection: boolean;
  showNestelauhduttimetSection: boolean;
  showJaahdytysvesiSection: boolean;
  showVapaajahdytysSection: boolean;
  showKonvektoritSection: boolean;
  showLampopumppuSection: boolean;
  showMlpSection: boolean;
  showChillerKiinteistoSection: boolean;
  showChillerEnergySection: boolean;
};

export function buildMaintenanceReportTabs(input: TabVisibilityInput): MaintenanceReportTabItem[] {
  const { laiteTyyppi } = input;
  const tabs: MaintenanceReportTabItem[] = [];

  const showKylmaaineCharge =
    Boolean(laiteTyyppi)
    && (input.selectedModules.kylmaainePiiri || laiteTyyppi === 'lämpöpumppu');

  tabs.push({
    id: 'raportointi',
    label: raportointiLaitetiedotTabTitle(laiteTyyppi, showKylmaaineCharge),
  });

  if (!laiteTyyppi) return tabs;

  if (input.selectedModules.kylmaainePiiri) {
    tabs.push({ id: 'kylmaainePiiri', label: kylmaainePiiriSectionTitle(laiteTyyppi) });
  }

  if (input.showEvaporatorSection) {
    tabs.push({ id: 'hoyrystin', label: hoyrystinSectionTitle(laiteTyyppi) });
  }

  if (input.showCondenserSection) {
    tabs.push({ id: 'lauhdutin', label: lauhdutinSectionTitle(laiteTyyppi) });
  }

  if (input.showLauhdutuspiiriSection) {
    tabs.push({ id: 'lauhdutuspiiri', label: lauhdutuspiiriSectionTitle(laiteTyyppi) });
  }

  if (input.showNestelauhduttimetSection) {
    tabs.push({ id: 'nestelauhduttimet', label: nestelauhduttimetSectionTitle(laiteTyyppi) });
  }

  if (input.showJaahdytysvesiSection) {
    tabs.push({ id: 'jaahdytysvesi', label: jaahdytysvesiSectionTitle(laiteTyyppi) });
  }

  if (input.showVapaajahdytysSection) {
    tabs.push({ id: 'vapaajahdytys', label: 'Vapaajäähdytys' });
  }

  if (input.showKonvektoritSection) {
    tabs.push({ id: 'konvektorit', label: konvektoritSectionTitle(laiteTyyppi) });
  }

  if (input.showLampopumppuSection) {
    tabs.push({ id: 'lampopumppu', label: 'Lämpöpumppu' });
  }

  if (input.showMlpSection) {
    tabs.push({ id: 'mlp', label: mlpSectionTitle(laiteTyyppi) });
  }

  if (input.showChillerKiinteistoSection) {
    tabs.push({ id: 'kiinteistoJahdytys', label: kiinteistoPiiriSectionTitle(laiteTyyppi) });
  }

  if (input.showChillerEnergySection) {
    tabs.push({ id: 'energia', label: energiatehokkuusSectionTitle(laiteTyyppi) });
  }

  tabs.push({ id: 'huomiot', label: huomiotSectionTitle(laiteTyyppi) });
  tabs.push({ id: 'huoltotiedot', label: huoltoTiedotSectionTitle(laiteTyyppi) });

  return tabs;
}

export function readMaintenanceReportActiveTab(viewKey: string): MaintenanceReportTabId | null {
  try {
    const raw = sessionStorage.getItem(`${viewKey}:activeTab`);
    if (!raw) return null;
    if (
      raw === 'laitetyyppi'
      || raw === 'kylmaaine'
      || raw === 'vjOhjaus'
      || raw === 'laitetiedot'
      || raw === 'asiakas'
    ) {
      return 'raportointi';
    }
    return raw as MaintenanceReportTabId;
  } catch {
    return null;
  }
}

export function persistMaintenanceReportActiveTab(viewKey: string, tabId: MaintenanceReportTabId) {
  try {
    sessionStorage.setItem(`${viewKey}:activeTab`, tabId);
  } catch {
    /* ignore */
  }
}
