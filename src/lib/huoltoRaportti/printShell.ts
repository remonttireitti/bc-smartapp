/** Yhteinen hillitty A4-tulostetyyli kaikille huoltopöytäkirjoille: yrityksen värinen otsikkokaista, muuten yksiväri. */
export const DEFAULT_PRINT_BRAND = '#1f3a5f';

export const PRINT_SHELL_CSS = `
.rp { --brand: ${DEFAULT_PRINT_BRAND}; font-family: Arial, Helvetica, sans-serif; font-size: 9pt; line-height: 1.35; color: #1a1a1a; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.rp * { box-sizing: border-box; }
.rp .hdr { display: flex; align-items: center; justify-content: space-between; gap: 8mm; background: var(--brand); color: #fff; padding: 4mm 5mm; border-radius: 1.2mm; }
.rp .hdr .brand { display: flex; align-items: center; gap: 4mm; min-width: 0; }
.rp .hdr .logo-box { background: #fff; padding: 1.2mm 2.5mm; border-radius: 1mm; display: flex; align-items: center; }
.rp .hdr img { max-height: 13mm; max-width: 48mm; display: block; }
.rp .hdr .co-name { font-size: 12pt; font-weight: 700; }
.rp .hdr .co { font-size: 7.5pt; opacity: .85; margin-top: .6mm; }
.rp .hdr .ttl { text-align: right; flex: none; }
.rp h1 { font-size: 16pt; margin: 0; font-weight: 700; letter-spacing: .2px; color: #fff; }
.rp .hdr .sub { font-size: 9pt; opacity: .92; margin-top: .6mm; }
.rp .band { display: flex; flex-wrap: wrap; gap: 1.5mm 2mm; align-items: center; margin: 3mm 0 1mm; }
.rp .band .verdict, .rp .band .pill { display: inline-flex; align-items: center; gap: 1mm; padding: .8mm 2.6mm; border-radius: 4mm; font-size: 8.5pt; font-weight: 700; border: .5px solid #bbb; background: #fff; color: #333; }
.rp .band .verdict.st-ok, .rp .band .pill.st-ok { background: #e8f5ec; border-color: #7cc592; color: #17692f; }
.rp .band .verdict.st-bad, .rp .band .pill.st-bad { background: #fdecea; border-color: #e59a92; color: #a3251a; }
.rp .band .muted { color: #555; font-size: 8.5pt; margin-left: auto; }
.rp .band .muted + .muted { margin-left: 3mm; }
.rp .info { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 6mm; margin-top: 2mm; }
.rp h2 { font-size: 8pt; text-transform: uppercase; letter-spacing: .7px; color: #222; margin: 0 0 1.2mm; padding: 0 0 .8mm; font-weight: 700; border-bottom: 1.2px solid #222; break-after: avoid; page-break-after: avoid; }
.rp .sec { margin-top: 4.5mm; break-inside: auto; }
.rp h2.h2-st { display: flex; justify-content: space-between; align-items: baseline; }
.rp h2.h2-st .st { text-transform: none; letter-spacing: 0; font-size: 8.5pt; }
.rp .keep { break-inside: avoid; page-break-inside: avoid; }
.rp h3 { font-size: 9.5pt; margin: 0; font-weight: 700; break-after: avoid; }
.rp table.kv { width: 100%; border-collapse: collapse; }
.rp table.kv th, .rp table.kv td { text-align: left; vertical-align: top; padding: .8mm 1mm; border-bottom: .5px solid #dcdcdc; font-size: 8.5pt; }
.rp table.kv th { font-weight: 400; color: #555; width: 42%; }
.rp table.kv td.st-col { white-space: nowrap; }
.rp .lines div { padding: .6mm 1mm; font-size: 8.5pt; }
.rp .cols-2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0 5mm; }
.rp .units { display: grid; gap: 4mm 5mm; }
.rp .units-2 { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.rp table.kv td, .rp .kvr > span:last-child { overflow-wrap: anywhere; }
.rp [style*="grid-template-columns"] > * { min-width: 0; }
@media screen and (max-width: 640px) {
  .maintenance-print-host:not(.pdf-a4) .rp .hdr { flex-direction: column; align-items: flex-start; gap: 2mm; }
  .maintenance-print-host:not(.pdf-a4) .rp .hdr .ttl { text-align: left; }
  .maintenance-print-host:not(.pdf-a4) .rp :is(.info, .cols-2, .units-2) { grid-template-columns: minmax(0, 1fr) !important; }
}
.rp .unit { break-inside: avoid; page-break-inside: avoid; }
.rp .unit-fig { position: relative; height: 34mm; border: .5px solid #d4d4d4; margin-bottom: 1.5mm; background: #fff; }
.rp .unit-fig img { width: 100%; height: 100%; object-fit: contain; display: block; filter: grayscale(1); opacity: .85; }
.rp .chip { display: inline-block; background: #fff; border: .5px solid #888; padding: .3mm 1.2mm; font-size: 7pt; font-weight: 700; white-space: nowrap; line-height: 1.3; }
.rp .chip span { font-weight: 400; color: #555; }
.rp .chip-col { display: flex; flex-direction: column; gap: .6mm; align-items: flex-start; }
.rp .st { font-size: 8pt; font-weight: 700; }
.rp .st-ok { color: #17692f; }
.rp .st-bad { color: #a3251a; }
.rp .st-na { color: #666; font-weight: 400; }
.rp .fault-text { color: #a3251a; }
.rp .note { font-size: 8.5pt; padding: 1mm; border-bottom: .5px solid #d4d4d4; white-space: pre-wrap; }
.rp .photos { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm 5mm; margin-top: 2mm; }
.rp figure { margin: 0; break-inside: avoid; page-break-inside: avoid; }
.rp figure img { width: 100%; max-height: 70mm; object-fit: contain; border: .5px solid #d4d4d4; display: block; }
.rp figcaption { font-size: 7.5pt; color: #555; margin-top: .8mm; }

/* Komponenttikortti: otsikko + tila, sitten Tiedot- ja Mittaukset-lohkot */
.rp .cmp { margin-top: 3mm; border: .5px solid #cfcfcf; border-radius: 1mm; padding: 2mm 3mm 2.2mm; break-inside: auto; }
.rp .cmp-h { display: flex; align-items: baseline; justify-content: space-between; gap: 3mm; border-bottom: .5px solid #bbb; padding-bottom: 1mm; margin-bottom: 1mm; break-after: avoid; page-break-after: avoid; }
.rp .cmp .cmp { border: 0; border-top: .5px dashed #cfcfcf; border-radius: 0; margin-top: 2mm; padding: 1.5mm 0 0; }
.rp .cmp .cmp .cmp-h { border-bottom: 0; margin-bottom: .5mm; }
.rp .blk { break-inside: avoid; page-break-inside: avoid; margin-top: 1.2mm; }
.rp .sh { font-size: 7pt; text-transform: uppercase; letter-spacing: .7px; color: #666; font-weight: 700; margin: 0 0 .4mm; break-after: avoid; page-break-after: avoid; }
.rp .kv2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); column-gap: 6mm; }
.rp .kv2 > :not(.kvr) { grid-column: 1 / -1; }
.rp .kvr { display: grid; grid-template-columns: 44% minmax(0, 1fr); gap: 0 2mm; padding: .7mm 0; border-bottom: .5px solid #e2e2e2; font-size: 8.5pt; break-inside: avoid; }
.rp .kvr > span:first-child { color: #555; }
.rp .kvr > span:last-child { font-weight: 600; color: #111; }
.rp .kvr.wide { grid-column: 1 / -1; grid-template-columns: 22% minmax(0, 1fr); }
.rp .info .kvr, .rp .info .kvr.wide { grid-template-columns: 40% minmax(0, 1fr); }
.rp .kvr.pad { border-bottom: 0; }
.rp .kvr.full { display: block; grid-column: 1 / -1; }
.rp .kvr.chk { grid-template-columns: minmax(0, 1fr); }
.rp .kvr.chk > span:last-child, .rp .kvr.chk > span:first-child { color: #17692f; font-weight: 600; }
.rp .kvr.bad > span { color: #a3251a !important; }
.rp .warn { margin-top: 1.2mm; padding: .8mm 2mm; border-left: 2px solid #c5792b; background: #fbf4ec; font-size: 8pt; color: #7a4310; }
.rp .warn.bad { border-left-color: #a3251a; background: #fdecea; color: #a3251a; }
.rp .sec-body { font-size: 8.5pt; }
.rp .sec-body .box-content { border: .5px solid #d4d4d4; padding: 1.5mm; margin-top: 2mm; }

/* Allekirjoitus */
.rp .sigblock { margin-top: 6mm; border: .5px solid #bbb; border-radius: 1mm; padding: 2.5mm 3mm 3mm; break-inside: avoid; page-break-inside: avoid; }
.rp .sigblock .sh { margin-bottom: 1.5mm; }
.rp .sig { display: grid; grid-template-columns: 1.3fr 1fr 1.5fr 1fr 1.7fr; gap: 4mm; align-items: start; margin-top: 12mm; }
.rp .sig div { border-top: .5px solid #111; padding-top: 1mm; font-size: 7.5pt; color: #555; }
.rp .sig strong { display: block; color: #111; font-size: 9pt; font-weight: 600; margin-bottom: .4mm; min-height: 4mm; }
.rp .sig-img { max-height: 14mm; max-width: 55mm; display: block; position: relative; top: -15mm; margin-bottom: -14mm; }

/* Alatunniste kaikilla sivuilla */
@media print { @page { size: A4 portrait; margin: 12mm 13mm 17mm; @bottom-right { content: "Sivu " counter(page) " / " counter(pages); font: 7.5pt Arial, Helvetica, sans-serif; color: #555; vertical-align: top; padding-top: 3mm; } } .no-print { display: none !important; } }
/* Alatunniste: tulostuksessa @page-marginaalilaatikot (joka sivulle), näytöllä ja html2canvas-PDF:ssä rivi dokumentin lopussa. */
.rp-foot { margin-top: 5mm; padding-top: 1.2mm; border-top: .5px solid #bbb; font-size: 7.5pt; color: #555; }
.rp-foot b { color: #111; font-weight: 600; }
@media print { .rp-foot { display: none; } }

/* Muiden laitetyyppien sisältö (vanhat inline-tyylit) hillitysti: harmaa/musta, väri vain tilamerkeissä. */
.rp .legacy, .rp .legacy * { color: #1a1a1a !important; }
.rp .legacy [style*="background"] { background: transparent !important; }
.rp .legacy [style*="border"] { border-color: #d4d4d4 !important; }
.rp .legacy [style*="border:1px solid"], .rp .legacy [style*="border: 1px solid"] { border-width: 0 0 .5px 0 !important; padding: .6mm 0 !important; }
.rp .legacy [style*="border-bottom:2px"], .rp .legacy [style*="border-bottom: 2px"] { border-bottom-width: .5px !important; }
.rp .legacy [style*="border-radius"] { border-radius: 0 !important; }
.rp .legacy [style*="#16a34a"], .rp .legacy [style*="#2e7d32"], .rp .legacy [style*="#388E3C"][style*="font-weight"], .rp .legacy .st-ok { color: #17692f !important; }
.rp .legacy [style*="#dc2626"], .rp .legacy [style*="#b91c1c"], .rp .legacy [style*="#c62828"], .rp .legacy [style*="#d32f2f"], .rp .legacy [style*="color:red"], .rp .legacy .st-bad { color: #a3251a !important; }
.rp .legacy strong { font-weight: 700; text-decoration: none !important; }
/* Vanhat 'otsikko päällä, arvo laatikossa' -ruudukot → kaksi saraketta, nimi vasemmalla ja arvo oikealla. */
.rp .legacy [style*="display:grid"], .rp .legacy [style*="display: grid"] { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important; gap: 0 6mm !important; }
.rp .legacy [style*="display:grid"] > div, .rp .legacy [style*="display: grid"] > div { display: flex; justify-content: space-between; align-items: baseline; gap: 2mm; padding: .7mm 0 !important; border-bottom: .5px solid #e2e2e2 !important; text-align: left !important; break-inside: avoid; }
.rp .legacy [style*="display:grid"] > div > div:first-child, .rp .legacy [style*="display: grid"] > div > div:first-child { color: #555 !important; margin: 0 !important; }
.rp .legacy [style*="display:grid"] > div > div:last-child, .rp .legacy [style*="display: grid"] > div > div:last-child { font-weight: 600; text-align: right; }
.rp .legacy h2, .rp .legacy h3, .rp .legacy h4 { font-size: 9pt !important; margin: 3mm 0 1mm !important; break-after: avoid; page-break-after: avoid; }
.rp .legacy [style*="font-size:14px"], .rp .legacy [style*="font-size:13px"], .rp .legacy [style*="font-size:12px"], .rp .legacy [style*="font-size:16px"], .rp .legacy [style*="font-size: 14px"], .rp .legacy [style*="font-size:11pt"] { font-size: 9pt !important; }
.rp .legacy [style*="font-size:18px"], .rp .legacy [style*="font-size:20px"], .rp .legacy [style*="font-size:22px"], .rp .legacy [style*="font-size: 18px"] { font-size: 9.5pt !important; }
/* ILP-sisäyksiköt ja konvektorit: värikuva ja pehmeät tilamerkit; otsikot ja teksti hillityn harmaata/mustaa. */
.rp .tint { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.rp .tint h3 { color: #111; border-bottom: .5px solid #bbb; padding-bottom: .6mm; }
.rp .tint .unit-fig { border-color: #d4d4d4; background: #fff; }
.rp .tint .unit-fig img, .rp .tint img[src*="/assets/konvektorit/"] { filter: saturate(.75); opacity: 1; }
.rp .tint .chip { border-color: #888; }
.rp .tint table.kv th, .rp .tint table.kv td { border-bottom-color: #dcdcdc; }
.rp .tint tr.teho td { font-weight: 700; }
.rp .tint .st-ok, .rp .tint .st-bad { padding: .2mm 1.2mm; border-radius: .8mm; }
.rp .tint .st-ok { background: #e8f5ec; }
.rp .tint .st-bad { background: #fdecea; }
.rp .tint .note.fault-text { background: #fdf5f4; border-left: 2px solid #e8a39b; }
`;

