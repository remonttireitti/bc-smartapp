import type { CustomReportModule } from './customModuleTypes';

export type BuiltInMaintenanceReportTabId =
  | 'raportointi'
  | 'kylmaaine'
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

export type MaintenanceReportTabId = BuiltInMaintenanceReportTabId | `custom:${string}`;

export type MaintenanceReportTabItem = {
  id: MaintenanceReportTabId;
  label: string;
};

export type MaintenanceReportTabBuildInput = {
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
  customModules?: CustomReportModule[];
  hiddenTabIds?: MaintenanceReportTabId[];
  moduleTabOrder?: MaintenanceReportTabId[];
};
