import type { RefrigerantCircuitData } from './types';
import {
  applyDryerInspectionPatch,
  applyExpansionValveInspectionPatch,
  applyMagnetValveInspectionPatch,
  dryerInspectionStatus,
  expansionValveInspectionStatus,
  magnetValveInspectionStatus,
  type HuoltoInspectionStatus,
} from './huoltoInspectionStatus';

export type RefrigerantCircuitPartKey = 'paisuntaventtiili' | 'magneettiventtiili' | 'kuivain';

export function expansionValveHasData(data: RefrigerantCircuitData): boolean {
  return Boolean(
    String(data.paisuntaventtiiliTyyppi ?? '').trim()
    || String(data.paisuntaventtiiliMuu ?? '').trim()
    || String(data.paisuntaventtiiliValmistaja ?? '').trim()
    || String(data.paisuntaventtiiliMalli ?? '').trim(),
  );
}

export function magnetValveHasData(data: RefrigerantCircuitData): boolean {
  return Boolean(
    String(data.magneettiventtiiliValmistaja ?? '').trim()
    || String(data.magneettiventtiiliMalli ?? '').trim(),
  );
}

export function dryerHasData(data: RefrigerantCircuitData): boolean {
  return Boolean(
    String(data.kuivainValmistaja ?? '').trim()
    || String(data.kuivainMalli ?? '').trim()
    || String(data.kuivainKivienMaara ?? '').trim()
    || String(data.kuivainLisatieto ?? '').trim(),
  );
}

export function circuitPartHasData(data: RefrigerantCircuitData, part: RefrigerantCircuitPartKey): boolean {
  if (part === 'paisuntaventtiili') return expansionValveHasData(data);
  if (part === 'magneettiventtiili') return magnetValveHasData(data);
  return dryerHasData(data);
}

export function circuitPartStatus(data: RefrigerantCircuitData, part: RefrigerantCircuitPartKey): HuoltoInspectionStatus {
  if (part === 'paisuntaventtiili') return expansionValveInspectionStatus(data);
  if (part === 'magneettiventtiili') return magnetValveInspectionStatus(data);
  return dryerInspectionStatus(data);
}

export function circuitPartIsPresent(data: RefrigerantCircuitData, part: RefrigerantCircuitPartKey): boolean {
  const status = circuitPartStatus(data, part);
  if (status === 'na') return false;
  if (status === 'ok' || status === 'faulty') return true;
  return circuitPartHasData(data, part);
}

export function binaryChoiceFromStatus(status: HuoltoInspectionStatus): boolean | null {
  if (status === 'ok') return true;
  if (status === 'faulty') return false;
  return null;
}

export function applyCircuitPartInspectionPatch(
  part: RefrigerantCircuitPartKey,
  ok: boolean,
): Partial<RefrigerantCircuitData> {
  const status: Exclude<HuoltoInspectionStatus, null | 'na'> = ok ? 'ok' : 'faulty';
  if (part === 'paisuntaventtiili') return applyExpansionValveInspectionPatch(status);
  if (part === 'magneettiventtiili') return applyMagnetValveInspectionPatch(status);
  return applyDryerInspectionPatch(status);
}

export function clearCircuitPartInspection(part: RefrigerantCircuitPartKey): Partial<RefrigerantCircuitData> {
  if (part === 'paisuntaventtiili') {
    return {
      paisuntaventtiiliTyyppi: '',
      paisuntaventtiiliMuu: '',
      paisuntaventtiiliValmistaja: '',
      paisuntaventtiiliMalli: '',
      paisuntaventtiiliTila: 'na',
      paisuntaventtiiliHuomio: '',
    };
  }
  if (part === 'magneettiventtiili') {
    return {
      magneettiventtiiliValmistaja: '',
      magneettiventtiiliMalli: '',
      magneettiventtiiliTila: 'na',
      magneettiventtiiliHuomio: '',
      magneettiventtiiliTestattu: false,
    };
  }
  return {
    kuivainValmistaja: '',
    kuivainMalli: '',
    kuivainKivienMaara: '',
    kuivainLisatieto: '',
    kuivainTila: 'na',
    kuivainOK: false,
  };
}

export function circuitPartDisplayStatus(
  data: RefrigerantCircuitData,
  part: RefrigerantCircuitPartKey,
): HuoltoInspectionStatus {
  const status = circuitPartStatus(data, part);
  if (status === null && !circuitPartHasData(data, part)) return 'na';
  return status;
}

export function finalizeCircuitPartDraft(
  draft: RefrigerantCircuitData,
  part: RefrigerantCircuitPartKey,
  okChoice: boolean | null,
): RefrigerantCircuitData {
  const hasData = circuitPartHasData(draft, part);
  if (!hasData) {
    return { ...draft, ...clearCircuitPartInspection(part) };
  }
  if (okChoice === null) return draft;
  return { ...draft, ...applyCircuitPartInspectionPatch(part, okChoice) };
}
