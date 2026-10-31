import type { CompressorData, CondenserFanData, PumpunSyottoValinta } from './types';
import { getCompressorVaiheValinta, getCondenserFanVaiheValinta, getMlpPumpSyottoValinta } from './sahkoVaiheUtils';
import { calculatePhaseImbalance } from './utils';
import { kvr, padCell, warn } from './printKit';
import { fiNumber } from './printFormat';

export function normalizePrintText(val: unknown): string {
  if (val == null) return '';
  return String(val).replace(/\s+/g, ' ').trim();
}

export function hasPrintableValue(val: unknown): boolean {
  const s = normalizePrintText(val);
  if (!s || s === '-' || s === '—' || s === '–') return false;
  return !/^[-–—]\s*(A|V|bar|°C|K|kg|g|mbar|micron|m³\/h)?$/i.test(s);
}

function imbalanceWarning(l1: string | undefined, l2: string | undefined, l3: string | undefined): string {
  const imb = calculatePhaseImbalance(parseFloat(String(l1 ?? '')) || 0, parseFloat(String(l2 ?? '')) || 0, parseFloat(String(l3 ?? '')) || 0);
  const pct = fiNumber(imb.toFixed(1));
  if (imb > 10) return warn(`Vaara: vaihe-epätasapaino ${pct} %`, true);
  if (imb > 5) return warn(`Huom: vaihe-epätasapaino ${pct} %`);
  return '';
}

/** L1 | L2 | L3 -virrat riveinä (pareittain) + epätasapainovaroitus. */
export function phaseCurrentRows(l1: string | undefined, l2: string | undefined, l3: string | undefined): string {
  const p1 = hasPrintableValue(l1);
  const p2 = hasPrintableValue(l2);
  const p3 = hasPrintableValue(l3);
  if (!p1 && !p2 && !p3) return '';
  const cells = [p1 ? kvr('Virta L1', l1, 'A') : '', p2 ? kvr('Virta L2', l2, 'A') : '', p3 ? kvr('Virta L3', l3, 'A') : ''].filter(Boolean);
  if (cells.length % 2) cells.push(padCell());
  return cells.join('') + (p1 && p2 && p3 ? imbalanceWarning(l1, l2, l3) : '');
}

/** Pumpun syöttö: vain jos 230_1/400_3 valittu; virrat vain täytetyt kentät */
export function pumpSupplyHtmlBlock(
  syottoValinta: PumpunSyottoValinta | undefined,
  legacyKolme: boolean | undefined,
  virta1vaihe: string,
  virtaL1: string,
  virtaL2: string,
  virtaL3: string,
): string {
  const sel = getMlpPumpSyottoValinta(syottoValinta, legacyKolme);
  if (sel !== '230_1' && sel !== '400_3') return '';
  const kolme = sel === '400_3';
  const rows = [
    kvr('Pumpun syöttö', kolme ? '400 V, 3-vaihe' : '230 V, 1-vaihe'),
    kolme ? '' : kvr('Virta', virta1vaihe, 'A'),
  ].filter(Boolean);
  if (rows.length === 1) rows.push(padCell());
  const currents = kolme ? phaseCurrentRows(virtaL1, virtaL2, virtaL3) : '';
  return `<div class="kv2">${rows.join('')}${currents}</div>`;
}

export type FanPhaseCardTheme = 'condenser' | 'evaporator';

/** Puhallin yhtenä rivinä: "Puhallin 1 · 230 V 1-vaihe" | virrat. */
export function renderFanPhaseCardHtml(
  fan: Partial<CondenserFanData>,
  index: number,
  _theme: FanPhaseCardTheme,
  syotto?: '230' | '400',
): string {
  const vv = getCondenserFanVaiheValinta(fan, syotto);
  if (vv !== '1' && vv !== '3') return '';

  const l1p = hasPrintableValue(fan.virtaL1);
  const l2p = hasPrintableValue(fan.virtaL2);
  const l3p = hasPrintableValue(fan.virtaL3);
  const imbWarn = vv === '3' && l1p && l2p && l3p ? imbalanceWarning(fan.virtaL1, fan.virtaL2, fan.virtaL3) : '';

  let virtaText = '';
  if (vv === '1' && l1p) virtaText = `${fiNumber(normalizePrintText(fan.virtaL1))} A`;
  else if (vv === '3') {
    const parts: string[] = [];
    if (l1p) parts.push(`L1 ${fiNumber(normalizePrintText(fan.virtaL1))}`);
    if (l2p) parts.push(`L2 ${fiNumber(normalizePrintText(fan.virtaL2))}`);
    if (l3p) parts.push(`L3 ${fiNumber(normalizePrintText(fan.virtaL3))}`);
    if (parts.length) virtaText = `${parts.join(' · ')} A`;
  }
  if (!virtaText && !imbWarn) return '';
  const janniteNaytto = fan.jannite === '400' ? '400' : '230';
  const label = `Puhallin ${index} · ${janniteNaytto} V, ${vv === '3' ? '3-vaihe' : '1-vaihe'}`;
  return `${kvr(label, virtaText || '–', undefined, 'wide')}${imbWarn}`;
}

/** Kompressorin syöttö ja virrat mittausrivinä (käytetään kortin Mittaukset-lohkossa). */
export function renderCompressorCurrentHtml(comp: Partial<CompressorData>): string {
  const vv = getCompressorVaiheValinta(comp);
  const syotto = vv === '1' || vv === '3' ? kvr('Syöttö', vv === '3' ? '3-vaiheinen' : '1-vaiheinen') : '';
  if (vv === '1') {
    const a = hasPrintableValue(comp.virta1vaihe) ? kvr('Virta', comp.virta1vaihe, 'A') : '';
    return `${syotto}${a}`;
  }
  if (vv !== '3') return syotto;
  const rows = phaseCurrentRows(comp.virtaL1, comp.virtaL2, comp.virtaL3);
  return `${syotto}${syotto ? padCell() : ''}${rows}`;
}
