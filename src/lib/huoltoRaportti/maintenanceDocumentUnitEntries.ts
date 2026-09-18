import { isChillerLikeDevice, usesRefrigerantServiceExtras } from './deviceModuleLogic';
import { tiiveyskoeTabCompletion, tyhjiointiTabCompletion } from './maintenanceReportTabCompletion';
import {
  condenserInspectionStatus,
  compressorInspectionStatus,
  entityInspectionStatus,
  mlpKeruupiiriInspectionStatus,
  mlpLampoInspectionStatus,
  mlpLatauspiiriInspectionStatus,
  ulkoyksikkoInspectionStatus,
  type HuoltoInspectionStatus,
} from './huoltoInspectionStatus';
import type { MaintenanceTabCompletionState } from './maintenanceReportTabCompletion';
import type { MaintenanceReportTabItem } from './maintenanceReportTabs';
import type { CompressorData, HuoltoReportData } from './types';
import { getEvaporatorCircuitCount } from './evaporatorHelpers';
import { circuitMeasurementsStatus } from './refrigerantCircuitHelpers';
import { circuitComponentsInspectionStatuses } from './refrigerantCircuitComponents';
import {
  getRefrigerantCircuitByIndex,
  getRefrigerantCircuitCompressorCount,
  getRefrigerantCircuitCount,
  refrigerantCircuitComponentsTitle,
  refrigerantCircuitCompressorTitle,
  refrigerantCircuitMeasurementsTitle,
} from './refrigerantCircuitHelpers';
import {
  buildMlpDocumentUnits,
  mlpDocumentUnitIdFromTabId,
  type MlpDocumentUnitId,
} from './mlpDocumentHelpers';
import {
  buildLampopumppuDocumentUnits,
  lampopumppuDocumentUnitIdFromTabId,
  type LampopumppuDocumentUnitId,
} from './lampopumppuDocumentHelpers';
import { sisayksikkoTarkastusSummary } from './sisayksikkoTarkastus';

export type MaintenanceDocumentEntryKind =
  | 'tab'
  | 'evaporatorUnit'
  | 'condenserUnit'
  | 'circuitMeasurementsUnit'
  | 'circuitCompressorUnit'
  | 'circuitComponentsUnit'
  | 'mlpUnit'
  | 'lampopumppuUnit';

export type MaintenanceDocumentEntry = {
  key: string;
  kind: MaintenanceDocumentEntryKind;
  tabId: string;
  title: string;
  unitIndex?: number;
  subIndex?: number;
  mlpUnitId?: MlpDocumentUnitId;
  lampopumppuUnitId?: LampopumppuDocumentUnitId;
  themeKey?: string;
};

export function inspectionStatusToDocumentCompletion(
  status: HuoltoInspectionStatus,
): MaintenanceTabCompletionState {
  if (status === 'ok' || status === 'na') return 'ok';
  if (status === 'faulty') return 'attention';
  return 'incomplete';
}

export function buildMaintenanceDocumentEntries(
  tabs: MaintenanceReportTabItem[],
  form: HuoltoReportData,
): MaintenanceDocumentEntry[] {
  const entries: MaintenanceDocumentEntry[] = [];

  for (const tab of tabs) {
    if (tab.id === 'huomiot') {
      appendOptionalServiceMeasurementEntries(entries, form);
    }

    if (tab.id === 'hoyrystin' && !isChillerLikeDevice(form.laiteTyyppi)) {
      const count = getEvaporatorCircuitCount(form);
      for (let index = 0; index < count; index += 1) {
        entries.push({
          key: `hoyrystin:${index}`,
          kind: 'evaporatorUnit',
          tabId: `hoyrystin:${index}`,
          title: count === 1 ? tab.label : `${tab.label} ${index + 1}`,
          unitIndex: index,
        });
      }
      continue;
    }

    if (tab.id === 'lauhdutin') {
      const count = Math.min(3, Math.max(1, parseInt(form.kylmaainePiireja, 10) || 1));
      for (let index = 0; index < count; index += 1) {
        entries.push({
          key: `lauhdutin:${index}`,
          kind: 'condenserUnit',
          tabId: `lauhdutin:${index}`,
          title: count === 1 ? tab.label : `${tab.label} ${index + 1}`,
          unitIndex: index,
        });
      }
      continue;
    }

    if (tab.id === 'kylmaainePiiri' && form.selectedModules.kylmaainePiiri) {
      appendRefrigerantCircuitUnitEntries(entries, form);
      continue;
    }

    if (tab.id === 'mlp' || tab.id === 'kiinteistoJahdytys' || tab.id === 'energia') {
      const units = buildMlpDocumentUnits(form, tab.id);
      for (const unit of units) {
        entries.push({
          key: unit.tabId,
          kind: 'mlpUnit',
          tabId: unit.tabId,
          title: unit.title,
          mlpUnitId: unit.id,
          themeKey: unit.themeKey,
        });
      }
      continue;
    }

    if (tab.id === 'lampopumppu') {
      const units = buildLampopumppuDocumentUnits(form);
      for (const unit of units) {
        entries.push({
          key: unit.tabId,
          kind: 'lampopumppuUnit',
          tabId: unit.tabId,
          title: unit.title,
          lampopumppuUnitId: unit.id,
          themeKey: unit.themeKey,
        });
      }
      continue;
    }

    entries.push({
      key: tab.id,
      kind: 'tab',
      tabId: tab.id,
      title: tab.label,
    });
  }

  return entries;
}