function esc(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Logo valkoisella pohjalla yrityksen värisellä kaistalla; ilman logoa yrityksen nimi. */
export function renderPrintBrand(logoUrl: string | undefined, companyLine: string): string {
  const [name, ...rest] = companyLine.split(' · ');
  const lines = rest.length ? `<div class="co">${esc(rest.join(' · '))}</div>` : '';
  if (logoUrl) {
    return `<div class="brand"><div class="logo-box"><img class="logo" src="${escAttr(logoUrl)}" alt="" /></div><div>${name ? `<div class="co-name">${esc(name)}</div>` : ''}${lines}</div></div>`;
  }
  if (!name) return '';
  return `<div class="brand"><div><div class="co-name">${esc(name)}</div>${lines}</div></div>`;
}

export function renderPrintHeader(opts: { logoUrl?: string; companyLine: string; title: string; subtitle: string }): string {
  return `<header class="hdr">
    ${renderPrintBrand(opts.logoUrl, opts.companyLine) || '<div class="brand"></div>'}
    <div class="ttl"><h1>${esc(opts.title)}</h1>${opts.subtitle ? `<div class="sub">${esc(opts.subtitle)}</div>` : ''}</div>
  </header>`;
}

/** Yksirivinen tilakaista (pillit); items ovat valmista HTML:ää. */
export function renderVerdictBand(items: string[]): string {
  const list = items.filter(Boolean);
  return list.length ? `<div class="band">${list.join('')}</div>` : '';
}

export function verdictHtml(fault: boolean, ok: boolean): string {
  if (fault) return '<span class="verdict st-bad">✗ Vika havaittu</span>';
  if (ok) return '<span class="verdict st-ok">✓ Ei vikaa havaittu</span>';
  return '';
}

/** Tietosarakkeet rinnakkain (2–3), tyhjät pois. */
export function renderInfoColumns(cols: Array<{ title: string; html: string }>): string {
  const list = cols.filter((c) => c.html.trim());
  if (!list.length) return '';
  return `<div class="info keep" style="grid-template-columns:repeat(${list.length},1fr);">${list
    .map((c) => `<div><h2>${esc(c.title)}</h2>${c.html}</div>`)
    .join('')}</div>`;
}

/** Asentaja, Tukes-numero, yritys, päivämäärä ja allekirjoitus yhtenä lohkona. */
export function renderSignatureRow(opts: { name: string; tukes?: string; date: string; company?: string; signatureSrc?: string; tukesLabel?: string }): string {
  return `<div class="sigblock"><div class="sh">Huollon suorittaja</div><div class="sig">
    <div><strong>${esc(opts.name) || '&nbsp;'}</strong>Asentaja</div>
    <div><strong>${esc(opts.tukes) || '&nbsp;'}</strong>${esc(opts.tukesLabel ?? 'Tukes-numero')}</div>
    <div><strong>${esc(opts.company) || '&nbsp;'}</strong>Yritys</div>
    <div><strong>${esc(opts.date)}</strong>Päivämäärä</div>
    <div class="empty"><strong>${opts.signatureSrc ? `<img class="sig-img" src="${escAttr(opts.signatureSrc)}" alt="" />` : '&nbsp;'}</strong>Allekirjoitus</div>
  </div></div>`;
}

function cssString(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ').replace(/[<>]/g, '');
}

/**
 * Alatunniste: tulostuksessa jokaisen sivun alareunaan @page-marginaalilaatikolla (asentaja, Tukes, yritys, pvm;
 * oikealla "Sivu x / y"), muulloin rivi dokumentin lopussa.
 */
export function renderPrintFooter(opts: { name?: string; tukes?: string; company?: string; date?: string; title?: string; tukesLabel?: string }): string {
  const tl = opts.tukesLabel ?? 'Tukes';
  const plain = [
    opts.name ? `Asentaja: ${opts.name}` : '',
    opts.tukes ? `${tl}: ${opts.tukes}` : '',
    opts.company ?? '',
    opts.date ?? '',
  ].filter(Boolean);
  const parts = [
    opts.name ? `Asentaja: <b>${esc(opts.name)}</b>` : '',
    opts.tukes ? `${esc(tl)}: <b>${esc(opts.tukes)}</b>` : '',
    opts.company ? `<b>${esc(opts.company)}</b>` : '',
    opts.date ? esc(opts.date) : '',
  ].filter(Boolean);
  const margin = plain.length
    ? `<style>@media print{@page{@bottom-left{content:"${cssString(plain.join('  ·  '))}";font:7.5pt Arial,Helvetica,sans-serif;color:#555;vertical-align:top;padding-top:3mm;}}}</style>`
    : '';
  return `${margin}<div class="rp-foot">${parts.join(' &nbsp;·&nbsp; ')}</div>`;
}

/** Yrityksen väri tulosteen kaistaan; liian vaalea tummennetaan, jotta valkoinen teksti näkyy. */
export function printBrandStyle(color?: string): string {
  const c = normalizeBrandColor(color);
  return c ? `<style>.rp{--brand:${c}}</style>` : '';
}

export function normalizeBrandColor(color?: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(color ?? '').trim());
  if (!m) return null;
  let r = parseInt(m[1].slice(0, 2), 16);
  let g = parseInt(m[1].slice(2, 4), 16);
  let b = parseInt(m[1].slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (lum > 0.5) {
    const k = 0.5 / lum;
    r = Math.round(r * k); g = Math.round(g * k); b = Math.round(b * k);
  }
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

const VOID_TAGS = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'col', 'source', 'wbr']);

