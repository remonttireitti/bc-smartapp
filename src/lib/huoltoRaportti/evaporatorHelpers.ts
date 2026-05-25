import type { EvaporatorData, EvaporatorType } from './types';
import { isChillerLikeDevice } from './deviceModuleLogic';

/** Vedenjäähdytyskone / VAK: levy- tai putkilämmönvaihdin (ei puhaltimia eikä sulatusta). */
export function isHeatExchangerEvaporatorType(tyyppi: EvaporatorType | string | undefined): boolean {
  return tyyppi === 'levy' || tyyppi === 'putki';
}

export function evaporatorShowsFansAndDefrost(tyyppi: EvaporatorType | string | undefined): boolean {
  return tyyppi === 'puhallin' || tyyppi === 'staatinen';
}

export function defaultEvaporatorTypeForDevice(laiteTyyppi: string): EvaporatorType {
  return isChillerLikeDevice(laiteTyyppi) ? 'levy' : 'staatinen';
}

export function evapTyyppiLabel(value: string | undefined): string {
  if (value === 'puhallin') return 'Puhallinhöyrystin';
  if (value === 'staatinen') return 'Staattinen höyrystin';
  if (value === 'levy') return 'Levy lämmönvaihdin';
  if (value === 'putki') return 'Putkilämmönvaihdin';
  return value?.trim() || '—';
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
  if (isHeatExchangerEvaporatorType(ev.tyyppi)) return ev;
  return {
    ...ev,
    tyyppi: defaultEvaporatorTypeForDevice(laiteTyyppi),
    puhaltimienMaara: 0,
    puhaltimet: [],
  };
}