function appendRefrigerantCircuitUnitEntries(entries: MaintenanceDocumentEntry[], form: HuoltoReportData) {
  const circuitCount = getRefrigerantCircuitCount(form);
  for (let circuitIndex = 0; circuitIndex < circuitCount; circuitIndex += 1) {
    const circuitNumber = circuitIndex + 1;
    const circuit = getRefrigerantCircuitByIndex(form, circuitIndex);
    if (!circuit?.onKaytossa) continue;

    entries.push({
      key: `kylmaainePiiri:${circuitIndex}:measurements`,
      kind: 'circuitMeasurementsUnit',
      tabId: `kylmaainePiiri:${circuitIndex}:measurements`,
      title: refrigerantCircuitMeasurementsTitle(circuitNumber),
      unitIndex: circuitIndex,
    });

    const compressorCount = getRefrigerantCircuitCompressorCount(circuit);
    for (let compressorIndex = 0; compressorIndex < compressorCount; compressorIndex += 1) {
      entries.push({
        key: `kylmaainePiiri:${circuitIndex}:compressor:${compressorIndex}`,
        kind: 'circuitCompressorUnit',
        tabId: `kylmaainePiiri:${circuitIndex}:compressor:${compressorIndex}`,
        title: refrigerantCircuitCompressorTitle(circuitNumber, compressorIndex + 1),
        unitIndex: circuitIndex,
        subIndex: compressorIndex,
      });
    }

    entries.push({
      key: `kylmaainePiiri:${circuitIndex}:components`,
      kind: 'circuitComponentsUnit',
      tabId: `kylmaainePiiri:${circuitIndex}:components`,
      title: refrigerantCircuitComponentsTitle(circuitNumber),
      unitIndex: circuitIndex,
    });
  }
}

function appendOptionalServiceMeasurementEntries(entries: MaintenanceDocumentEntry[], form: HuoltoReportData) {
  if (!usesRefrigerantServiceExtras(form.laiteTyyppi)) return;
  if (form.selectedModules.tiiveyskoe) {
    entries.push({
      key: 'tiiveyskoe',
      kind: 'tab',
      tabId: 'tiiveyskoe',
      title: 'Tiiveyskoe',
    });
  }
  if (form.selectedModules.tyhjiointi) {
    entries.push({
      key: 'tyhjiointi',
      kind: 'tab',
      tabId: 'tyhjiointi',
      title: 'Tyhjiöinti',
    });
  }
}

