import { parseCustomModuleTabId, type CustomReportModule } from './customModuleTypes';
import { refrigerantCircuitHasMagnetValve } from './deviceModuleLogic';
import {
  circuitPartDisplayStatus,
  type RefrigerantCircuitPartKey,
} from './circuitPartInspection';
import {
  compressorInspectionStatus,
  condenserInspectionStatus,
  entityInspectionStatus,
  lauhdutuspiiriInspectionStatus,
  mlpKeruupiiriInspectionStatus,
  mlpLampoInspectionStatus,
  mlpLatauspiiriInspectionStatus,
  nestelauhdutinInspectionStatus,
  nestepiiriInspectionStatus,
  type HuoltoInspectionStatus,
  ulkoyksikkoInspectionStatus,
  vapaajahdytysInspectionStatus,
} from './huoltoInspectionStatus';
import { konvektoriTarkastusSummary, konvektoriRowIsFaulty } from './konvektoriTarkastus';
import {
  isRaportointiBasicsComplete,
  showRefrigerantBasics,
  validateMaintenanceRefrigerantBasics,
  type CustomerBasicsInput,
  type DeviceBasicsInput,
} from './maintenanceReportBasicsValidation';
import type { MaintenanceReportTabId } from './maintenanceReportTabs';
import { buildMaintenanceReportTabs, type MaintenanceReportTabBuildInput } from './maintenanceReportTabs';
import { usesRefrigerantServiceExtras } from './deviceModuleLogic';
import type { CompressorData, HuoltoReportData, RefrigerantCircuitData, TiiveyskoeData, TyhjiointiData } from './types';
import { getEvaporatorCircuitCount } from './evaporatorHelpers';

export type MaintenanceTabCompletionState = 'incomplete' | 'attention' | 'ok';

export type MaintenanceTabCompletionMap = Partial<Record<MaintenanceReportTabId, MaintenanceTabCompletionState>>;

function aggregateInspectionStatuses(statuses: HuoltoInspectionStatus[]): MaintenanceTabCompletionState {
  if (statuses.length === 0) return 'incomplete';
  if (statuses.some((status) => status === null)) return 'incomplete';
  if (statuses.some((status) => status === 'faulty')) return 'attention';
  return 'ok';
}

function isRefrigerantCircuitComplete(
  circuit: RefrigerantCircuitData,
  laiteTyyppi: string,
): MaintenanceTabCompletionState {
  if (!circuit.onKaytossa) return 'ok';

  const count = Math.min(6, Math.max(1, parseInt(circuit.kompressorienMaara, 10) || 1));
  const compressorKeys = [
    'kompressori1',
    'kompressori2',
    'kompressori3',
    'kompressori4',
    'kompressori5',
    'kompressori6',
  ] as const;
  const statuses: HuoltoInspectionStatus[] = [];

  for (let index = 0; index < count; index += 1) {
    statuses.push(compressorInspectionStatus(circuit[compressorKeys[index]] as CompressorData));
  }

  const parts: RefrigerantCircuitPartKey[] = ['paisuntaventtiili', 'magneettiventtiili', 'kuivain'];
  for (const part of parts) {
    if (part === 'magneettiventtiili' && !refrigerantCircuitHasMagnetValve(laiteTyyppi, circuit.paisuntaventtiiliTyyppi)) {
      continue;
    }
    const displayStatus = circuitPartDisplayStatus(circuit, part);
    if (displayStatus === 'na') continue;
    statuses.push(displayStatus);
  }

  return aggregateInspectionStatuses(statuses);
}

