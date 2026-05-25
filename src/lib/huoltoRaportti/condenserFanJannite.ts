import type { CondenserFanData, FanPhaseType, KompressorinVaiheValinta, SahkoJanniteType } from './types';

/** 230 V → 1-vaihe, 400 V → 3-vaihe (ei erillistä vaihevalintaa). */
export function applyJanniteToCondenserFan(
  fan: CondenserFanData,
  jannite: SahkoJanniteType
): CondenserFanData {
  if (jannite === '400') {
    return {
      ...fan,
      jannite,
      phase: 3 as FanPhaseType,
      vaiheValinta: '3' as KompressorinVaiheValinta,
    };
  }
  return {
    ...fan,
    jannite,
    phase: 1 as FanPhaseType,
    vaiheValinta: '1' as KompressorinVaiheValinta,
    virtaL2: '',
    virtaL3: '',
  };
}

export function condenserFanIsThreePhase(f: Pick<CondenserFanData, 'jannite'>): boolean {
  return f.jannite === '400';
}