export function documentEntryCompletion(
  entry: MaintenanceDocumentEntry,
  form: HuoltoReportData,
  tabCompletion?: Partial<Record<string, MaintenanceTabCompletionState>>,
): MaintenanceTabCompletionState | undefined {
  if (entry.kind === 'evaporatorUnit' && entry.unitIndex != null) {
    return inspectionStatusToDocumentCompletion(entityInspectionStatus(form.evaporatorData[entry.unitIndex]));
  }
  if (entry.kind === 'condenserUnit' && entry.unitIndex != null) {
    return inspectionStatusToDocumentCompletion(condenserInspectionStatus(form.condenserData[entry.unitIndex]));
  }
  if (entry.kind === 'circuitMeasurementsUnit' && entry.unitIndex != null) {
    const circuit = getRefrigerantCircuitByIndex(form, entry.unitIndex);
    return inspectionStatusToDocumentCompletion(circuit ? circuitMeasurementsStatus(circuit) : null);
  }
  if (
    entry.kind === 'circuitCompressorUnit'
    && entry.unitIndex != null
    && entry.subIndex != null
  ) {
    const circuit = getRefrigerantCircuitByIndex(form, entry.unitIndex);
    if (!circuit) return 'incomplete';
    const compressorKeys = [
      'kompressori1',
      'kompressori2',
      'kompressori3',
      'kompressori4',
      'kompressori5',
      'kompressori6',
    ] as const;
    const compressor = circuit[compressorKeys[entry.subIndex]] as CompressorData | undefined;
    return inspectionStatusToDocumentCompletion(
      compressor ? compressorInspectionStatus(compressor) : null,
    );
  }
  if (entry.kind === 'circuitComponentsUnit' && entry.unitIndex != null) {
    const circuit = getRefrigerantCircuitByIndex(form, entry.unitIndex);
    if (!circuit) return 'incomplete';
    const statuses = circuitComponentsInspectionStatuses(circuit);
    if (statuses.length === 0) return 'ok';
    if (statuses.some((status) => status === null)) return 'incomplete';
    if (statuses.some((status) => status === 'faulty')) return 'attention';
    return 'ok';
  }
  if (entry.kind === 'mlpUnit' && entry.mlpUnitId) {
    return mlpDocumentUnitCompletion(form, entry.mlpUnitId);
  }
  if (entry.kind === 'lampopumppuUnit' && entry.lampopumppuUnitId) {
    return lampopumppuDocumentUnitCompletion(form, entry.lampopumppuUnitId);
  }
  if (entry.tabId === 'tiiveyskoe') {
    return tabCompletion?.tiiveyskoe ?? tiiveyskoeTabCompletion(form.tiiveyskoeData);
  }
  if (entry.tabId === 'tyhjiointi') {
    return tabCompletion?.tyhjiointi ?? tyhjiointiTabCompletion(form.tyhjiointiData);
  }
  return tabCompletion?.[entry.tabId];
}

export function documentNavTargetTabId(tabId: string, form: HuoltoReportData): string {
  if (tabId.startsWith('kylmaainePiiri:')) return tabId;
  if (tabId.startsWith('mlp:')) return tabId;
  if (tabId.startsWith('lampopumppu:')) return tabId;
  if (tabId === 'kylmaainePiiri' && form.selectedModules.kylmaainePiiri) {
    const count = getRefrigerantCircuitCount(form);
    return count > 0 ? 'kylmaainePiiri:0:measurements' : tabId;
  }
  if (tabId === 'mlp') {
    const units = buildMlpDocumentUnits(form, 'mlp');
    return units[0]?.tabId ?? tabId;
  }
  if (tabId === 'kiinteistoJahdytys') {
    const units = buildMlpDocumentUnits(form, 'kiinteistoJahdytys');
    return units[0]?.tabId ?? tabId;
  }
  if (tabId === 'energia') {
    const units = buildMlpDocumentUnits(form, 'energia');
    return units[0]?.tabId ?? tabId;
  }
  if (tabId === 'lampopumppu') {
    const units = buildLampopumppuDocumentUnits(form);
    return units[0]?.tabId ?? tabId;
  }
  if (tabId !== 'hoyrystin' && tabId !== 'lauhdutin') return tabId;
  if (tabId === 'hoyrystin' && !isChillerLikeDevice(form.laiteTyyppi)) {
    const count = getEvaporatorCircuitCount(form);
    return count > 0 ? 'hoyrystin:0' : tabId;
  }
  if (tabId === 'lauhdutin') {
    const count = Math.min(3, Math.max(1, parseInt(form.kylmaainePiireja, 10) || 1));
    return count > 0 ? 'lauhdutin:0' : tabId;
  }
  return tabId;
}

