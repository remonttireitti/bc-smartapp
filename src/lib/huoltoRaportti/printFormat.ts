/** Tulosteen yhteinen muotoilu: suomalainen päivämäärä ja desimaalipilkku, yksiköt, ihmisluettavat arvot. */
import * as constants from './constants';

let optionLabels: Map<string, string> | null = null;

/** Kaikki constants.ts:n {value,label}-listat → arvo → selite (esim. suorakaynnistys → Suorakäynnistys). */
function labelFor(value: string): string | undefined {
  if (!optionLabels) {
    optionLabels = new Map();
    for (const list of Object.values(constants)) {
      if (!Array.isArray(list)) continue;
      for (const item of list as unknown[]) {
        const it = item as { value?: unknown; label?: unknown };
        if (it && typeof it.value === 'string' && typeof it.label === 'string' && it.value && !optionLabels.has(it.value)) {
          optionLabels.set(it.value, it.label);
        }
      }
    }
  }
  return optionLabels.get(value);
}

/** 2026-10-29 → 29.10.2026 (myös päivämäärä + kellonaika). */
export function fiDate(value: unknown): string {
  const s = String(value ?? '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(s);
  if (!m) return s;
  return `${Number(m[3])}.${Number(m[2])}.${m[1]}${m[4] ? ` klo ${m[4]}` : ''}`;
}

/** 4.00 → 4,00 (vain puhdas luku). */
export function fiNumber(value: unknown): string {
  const s = String(value ?? '').trim();
  return /^-?\d+\.\d+$/.test(s) ? s.replace('.', ',') : s;
}

export function isPlainNumber(value: unknown): boolean {
  return /^-?\d+([.,]\d+)?$/.test(String(value ?? '').trim());
}

/** Raakaarvo (suorakaynnistys, kylmäkoneikko, huonesäädin) → luettava muoto. */
export function humanValue(value: unknown): string {
  let s = String(value ?? '').replace(/[ \t\r\n]+/g, ' ').trim();
  if (!s) return '';
  s = fiDate(s);
  const known = labelFor(s);
  if (known) return known;
  if (/^[a-zäöå_]+(?:[ ,][a-zäöå_ ,]*)?$/.test(s)) {
    s = s.replace(/_/g, ' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return s;
}

/** Arvo + yksikkö: yksikkö lisätään vain pelkälle luvulle (ei kaksinkertaisesti). */
export function withUnit(value: unknown, unit?: string): string {
  const s = String(value ?? '').trim();
  if (!s) return '';
  const v = fiNumber(s);
  if (!unit || !isPlainNumber(s)) return v;
  return unit === '%' || unit === '°C' ? `${v}\u00a0${unit}` : `${v}\u00a0${unit}`;
}

/**
 * Viimeinen siivous valmiille HTML:lle: ISO-päivämäärät ja desimaalipisteet tekstisolmuissa
 * (ei tyylejä, skriptejä eikä attribuutteja).
 */
export function normalizePrintHtml(html: string): string {
  return html
    .split(/(<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<[^>]+>)/g)
    .map((part, i) => {
      if (i % 2 === 1) return part;
      return part
        .replace(/\b(\d{4})-(\d{2})-(\d{2})\b(?!-)/g, (_m, y, mo, d) => `${Number(d)}.${Number(mo)}.${y}`)
        .replace(/(?<![\w.,/:])(\d{1,6})\.(\d{1,3})(?![\d.]|\w)/g, '$1,$2');
    })
    .join('');
}
