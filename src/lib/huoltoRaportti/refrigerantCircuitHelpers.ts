import type { HuoltoInspectionStatus } from './huoltoInspectionStatus';
import type { HuoltoReportData, RefrigerantCircuitData } from './types';

export function circuitMeasurementsStatus(data: RefrigerantCircuitData): HuoltoInspectionStatus {
  if (!data.onKaytossa) return 'na';
  const hasPressure = Boolean(data.imupaine?.trim() || data.korkeapaine?.trim());
  return hasPressure ? 'ok' : null;
}

export function circuitMeasurementsSubtitle(data: RefrigerantCircuitData): string {
  const low = data.imupaine?.trim();
  const high = data.korkeapaine?.trim();
  if (!low && !high) return '';
  return `${low || '—'}/${high || '—'} bar`;
}

export function getRefrigerantCircuitCount(form: HuoltoReportData): number {
  return Math.min(3, Math.max(1, parseInt(form.kylmaainePiireja, 10) || 1));
}

export function getRefrigerantCircuitByIndex(
  form: HuoltoReportData,
  index: number,
): RefrigerantCircuitData | null {
  if (index === 0) return form.kylmaainePiiri1;
  if (index === 1) return form.kylmaainePiiri2;
  if (index === 2) return form.kylmaainePiiri3;
  return null;
}

export function getRefrigerantCircuitCompressorCount(circuit: RefrigerantCircuitData): number {
  return Math.min(6, Math.max(1, parseInt(circuit.kompressorienMaara, 10) || 1));
}

export function patchRefrigerantCircuitAtIndex(
  _form: HuoltoReportData,
  index: number,
  data: RefrigerantCircuitData,
): Partial<HuoltoReportData> {
  if (index === 0) return { kylmaainePiiri1: data };
  if (index === 1) return { kylmaainePiiri2: data };
  if (index === 2) return { kylmaainePiiri3: data };
  return {};
}

export function refrigerantCircuitMeasurementsTitle(circuitNumber: number): string {
  return `Piiri ${circuitNumber} — mittaukset`;
}

export function refrigerantCircuitCompressorTitle(circuitNumber: number, compressorNumber: number): string {
  return `Piiri ${circuitNumber} — kompressori ${compressorNumber}`;
}

export function refrigerantCircuitComponentsTitle(circuitNumber: number): string {
  return `Piiri ${circuitNumber} — ohjaus ja komponentit`;
}