export function documentEntryUsesDialogLauncher(entry: MaintenanceDocumentEntry): boolean {
  return (
    entry.kind === 'evaporatorUnit'
    || entry.kind === 'condenserUnit'
    || entry.kind === 'circuitMeasurementsUnit'
    || entry.kind === 'circuitCompressorUnit'
    || entry.kind === 'circuitComponentsUnit'
    || entry.kind === 'mlpUnit'
    || entry.kind === 'lampopumppuUnit'
  );
}

function mlpDocumentUnitCompletion(
  form: HuoltoReportData,
  unitId: MlpDocumentUnitId,
): MaintenanceTabCompletionState {
  const mlp = form.mlpData;
  if (!mlp) return 'incomplete';

  if (unitId === 'keruupiiri') {
    return inspectionStatusToDocumentCompletion(mlpKeruupiiriInspectionStatus(mlp));
  }
  if (unitId === 'latauspiiri') {
    return inspectionStatusToDocumentCompletion(mlpLatauspiiriInspectionStatus(mlp));
  }
  if (unitId === 'lampopiirit') {
    return inspectionStatusToDocumentCompletion(mlpLampoInspectionStatus(mlp));
  }
  if (unitId === 'jaahdytyspiiri') {
    return !mlp.keruuJaahdytysPiiri ? 'ok' : mlp.keruuJaahdytysVirtaus?.trim() ? 'ok' : 'incomplete';
  }
  if (unitId === 'kayttovesi') {
    return !mlp.kayttovesiEnabled ? 'ok' : mlp.kayttovesiTilavuus?.trim() ? 'ok' : 'incomplete';
  }
  if (unitId === 'energia') {
    return mlp.mittaaKokoLaiteSahko && !mlp.kokoLaiteVirta1vaihe?.trim() && !mlp.kokoLaiteVirtaL1?.trim()
      ? 'incomplete'
      : 'ok';
  }
  return 'incomplete';
}

function lampopumppuDocumentUnitCompletion(
  form: HuoltoReportData,
  unitId: LampopumppuDocumentUnitId,
): MaintenanceTabCompletionState {
  if (unitId === 'ulkoyksikko') {
    if (!form.ulkoyksikkoMalli?.trim() && !form.ulkoyksikkoSarjanumero?.trim()) {
      return 'incomplete';
    }
    return inspectionStatusToDocumentCompletion(ulkoyksikkoInspectionStatus(form));
  }

  if (unitId === 'sisayksikko') {
    const count = form.sisayksikkoMaara ?? form.sisayksikkoData?.length ?? 0;
    const rows = (form.sisayksikkoData ?? []).slice(0, Math.max(1, count));
    if (rows.length === 0) return 'incomplete';
    const anyIdentity = rows.some((row) => row.tyyppi?.trim() || row.malli?.trim() || row.sarjanumero?.trim());
    if (!anyIdentity) return 'incomplete';
    if (rows.some((row) => {
      const summary = sisayksikkoTarkastusSummary(row);
      return summary.answered > 0 && !summary.complete;
    })) {
      return 'incomplete';
    }
    if (rows.some((row) => row.huomioTyyppi === 'vika' || sisayksikkoTarkastusSummary(row).anyFaulty)) {
      return 'attention';
    }
    return 'ok';
  }

  // mittaukset
  const hasFlags = Boolean(form.mittausJaahdytysTestattu || form.mittausLammitysTestattu);
  const hasTemps = Boolean(form.mittausTestausLampotila?.trim() || form.mittausUlkoLampotila?.trim());
  const hasCurrent = Boolean(form.mittausAmpeeriL1?.trim());
  const hasUnitMittaus = (form.mittausSisayksikot ?? []).some((row) =>
    Boolean(
      row.imupaineJaahdytys?.trim()
      || row.korkeapaineJaahdytys?.trim()
      || row.imupaineLammitys?.trim()
      || row.korkeapaineLammitys?.trim()
      || row.sisalampotila?.trim()
      || row.puhallusLampotila?.trim(),
    ),
  );
  return hasFlags || hasTemps || hasCurrent || hasUnitMittaus ? 'ok' : 'incomplete';
}

export { mlpDocumentUnitIdFromTabId, lampopumppuDocumentUnitIdFromTabId };