/** Jakaa HTML:n ensimmäiseen ylätason elementtiin ja loppuun (kevyt tagilaskenta). */
export function splitFirstBlock(html: string): [string, string] {
  const s = html.replace(/^\s+/, '');
  if (!s.startsWith('<')) return ['', html];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)[^>]*?(\/?)>/g;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const tag = m[2].toLowerCase();
    if (VOID_TAGS.has(tag) || m[3] === '/') {
      if (depth === 0) return [s.slice(0, re.lastIndex), s.slice(re.lastIndex)];
      continue;
    }
    depth += m[1] ? -1 : 1;
    if (depth === 0) return [s.slice(0, re.lastIndex), s.slice(re.lastIndex)];
  }
  return ['', html];
}

/** Tyhjiä (sisällöttömiä) alkulohkoja ei lasketa ensimmäiseksi sisällöksi. */
function isEmptyBlock(block: string): boolean {
  return !/<img\b/i.test(block) && !block.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').trim();
}

/**
 * Otsikko pysyy ensimmäisen sisältölohkon (tai ensimmäisen kuvarivin) kanssa samalla sivulla.
 * Kuvaruudukosta irrotetaan kaksi ensimmäistä kuvaa otsikon kanssa.
 */
export function keepHeadingWithFirst(headingHtml: string, inner: string): string {
  let lead = '';
  let rest = inner;
  for (let i = 0; i < 4; i++) {
    const [first, after] = splitFirstBlock(rest);
    if (!first) break;
    if (isEmptyBlock(first)) {
      lead += first;
      rest = after;
      continue;
    }
    if (/^<div class="photos">/.test(first)) {
      const body = first.slice('<div class="photos">'.length, -'</div>'.length);
      const [f1, r1] = splitFirstBlock(body);
      const [f2, r2] = splitFirstBlock(r1);
      const row = `<div class="photos">${f1}${f2}</div>`;
      const remaining = r2.trim() ? `<div class="photos">${r2}</div>` : '';
      return `<div class="keep">${headingHtml}${lead}${row}</div>${remaining}${after}`;
    }
    return `<div class="keep">${headingHtml}${lead}${first}</div>${after}`;
  }
  return `<div class="keep">${headingHtml}</div>${inner}`;
}

