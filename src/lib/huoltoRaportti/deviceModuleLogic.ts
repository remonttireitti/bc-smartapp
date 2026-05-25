import type { LauhdutinType } from './types';
import { moduleSelectionOptions, type DeviceTypeValue, type ModuleKey } from './constants';

export const ALWAYS_OPTIONAL_MODULES: ModuleKey[] = ['tiiveyskoe', 'tyhjiointi'];

export function emptyModuleSelection(): Record<ModuleKey, boolean> {
  return Object.fromEntries(moduleSelectionOptions.map((o) => [o.key, false])) as Record<ModuleKey, boolean>;
}

export function usesManualModuleMenu(deviceType: string): boolean {
  return !deviceType || deviceType === 'muu';
}

export function isChillerLikeDevice(deviceType: string): boolean {
  return deviceType === 'vedenjäähdytyskone' || deviceType === 'vakioilmastointtikone';
}

/** Vedenjäähdytyskone + elektroninen EEV: ei erillistä magneettiventtiiliä. */
export function refrigerantCircuitHasMagnetValve(
  laiteTyyppi: string,
  paisuntaventtiiliTyyppi: string | undefined,
): boolean {
  if (laiteTyyppi === 'vedenjäähdytyskone' && paisuntaventtiiliTyyppi === 'ELEKTRONINEN') {
    return false;
  }
  return true;
}

export function stripMagnetValveFromCircuit<T extends {
  paisuntaventtiiliTyyppi?: string;
  magneettiventtiiliTestattu?: boolean;
  magneettiventtiiliValmistaja?: string;
  magneettiventtiiliMalli?: string;
  magneettiventtiiliSamaKuinPiiri1?: boolean;
}>(laiteTyyppi: string, circuit: T): T {
  if (refrigerantCircuitHasMagnetValve(laiteTyyppi, circuit.paisuntaventtiiliTyyppi)) {
    return circuit;
  }
  return {
    ...circuit,
    magneettiventtiiliTestattu: false,
    magneettiventtiiliValmistaja: '',
    magneettiventtiiliMalli: '',
    magneettiventtiiliSamaKuinPiiri1: false,
  };
}

export function isGroundSourceHeatPump(deviceType: string): boolean {
  return deviceType === 'mlp';
}

export function isWaterAirHeatPump(deviceType: string): boolean {
  return deviceType === 'vesiilmalampopumppu';
}

export function isHeatPumpCircuitsDevice(deviceType: string): boolean {
  return isGroundSourceHeatPump(deviceType) || isWaterAirHeatPump(deviceType);
}

export function isAirSourceHeatPump(deviceType: string): boolean {
  return deviceType === 'lämpöpumppu';
}

export function isAirCondenserType(tyyppi: LauhdutinType | '' | undefined): boolean {
  return tyyppi === 'erillinen_ilma' || tyyppi === 'koneseen_integroitu';
}

export function isLiquidCondenserType(tyyppi: LauhdutinType | '' | undefined): boolean {
  return tyyppi === 'nestekiertoinen';
}

export function defaultCondenserTypeForDevice(deviceType: string): LauhdutinType | '' {
  if (isChillerLikeDevice(deviceType)) return 'nestekiertoinen';
  if (deviceType === 'pakastin' || deviceType === 'kylmäkoneikko') return 'erillinen_ilma';
  return '';
}

export function getActiveModuleLabels(
  modules: Record<ModuleKey, boolean>,
  deviceType: string,
): string[] {
  const labels: Record<ModuleKey, string> = Object.fromEntries(
    moduleSelectionOptions.map((o) => [o.key, o.label]),
  ) as Record<ModuleKey, string>;

  if (isGroundSourceHeatPump(deviceType)) {
    labels.mlpPiirit = 'Maalämpöpumpun piirit';
  }
  if (isWaterAirHeatPump(deviceType)) {
    labels.mlpPiirit = 'Vesi-ilmalämpöpumpun piirit';
    labels.ulkoyksikko = 'Ulkoyksikkö (lähte side)';
  }
  if (isChillerLikeDevice(deviceType)) {
    labels.vedenjajahdytyskone = 'Jäähdytysveden piiri';
  }

  return (Object.keys(modules) as ModuleKey[])
    .filter((key) => modules[key] && !ALWAYS_OPTIONAL_MODULES.includes(key))
    .map((key) => labels[key] ?? key);
}

