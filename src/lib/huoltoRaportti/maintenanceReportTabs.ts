import { huoltoTiedotSectionTitle, kylmaaineChargeTitle, kylmaainePiiriSectionTitle, hoyrystinSectionTitle, lauhdutinSectionTitle, konvektoritSectionTitle, huomiotSectionTitle, jaahdytysvesiSectionTitle, nestelauhduttimetSectionTitle, lauhdutuspiiriSectionTitle } from './sectionTitles';

export type MaintenanceReportTabId =
  | 'raportointi'
  | 'laitetiedot'
  | 'kylmaaine'
  | 'kylmaainePiiri'
  | 'hoyrystin'
  | 'lauhdutin'
  | 'lauhdutuspiiri'
  | 'nestelauhduttimet'
  | 'jaahdytysvesi'
  | 'vjOhjaus'
  | 'vapaajahdytys'
  | 'konvektorit'
  | 'lampopumppu'
  | 'mlp'
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
  isVj: boolean;
};

export function buildMaintenanceReportTabs(input: TabVisibilityInput): MaintenanceReportTabItem[] {
  const { laiteTyyppi } = input;
  const tabs: MaintenanceReportTabItem[] = [
    { id: 'raportointi', label: 'Raportointi ja asiakas' },
  ];

  tabs.push({
    id: 'laitetiedot',
    label: laiteTyyppi === 'konvektorit' ? 'Konvektoriverkosto' : 'Laitetiedot',
  });

  if (!laiteTyyppi) return tabs;

  if (input.selectedModules.kylmaainePiiri || laiteTyyppi === 'lämpöpumppu') {
    tabs.push({ id: 'kylmaaine', label: kylmaaineChargeTitle(laiteTyyppi) });
  }

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

  if (input.isVj) {
    tabs.push({ id: 'vjOhjaus', label: 'Ohjaus' });
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
    tabs.push({ id: 'mlp', label: 'MLP-piirit' });
  }

  tabs.push({ id: 'huomiot', label: huomiotSectionTitle(laiteTyyppi) });
  tabs.push({ id: 'huoltotiedot', label: huoltoTiedotSectionTitle(laiteTyyppi) });

  return tabs;
}

export function readMaintenanceReportActiveTab(viewKey: string): MaintenanceReportTabId | null {
  try {
    const raw = sessionStorage.getItem(`${viewKey}:activeTab`);
    if (!raw) return null;
    if (raw === 'laitetyyppi') return 'laitetiedot';
    if (raw === 'asiakas') return 'raportointi';
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