/* ---------- Työraportit ja tarjoukset: sama hillitty tyyli olemassa oleviin HTML-pohjiin ---------- */

/** Brändi-/korostusvärit → musta/harmaa. Vihreä ja punainen tilaväri säilyvät. */
const COLOR_MAP: Record<string, string> = {
  // korostus- ja otsikkovärit
  '#1d4ed8': '#111', '#1e3a8a': '#111', '#2f6aa8': '#333', '#1e3a5f': '#111', '#072855': '#111',
  '#1f4e79': '#111', '#f97316': '#333', '#c2410c': '#333', '#9a3412': '#333', '#b45309': '#333',
  '#92400e': '#333', '#d4a574': '#999', '#c62828': '#111', '#f0810f': '#111', '#d97706': '#111',
  // sävytetyt taustat → valkoinen
  '#fffbeb': '#fff', '#fee2e2': '#fff', '#f0fdf4': '#fff', '#ecfdf5': '#fff', '#eef2ff': '#fff',
  '#fff7ed': '#fff', '#fffbf5': '#fff', '#dbeafe': '#f3f3f3', '#eff6ff': '#f3f3f3',
  // neutraalit vaaleat taustat → vaalea harmaa
  '#f8fafc': '#f3f3f3', '#f1f5f9': '#f3f3f3', '#f3f4f6': '#f3f3f3', '#f9fafb': '#f3f3f3', '#f7f7f7': '#f3f3f3',
  // reunat
  '#cbd5e1': '#d4d4d4', '#94a3b8': '#999', '#fdba74': '#d4d4d4', '#c7d2fe': '#d4d4d4', '#86efac': '#d4d4d4',
  '#34d399': '#d4d4d4', '#dbe3ee': '#d4d4d4', '#e2e8f0': '#d4d4d4', '#e5e7eb': '#d4d4d4', '#d0d7de': '#d4d4d4',
  // tekstin harmaat
  '#64748b': '#555', '#475569': '#444', '#334155': '#333', '#0f172a': '#111', '#111827': '#111',
  '#1f2937': '#111', '#374151': '#333', '#6b7280': '#555',
};

