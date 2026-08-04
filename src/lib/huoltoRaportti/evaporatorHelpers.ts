import type { EvaporatorData, EvaporatorType, HuoltoReportData } from './types';
import { isChillerLikeDevice, isSharedEvaporatorAcrossCircuits, isWaterCooledChiller } from './deviceModuleLogic';

/** Vedenjäähdytyskone / VAK: levy- tai putkilämmönvaihdin (ei puhaltimia eikä sulatusta). */
export function isHeatExchangerEvaporatorType(tyyppi: EvaporatorType | string | undefined): boolean {
  return tyyppi === 'levy' || tyyppi === 'putki';
}

export function evaporatorShowsFansAndDefrost(tyyppi: EvaporatorType | string | undefined): boolean {
  return tyyppi === 'puhallin' || tyyppi === 'staatinen' || tyyppi === 'suorahoyrystin';
}

export function defaultEvaporatorTypeForDevice(laiteTyyppi: string): EvaporatorType {
  return isChillerLikeDevice(laiteTyyppi) ? 'levy' : 'staatinen';
}

export function evapTyyppiLabel(value: string | undefined): string {
  if (value === 'puhallin') return 'Puhallinhöyrystin';
  if (value === 'staatinen') return 'Staattinen höyrystin';
  if (value === 'levy') return 'Levy lämmönvaihdin';
  if (value === 'putki') return 'Putkilämmönvaihdin';
  if (value === 'suorahoyrystin') return 'Suorahöyrystin';
  return value?.trim() || '—';
}

export function getEvaporatorCircuitCount(form: HuoltoReportData): number {
  if (form.laiteTyyppi === 'kylmäkoneikko') return form.evaporatorData.length;
  if (isSharedEvaporatorAcrossCircuits(form.laiteTyyppi, form.hoyrystinYhteinenPiireissa)) {
    return 1;
  }
  return Math.min(3, Math.max(1, parseInt(form.kylmaainePiireja, 10) || 1));
}

export function evaporatorSnapshotRowIsMeaningful(ev: {
  valmistaja?: string;
  malli?: string;
  sarjanumero?: string;
  tyyppi?: string;
  huoneenTunnus?: string;
}): boolean {
  const t = String(ev.tyyppi ?? '').trim();
  if (isHeatExchangerEvaporatorType(t)) return true;
  const nonEmpty = (s?: string) => String(s ?? '').trim().length > 0;
  return (
    nonEmpty(ev.valmistaja) ||
    nonEmpty(ev.malli) ||
    nonEmpty(ev.sarjanumero) ||
    nonEmpty(ev.huoneenTunnus) ||
    (t !== '' && t !== 'staatinen')
  );
}

export function normalizeEvaporatorForDevice(
  ev: EvaporatorData,
  laiteTyyppi: string,
): EvaporatorData {
  if (!isChillerLikeDevice(laiteTyyppi)) return ev;
  if (isHeatExchangerEvaporatorType(ev.tyyppi) || ev.tyyppi === 'suorahoyrystin') {
    if (isWaterCooledChiller(laiteTyyppi) && ev.tyyppi === 'suorahoyrystin') {
      return { ...ev, tyyppi: defaultEvaporatorTypeForDevice(laiteTyyppi), puhaltimienMaara: 0, puhaltimet: [] };
    }
    return ev;
  }
  return {
    ...ev,
    tyyppi: defaultEvaporatorTypeForDevice(laiteTyyppi),
    puhaltimienMaara: 0,
    puhaltimet: [],
  };
}