function isKylmaaineChargeComplete(form: HuoltoReportData): MaintenanceTabCompletionState {
  if (!validateMaintenanceRefrigerantBasics({
    laiteTyyppi: form.laiteTyyppi,
    laiteValmistaja: form.laiteValmistaja,
    laiteMalli: form.laiteMalli,
    laiteTunnus: form.laiteTunnus,
    laiteSarjanumero: form.laiteSarjanumero,
    laiteSijainti: form.laiteSijainti,
    laiteKayttotarkoitus: form.laiteKayttotarkoitus,
    kylmaaineTyyppi: form.kylmaaineTyyppi,
    kylmaainePiireja: form.kylmaainePiireja,
    selectedModules: form.selectedModules,
  }).ok) {
    return 'incomplete';
  }

  const singleCircuit = form.kylmaainePiireja === '1' || !form.kylmaainePiireja;
  if (singleCircuit) {
    const hasCharge =
      String(form.kylmaaineValmistajaMaara ?? '').trim() !== ''
      || String(form.kylmaaineLisattyMaara ?? '').trim() !== '';
    return hasCharge ? 'ok' : 'incomplete';
  }

  const circuitCount = Math.min(4, Math.max(1, parseInt(form.kylmaainePiireja, 10) || 1));
  const amounts = [
    form.kylmaaineMaaraPiiri1,
    form.kylmaaineMaaraPiiri2,
    form.kylmaaineMaaraPiiri3,
    form.kylmaaineMaaraPiiri4,
  ].slice(0, circuitCount);
  return amounts.every((value) => String(value ?? '').trim() !== '') ? 'ok' : 'incomplete';
}

export function tiiveyskoeTabCompletion(data: TiiveyskoeData): MaintenanceTabCompletionState {
  if (data.tulos?.trim()) {
    return data.tulos === 'hyvaksytty' ? 'ok' : 'attention';
  }
  if (data.testipaineBar?.trim()) return 'ok';
  return 'incomplete';
}

export function tyhjiointiTabCompletion(data: TyhjiointiData): MaintenanceTabCompletionState {
  if (data.tulos?.trim()) {
    return data.tulos === 'hyvaksytty' ? 'ok' : 'attention';
  }
  if (data.loppupaineArvo?.trim()) return 'ok';
  return 'incomplete';
}

function isCustomModuleComplete(module: CustomReportModule): MaintenanceTabCompletionState {
  const requiredFields = module.fields.filter((field) => field.required);
  if (requiredFields.length === 0) return 'incomplete';

  const allFilled = requiredFields.every((field) => {
    const value = module.values[field.id];
    if (field.type === 'checkbox') return value === true;
    return String(value ?? '').trim() !== '';
  });

  return allFilled ? 'ok' : 'incomplete';
}