export function resolveAutoModules(input: {
  laiteTyyppi: string;
  lauhdutinTyyppiLaite?: LauhdutinType | '';
  vapaajahdytysKaytossa?: boolean;
  manualModules?: Record<ModuleKey, boolean>;
}): Record<ModuleKey, boolean> {
  const modules = emptyModuleSelection();
  const deviceType = input.laiteTyyppi;
  const condenserType = input.lauhdutinTyyppiLaite ?? '';
  const manual = input.manualModules ?? modules;

  modules.tiiveyskoe = manual.tiiveyskoe ?? false;
  modules.tyhjiointi = manual.tyhjiointi ?? false;

  if (usesManualModuleMenu(deviceType)) {
    return {
      ...manual,
      tiiveyskoe: modules.tiiveyskoe,
      tyhjiointi: modules.tyhjiointi,
    };
  }

  switch (deviceType as DeviceTypeValue) {
    case 'vedenjäähdytyskone':
    case 'vakioilmastointtikone':
      modules.kylmaainePiiri = true;
      modules.hoyrystin = true;
      modules.vedenjajahdytyskone = true;
      if (isLiquidCondenserType(condenserType)) {
        modules.nestelauhduttimet = true;
      }
      if (isAirCondenserType(condenserType)) {
        modules.lauhdutin = true;
      }
      if (input.vapaajahdytysKaytossa) {
        modules.vapaajahdytys = true;
      }
      break;
    case 'pakastin':
    case 'kylmäkoneikko':
      modules.kylmaainePiiri = true;
      modules.hoyrystin = true;
      modules.lauhdutin = true;
      break;
    case 'lämpöpumppu':
      modules.ulkoyksikko = true;
      modules.sisayksikko = true;
      modules.mittaukset = true;
      break;
    case 'mlp':
    case 'vesiilmalampopumppu':
      modules.kylmaainePiiri = true;
      modules.mlpPiirit = true;
      if (isWaterAirHeatPump(deviceType)) {
        modules.ulkoyksikko = true;
      }
      break;
    case 'konvektorit':
      modules.konvektorit = true;
      break;
    default:
      break;
  }

  modules.tiiveyskoe = manual.tiiveyskoe ?? false;
  modules.tyhjiointi = manual.tyhjiointi ?? false;
  return modules;
}

export function getManualModuleOptions(deviceType: string) {
  if (!usesManualModuleMenu(deviceType)) {
    return moduleSelectionOptions.filter((o) => ALWAYS_OPTIONAL_MODULES.includes(o.key));
  }
  return moduleSelectionOptions.filter((o) => o.key !== 'mlpPiirit' || deviceType === 'muu');
}

export function moduleIsActive(modules: Record<ModuleKey, boolean>, key: ModuleKey): boolean {
  return Boolean(modules[key]);
}

export function showEvaporatorModules(
  _deviceType: string,
  modules: Record<ModuleKey, boolean>,
): boolean {
  return moduleIsActive(modules, 'hoyrystin');
}

export function showEvaporatorInCircuit(
  deviceType: string,
  modules: Record<ModuleKey, boolean>,
): boolean {
  return isChillerLikeDevice(deviceType) && showEvaporatorModules(deviceType, modules);
}

/** VJ/VAK: yksi höyrystin kaikille piireille (oletus), ei toisteta jokaisessa piirissä. */
export function isSharedEvaporatorAcrossCircuits(
  deviceType: string,
  shared?: boolean,
): boolean {
  return isChillerLikeDevice(deviceType) && (shared ?? true);
}

export function showCondenserModules(
  deviceType: string,
  modules: Record<ModuleKey, boolean>,
): boolean {
  if (isChillerLikeDevice(deviceType)) return false;
  return moduleIsActive(modules, 'lauhdutin');
}

export function showChillerCondenserInCircuit(
  deviceType: string,
  _modules: Record<ModuleKey, boolean>,
  condenserType: LauhdutinType | '' | undefined,
): boolean {
  if (!isChillerLikeDevice(deviceType)) return false;
  return isAirCondenserType(condenserType);
}

export function showNestelauhduttimetModules(modules: Record<ModuleKey, boolean>): boolean {
  return moduleIsActive(modules, 'nestelauhduttimet');
}

export function showMlpModules(deviceType: string, modules: Record<ModuleKey, boolean>): boolean {
  return isHeatPumpCircuitsDevice(deviceType) && moduleIsActive(modules, 'mlpPiirit');
}

export function showLampopumppuModules(
  deviceType: string,
  modules: Record<ModuleKey, boolean>,
): boolean {
  if (isAirSourceHeatPump(deviceType)) return true;
  if (usesManualModuleMenu(deviceType)) {
    return (
      moduleIsActive(modules, 'ulkoyksikko') ||
      moduleIsActive(modules, 'sisayksikko') ||
      moduleIsActive(modules, 'mittaukset')
    );
  }
  if (isWaterAirHeatPump(deviceType)) {
    return moduleIsActive(modules, 'ulkoyksikko');
  }
  return false;
}

export function lampopumppuSubmodules(
  deviceType: string,
  modules: Record<ModuleKey, boolean>,
) {
  if (isAirSourceHeatPump(deviceType)) {
    return { ulkoyksikko: true, sisayksikko: true, mittaukset: true };
  }
  if (isWaterAirHeatPump(deviceType)) {
    return {
      ulkoyksikko: moduleIsActive(modules, 'ulkoyksikko'),
      sisayksikko: false,
      mittaukset: false,
    };
  }
  return {
    ulkoyksikko: moduleIsActive(modules, 'ulkoyksikko'),
    sisayksikko: moduleIsActive(modules, 'sisayksikko'),
    mittaukset: moduleIsActive(modules, 'mittaukset'),
  };
}

export function mlpSectionTitle(deviceType: string): string {
  if (isWaterAirHeatPump(deviceType)) return 'Vesi-ilmalämpöpumpun piirit';
  if (isGroundSourceHeatPump(deviceType)) return 'Maalämpöpumpun piirit';
  return 'MLP-piirit';
}

export function keruupiiriSectionTitle(deviceType: string): string {
  if (isWaterAirHeatPump(deviceType)) return 'Keruupiiri (lähde/vesi)';
  return 'Keruupiiri (maa/vesi)';
}

/** Maalämpöpumpun (MLP) omat alaosiot — ei vesi-ilmalämpöpumpulla. */
export function showMlpMaalampoSubsections(deviceType: string): boolean {
  return isGroundSourceHeatPump(deviceType);
}
