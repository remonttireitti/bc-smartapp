import type { CompressorData, CondenserFanData, FanData, KompressorinVaiheValinta, PumpunSyottoValinta } from './types';

/** Kompressori: '' = ei valittu → ei tulostetta eikä vaihetietoa rekisteriin. */
export function getCompressorVaiheValinta(comp: Partial<CompressorData> | null | undefined): KompressorinVaiheValinta {
  if (!comp) return '';
  const v = comp.kompressorinVaiheValinta;
  if (v === '1' || v === '3') return v;
  if (v === '') return '';
  if (comp.onkoKolmeVaihetta === true) return '3';
  if (comp.onkoKolmeVaihetta === false) return '1';
  return '';
}

export function compressorKolmeVaijetta(comp: Partial<CompressorData> | null | undefined): boolean {
  return getCompressorVaiheValinta(comp) === '3';
}

/** Höyrystimen puhallin */
export function getFanVaiheValinta(f: Partial<FanData> | null | undefined): KompressorinVaiheValinta {
  if (!f) return '';
  const vv = f.vaiheValinta;
  if (vv === '1' || vv === '3') return vv;
  if (vv === '') return '';
  if (f.phase === 3) return '3';
  if (f.phase === 1) return '1';
  return '';
}

/** Lauhdutinpuhallin (jäännösvaihe phase-kentästä) */
export function getCondenserFanVaiheValinta(
  f: Partial<CondenserFanData> | null | undefined,
  yksikonPuhallinSyotto?: '230' | '400'
): KompressorinVaiheValinta {
  if (yksikonPuhallinSyotto === '400') return '3';
  if (!f) return '';
  const vv = f.vaiheValinta;
  if (vv === '1' || vv === '3') return vv;
  if (vv === '') return '';
  if (f.phase === 3) return '3';
  if (f.phase === 1) return '1';
  return '';
}

export function mittausVirtaOnTayttynyt(s: unknown): boolean {
  return String(s ?? '').trim().length > 0;
}

export function pumpunSyottoValintaToKolme(v: PumpunSyottoValinta): boolean {
  return v === '400_3';
}

/** MLP / lämmityspiirin pumppu: '' kun ei valittu. */
export function getMlpPumpSyottoValinta(
  valinta: PumpunSyottoValinta | undefined,
  kolmeVaihetta: boolean | undefined
): PumpunSyottoValinta {
  if (valinta === '230_1' || valinta === '400_3') return valinta;
  if (valinta === '') return '';
  if (kolmeVaihetta === true) return '400_3';
  if (kolmeVaihetta === false) return '230_1';
  return '';
}

export function getKokoLaiteSahkoVaiheValinta(m: {
  kokoLaiteSahkoVaiheValinta?: KompressorinVaiheValinta;
  kokoLaiteSahkoKolmeVaihetta?: boolean;
}): KompressorinVaiheValinta {
  const v = m.kokoLaiteSahkoVaiheValinta;
  if (v === '1' || v === '3') return v;
  if (v === '') return '';
  if (m.kokoLaiteSahkoKolmeVaihetta === true) return '3';
  if (m.kokoLaiteSahkoKolmeVaihetta === false) return '1';
  return '';
}