function completionForTab(
  tabId: MaintenanceReportTabId,
  form: HuoltoReportData,
  customerInput: CustomerBasicsInput,
  deviceInput: DeviceBasicsInput,
): MaintenanceTabCompletionState {
  switch (tabId) {
    case 'raportointi':
      return isRaportointiBasicsComplete(customerInput, deviceInput) ? 'ok' : 'incomplete';

    case 'kylmaaine':
      return isKylmaaineChargeComplete(form);

    case 'kylmaainePiiri': {
      const circuitCount = Math.min(3, Math.max(1, parseInt(form.kylmaainePiireja, 10) || 1));
      const circuits = [form.kylmaainePiiri1, form.kylmaainePiiri2, form.kylmaainePiiri3].slice(0, circuitCount);
      const states = circuits
        .filter((circuit): circuit is RefrigerantCircuitData => circuit != null)
        .map((circuit) => isRefrigerantCircuitComplete(circuit, form.laiteTyyppi));
      if (states.length === 0) return 'incomplete';
      if (states.some((state) => state === 'incomplete')) return 'incomplete';
      if (states.some((state) => state === 'attention')) return 'attention';
      return 'ok';
    }

    case 'hoyrystin': {
      const count = getEvaporatorCircuitCount(form);
      const statuses = form.evaporatorData.slice(0, count).map((row) => entityInspectionStatus(row));
      return aggregateInspectionStatuses(statuses);
    }

    case 'lauhdutin': {
      const circuitCount = Math.min(3, Math.max(1, parseInt(form.kylmaainePiireja, 10) || 1));
      const statuses = form.condenserData
        .slice(0, circuitCount)
        .map((row) => condenserInspectionStatus(row));
      return aggregateInspectionStatuses(statuses);
    }

    case 'lauhdutuspiiri':
      return aggregateInspectionStatuses([
        lauhdutuspiiriInspectionStatus(form.lauhdutuspiiriData ?? {}),
      ]);

    case 'nestelauhduttimet': {
      const units = form.nestelauhduttimetVj ?? [];
      if (units.length === 0) return 'incomplete';
      return aggregateInspectionStatuses(units.map((unit) => nestelauhdutinInspectionStatus(unit)));
    }

    case 'jaahdytysvesi':
      return aggregateInspectionStatuses([nestepiiriInspectionStatus(form.jaahdytysvesiData ?? {})]);

    case 'vapaajahdytys':
      return aggregateInspectionStatuses([vapaajahdytysInspectionStatus(form.vapaajahdytysData ?? {})]);

    case 'konvektorit': {
      const rows = form.konvektoriRows ?? [];
      if (rows.length === 0) return 'incomplete';
      if (rows.some((row) => !konvektoriTarkastusSummary(row).complete)) return 'incomplete';
      if (rows.some((row) => konvektoriRowIsFaulty(row))) return 'attention';
      return 'ok';
    }

    case 'lampopumppu':
      return aggregateInspectionStatuses([ulkoyksikkoInspectionStatus(form)]);

    case 'mlp': {
      const mlp = form.mlpData;
      if (!mlp) return 'incomplete';
      return aggregateInspectionStatuses([
        mlpKeruupiiriInspectionStatus(mlp),
        mlpLatauspiiriInspectionStatus(mlp),
        mlpLampoInspectionStatus(mlp),
      ]);
    }

    case 'huomiot':
      if (!form.huomiot.trim()) return 'incomplete';
      return 'ok';

    case 'huoltotiedot': {
      const dateOk = String(form.huoltoPaivamaara ?? '').trim() !== '';
      const doneOk = form.huoltoSuoritettu === true;
      if (!dateOk || !doneOk) return 'incomplete';
      if (form.huoltoLaiteessaVika) return 'attention';
      return 'ok';
    }

    default: {
      const customModuleId = parseCustomModuleTabId(tabId);
      if (!customModuleId) return 'incomplete';
      const module = (form.customModules ?? []).find((entry) => entry.id === customModuleId);
      if (!module) return 'incomplete';
      return isCustomModuleComplete(module);
    }
  }
}

export function buildMaintenanceReportTabCompletion(
  form: HuoltoReportData,
  customerInput: CustomerBasicsInput,
  deviceInput: DeviceBasicsInput,
  tabBuildInput: MaintenanceReportTabBuildInput,
): MaintenanceTabCompletionMap {
  const tabs = buildMaintenanceReportTabs(tabBuildInput);
  const completion: MaintenanceTabCompletionMap = {};

  for (const tab of tabs) {
    completion[tab.id] = completionForTab(tab.id, form, customerInput, deviceInput);
  }

  if (usesRefrigerantServiceExtras(form.laiteTyyppi) && form.selectedModules.tiiveyskoe) {
    completion.tiiveyskoe = tiiveyskoeTabCompletion(form.tiiveyskoeData);
  }
  if (usesRefrigerantServiceExtras(form.laiteTyyppi) && form.selectedModules.tyhjiointi) {
    completion.tyhjiointi = tyhjiointiTabCompletion(form.tyhjiointiData);
  }

  return completion;
}

/** Kaikki näkyvät moduulit vihreällä (Valmis) — raportti voidaan merkitä valmiiksi. */
export function isMaintenanceReportModulesComplete(
  completion: MaintenanceTabCompletionMap,
): boolean {
  const states = Object.values(completion);
  if (states.length === 0) return false;
  return states.every((state) => state === 'ok');
}

export function maintenanceTabCompletionLabel(state: MaintenanceTabCompletionState | undefined): string {
  if (state === 'ok') return 'Valmis';
  if (state === 'attention') return 'Tarkastettu, huomioita';
  return 'Kesken';
}

export { showRefrigerantBasics };