function restrainCssText(css: string): string {
  return css
    .replace(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g, (hex) => COLOR_MAP[hex.toLowerCase()] ?? hex)
    .replace(/border-radius\s*:\s*[^;"}]+/gi, 'border-radius:0')
    .replace(/box-shadow\s*:\s*[^;"}]+/gi, 'box-shadow:none')
    .replace(/\b([2-9](?:\.\d+)?)px\s+(solid|dashed|dotted)/gi, '1px solid')
    .replace(/\b(dashed|dotted)\b/gi, 'solid');
}

const RESTRAINED_DOC_CSS = `
  @page { size: A4 portrait; margin: 12mm 13mm; }
  body.rp-doc { font-family: Arial, Helvetica, sans-serif !important; color: #111; }
  body.rp-doc h1, body.rp-doc h2, body.rp-doc h3, body.rp-doc h4,
  body.rp-doc .print-box-title, body.rp-doc .sec-h2, body.rp-doc .doc-label, body.rp-doc thead {
    break-after: avoid; page-break-after: avoid;
  }
  body.rp-doc tr, body.rp-doc figure { break-inside: avoid; page-break-inside: avoid; }
  body.rp-doc .print-box-title, body.rp-doc .sec-h2 {
    font-size: 8pt !important; text-transform: uppercase; letter-spacing: .6px; color: #333 !important;
    background: #efefef !important; border: 0 !important; padding: 1mm 2mm !important; text-align: left !important; margin: 0 0 1.5mm !important;
  }
  body.rp-doc .print-box { border: 0 !important; border-radius: 0 !important; margin-bottom: 4mm !important; overflow: visible !important; }
  body.rp-doc .print-box-body { padding: 0 1mm !important; }
  body.rp-doc table th, body.rp-doc table td { border-color: #d4d4d4 !important; }
  body.rp-doc img { box-shadow: none !important; }
  body.rp-doc .summary-head, body.rp-doc .lk-header-top { border-bottom: 1.5px solid #111 !important; }
  body.rp-doc .summary-title-block { text-align: right !important; }
  body.rp-doc .lk-tagline { font-size: 8pt !important; color: #555 !important; background: none !important; border: 0 !important; padding: 1mm 0 !important; margin: 0 !important; text-align: left !important; }
  body.rp-doc .rp-hide { display: none !important; }
  body.rp-doc .print-box { break-inside: auto !important; page-break-inside: auto !important; }
  body.rp-doc .lk-header-top, body.rp-doc .lk-logo { justify-content: flex-start !important; justify-items: start !important; text-align: left !important; margin-left: 0 !important; }
  body.rp-doc .lk-logo img { margin: 0 !important; }
  body.rp-doc .header.header--termatek { background: #fff !important; height: auto !important; padding: 0 0 2mm !important; justify-content: flex-start !important; border-bottom: 1.5px solid #111 !important; }
  body.rp-doc .header.header--termatek .brand-banner { height: 12mm !important; width: auto !important; }
  body.rp-doc .footer.footer--bar { display: none !important; }
`;

/** Yksinkertaiset h1/h2-pohjat (esim. kumppanin laskutusyhteenveto) samaan otsikkotyyliin. */
const PLAIN_HEADINGS_CSS = `
  body.rp-doc h1 { font-size: 15pt; margin: 2mm 0 1mm; padding-bottom: 2mm; border-bottom: 1.5px solid #111; }
  body.rp-doc h2 { font-size: 8pt; text-transform: uppercase; letter-spacing: .6px; color: #333; background: #efefef; padding: 1mm 2mm; margin: 5mm 0 1.5mm; }
  body.rp-doc table { font-size: 8.5pt; }
`;

/**
 * Hillitty tyyli olemassa olevaan tulostedokumenttiin: värit ja pyöristykset tyylimäärittelyistä,
 * yhteinen lisätyylitiedosto ja otsikot sisältönsä kanssa. Ei muuta tekstiä eikä summia.
 */
export function restrainPrintHtml(html: string, opts: { hideTagline?: boolean; plainHeadings?: boolean } = {}): string {
  let out = html
    .replace(/<style>([\s\S]*?)<\/style>/g, (_m, css: string) => `<style>${restrainCssText(css)}</style>`)
    .replace(/style="([^"]*)"/g, (_m, css: string) => `style="${restrainCssText(css)}"`);
  const extra = `<style>${RESTRAINED_DOC_CSS}${opts.hideTagline ? 'body.rp-doc .lk-tagline{display:none !important;}' : ''}${opts.plainHeadings ? PLAIN_HEADINGS_CSS : ''}</style>`;
  out = out.includes('</head>') ? out.replace('</head>', `${extra}</head>`) : `${extra}${out}`;
  out = /<body([^>]*)class="/.test(out)
    ? out.replace(/<body([^>]*)class="/, '<body$1class="rp-doc ')
    : out.replace(/<body(\s|>)/, '<body class="rp-doc"$1');
  return out;
}
