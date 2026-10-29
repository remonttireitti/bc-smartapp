/** Tulosteen yhteiset rakennuspalikat: avain–arvo-rivit, parit, lohkot ja komponenttikortit. */
import { hasPrintableValue } from './printFieldVisibility';
import { humanValue, withUnit } from './printFormat';

export function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Yksi avain–arvo-rivi. Tyhjä arvo → ei riviä. Yksikkö lisätään vain pelkälle luvulle. */
export function kvr(label: string, val: unknown, unit?: string, cls = '', auto = true): string {
  if (!hasPrintableValue(val)) return '';
  const v = unit ? withUnit(val, unit) : humanValue(val);
  const wide = cls || (auto && v.length > 30 ? 'wide' : '');
  const c = ['kvr', wide].filter(Boolean).join(' ');
  if (!label) return `<div class="${c} full"><span>${esc(v)}</span></div>`;
  return `<div class="${c}"><span>${esc(label)}</span><span>${esc(v)}</span></div>`;
}

export function padCell(): string {
  return '<div class="kvr pad"></div>';
}

const PAIR = '<!--pair-->';

/** Kaksi mittausta samalla rivillä (esim. Imupaine | Imulämpötila). Jos vain toinen on, se pakkautuu seuraavan yksittäisen kanssa. */
export function pair(a: [string, unknown, string?], b: [string, unknown, string?]): string {
  const x = kvr(a[0], a[1], a[2], '', false);
  const y = kvr(b[0], b[1], b[2], '', false);
  if (x && y) return `${PAIR}${x}${y}`;
  return x || y;
}

function cellCount(html: string): number {
  return (html.match(/<div class="kvr\b/g) ?? []).length;
}

/** Rivit ruudukkoon: parit pysyvät samalla rivillä, yksittäiset täytetään pareiksi, leveät rivit omalle rivilleen. */
function layoutCells(items: string[]): string {
  const out: string[] = [];
  let odd = false;
  for (const raw of items) {
    const isPair = raw.startsWith(PAIR);
    const html = isPair ? raw.slice(PAIR.length) : raw;
    const cells = cellCount(html);
    const full = /class="kvr [^"]*\b(wide|full)\b/.test(html) || !cells || /<div class="(?:warn|note)/.test(html);
    if (isPair || (cells >= 2 && !full)) {
      if (odd) out.push(padCell());
      out.push(html);
      odd = cells % 2 === 1;
    } else if (full) {
      if (odd && cells) out.push(padCell());
      out.push(html);
      odd = false;
    } else {
      out.push(html);
      odd = !odd;
    }
  }
  return out.join('');
}

/** Valittu tarkastuskohta (vihreä ✓). */
export function chk(label: string, checked: boolean | undefined): string {
  return checked === true ? `<div class="kvr chk"><span>✓ ${esc(label)}</span></div>` : '';
}

/** Rivit (jo muotoiltuja) lohkoksi otsikolla: Tiedot / Mittaukset / Tarkastukset. */
export function blk(title: string, items: Array<string | false | null | undefined>): string {
  const inner = layoutCells(items.filter(Boolean) as string[]);
  if (!inner.trim() || cellCount(inner) === (inner.match(/class="kvr pad"/g) ?? []).length && !/<div class="(?:warn|note)/.test(inner)) return '';
  return `<div class="blk"><div class="sh">${esc(title)}</div><div class="kv2">${inner}</div></div>`;
}

export function warn(text: string, bad = false): string {
  return text ? `<div class="warn${bad ? ' bad' : ''}">${esc(text)}</div>` : '';
}

/** Tilamerkki (kunnossa / vika / ei sovellu). */
export function statusChip(status: 'ok' | 'faulty' | 'na' | 'unchecked' | null | undefined, labels: Record<string, string>): string {
  if (!status) return '';
  const text = labels[status] ?? '';
  if (status === 'ok') return `<span class="st st-ok">✓ ${esc(text)}</span>`;
  if (status === 'faulty') return `<span class="st st-bad">✗ ${esc(text)}</span>`;
  return `<span class="st st-na">${esc(text || '–')}</span>`;
}

/** Komponenttikortti: otsikko + tila oikealla, sisällä lohkot. */
export function cmp(title: string, statusHtml: string, body: string): string {
  if (!body.trim()) return '';
  return `<div class="cmp"><div class="cmp-h"><h3>${esc(title)}</h3>${statusHtml}</div>${body}</div>`;
}
