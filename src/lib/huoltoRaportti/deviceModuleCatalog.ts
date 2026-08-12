import { lauhdutinTypeLabel, moduleSelectionOptions } from './constants';
import {
  hasExternalNestelauhdutin,
  isAirCondenserType,
  isAirSourceHeatPump,
  isChillerLikeDevice,
  isGroundSourceHeatPump,
  isLiquidHeatExchangerCondenser,
  isWaterAirHeatPump,
  isWaterCooledChiller,
} from './deviceModuleLogic';
import type { ModuleKey } from './constants';
import type { HuoltoReportData } from './types';
import { evapTyyppiLabel } from './evaporatorHelpers';

export type DeviceStructureEntry = {
  id: string;
  label: string;
  detail?: string;
  group: string;
  active: boolean;
};

function lmvLabel(value: string | undefined): string {
  if (value === 'levy') return 'Levy lämmönvaihdin';
  if (value === 'putki') return 'Putkilämmönvaihdin';
  if (value === 'suorahoyrystin') return 'Suorahöyrystin';
  return value?.trim() || '—';
}

function moduleLabel(key: ModuleKey): string {
  return moduleSelectionOptions.find((o) => o.key === key)?.label ?? key;
}

/** Kuvaa laitteen nykyistä moduilirakennetta moduulirakenne-dialogia varten. */
export function getDeviceStructureEntries(form: HuoltoReportData): DeviceStructureEntry[] {
  const { laiteTyyppi: deviceType, selectedModules: modules } = form;
  const condenserType = form.lauhdutinTyyppiLaite ?? '';
  const entries: DeviceStructureEntry[] = [];

  if (isAirSourceHeatPump(deviceType)) {
    entries.push(
      { id: 'ilp-ulkoyksikko', label: 'Ulkoyksikkö', group: 'Ilmalämpöpumppu', active: modules.ulkoyksikko },
      { id: 'ilp-sisayksikko', label: 'Sisäyksiköt', group: 'Ilmalämpöpumppu', active: modules.sisayksikko },
      { id: 'ilp-mittaukset', label: 'Mittaukset', group: 'Ilmalämpöpumppu', active: modules.mittaukset },
    );
    return entries;
  }

  if (isGroundSourceHeatPump(deviceType)) {
    entries.push(
      {
        id: 'mlp-hoyrystin',
        label: 'Höyrystinpuoli (keruupiiri)',
        detail: lmvLabel(form.hoyrystinTyyppi),
        group: 'Maalämpöpumppu',
        active: true,
      },
      {
        id: 'mlp-lauhdutin',
        label: 'Lauhdutinpuoli (latauspiiri)',
        detail: lmvLabel(form.lauhdutinLmvTyyppi),
        group: 'Maalämpöpumppu',
        active: true,
      },
      { id: 'mlp-piirit', label: moduleLabel('mlpPiirit'), group: 'Maalämpöpumppu', active: modules.mlpPiirit },
    );
    return entries;
  }

  if (isWaterAirHeatPump(deviceType)) {
    entries.push(
      { id: 'vil-piirit', label: moduleLabel('mlpPiirit'), group: 'Vesi-ilmalämpöpumppu', active: modules.mlpPiirit },
      { id: 'vil-ulkoyksikko', label: 'Ulkoyksikkö (lähdepuoli)', group: 'Vesi-ilmalämpöpumppu', active: modules.ulkoyksikko },
    );
    return entries;
  }

  if (isChillerLikeDevice(deviceType)) {
    const deviceLabel = isWaterCooledChiller(deviceType) ? 'Vedenjäähdytyskone' : 'Vakioilmastointikone';
    entries.push(
      { id: 'ch-kylmaaine', label: moduleLabel('kylmaainePiiri'), group: deviceLabel, active: modules.kylmaainePiiri },
      { id: 'ch-jaahdytysvesi', label: moduleLabel('vedenjajahdytyskone'), group: deviceLabel, active: modules.vedenjajahdytyskone },
    );

    if (condenserType) {
      entries.push({
        id: 'ch-lauhdutustapa',
        label: 'Lauhdutustapa',
        detail: lauhdutinTypeLabel(condenserType),
        group: deviceLabel,
        active: Boolean(modules.lauhdutin),
      });
    }

    if (isLiquidHeatExchangerCondenser(condenserType)) {
      entries.push({
        id: 'ch-lauhdutuspiiri',
        label: 'Lauhdutuspiiri (LMV)',
        group: deviceLabel,
        active: modules.lauhdutin,
      });
      if (hasExternalNestelauhdutin(condenserType)) {
        entries.push({
          id: 'ch-nestelauhduttimet',
          label: moduleLabel('nestelauhduttimet'),
          group: deviceLabel,
          active: modules.nestelauhduttimet,
        });
      }
    }

    if (isAirCondenserType(condenserType)) {
      entries.push({
        id: 'ch-ilmalauhdutin',
        label: 'Ilmalauhdutin',
        group: deviceLabel,
        active: modules.lauhdutin,
      });
    }

    if (deviceType === 'vakioilmastointtikone') {
      const evapType = form.hoyrystinTyyppi || form.evaporatorData[0]?.tyyppi;
      entries.push({
        id: 'vak-hoyrystin',
        label: 'Höyrystin',
        detail: evapType ? evapTyyppiLabel(evapType) : undefined,
        group: deviceLabel,
        active: modules.hoyrystin,
      });
    } else {
      entries.push({
        id: 'vj-hoyrystin',
        label: 'Höyrystin (levy/putki LMV)',
        detail: 'Mallinnetaan jäähdytysveden piirissä',
        group: deviceLabel,
        active: true,
      });
    }

    if (modules.vapaajahdytys) {
      entries.push({
        id: 'ch-vapaajahdytys',
        label: moduleLabel('vapaajahdytys'),
        group: deviceLabel,
        active: true,
      });
    }

    return entries;
  }

  return entries;
}
