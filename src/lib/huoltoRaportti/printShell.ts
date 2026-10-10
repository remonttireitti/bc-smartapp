/** Yhteinen hillitty A4-tulostetyyli kaikille huoltopöytäkirjoille (ILP, chiller, konvektorit, …). */
export const PRINT_SHELL_CSS = `
.rp { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; line-height: 1.35; color: #111; background: #fff; }
.rp * { box-sizing: border-box; }
.rp .hdr { display: grid; grid-template-columns: 1fr auto; align-items: end; gap: 8mm; padding-bottom: 3mm; border-bottom: 1.5px solid #111; }
.rp .hdr img { max-height: 14mm; max-width: 55mm; display: block; }
.rp .hdr .co { font-size: 8pt; color: #555; margin-top: 1mm; }
.rp .hdr .ttl { text-align: right; }
.rp h1 { font-size: 15pt; margin: 0; font-weight: 700; letter-spacing: .2px; }
.rp .hdr .sub { font-size: 9pt; color: #444; margin-top: .5mm; }
.rp .band { display: flex; flex-wrap: wrap; gap: 2mm 6mm; align-items: center; margin: 3mm 0; padding: 2mm 3mm; border: 1px solid #bbb; border-left: 3px solid #111; }
.rp .band .verdict { font-size: 10.5pt; font-weight: 700; }
.rp .band .muted { color: #555; }
.rp .info { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0 5mm; }
.rp .info h2, .rp .sec h2 { font-size: 8pt; text-transform: uppercase; letter-spacing: .6px; color: #333; background: #efefef; margin: 0 0 1.5mm; padding: 1mm 2mm; font-weight: 700; break-after: avoid; page-break-after: avoid; }
.rp .sec { margin-top: 4mm; break-inside: auto; }
.rp .keep { break-inside: avoid; page-break-inside: avoid; }
.rp h3 { font-size: 9pt; margin: 0 0 1mm; font-weight: 700; break-after: avoid; }
.rp table.kv { width: 100%; border-collapse: collapse; }
.rp table.kv th, .rp table.kv td { text-align: left; vertical-align: top; padding: .9mm 1mm; border-bottom: .5px solid #d4d4d4; font-size: 8.5pt; }
.rp table.kv th { font-weight: 400; color: #555; width: 42%; }
.rp table.kv td.st-col { white-space: nowrap; }
.rp .lines div { padding: .6mm 1mm; font-size: 8.5pt; }
.rp .cols-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 5mm; }
.rp .units { display: grid; gap: 4mm 5mm; }
.rp .units-2 { grid-template-columns: 1fr 1fr; }
.rp .unit { break-inside: avoid; page-break-inside: avoid; }
.rp .unit-fig { position: relative; height: 34mm; border: .5px solid #d4d4d4; margin-bottom: 1.5mm; background: #fff; }
.rp .unit-fig img { width: 100%; height: 100%; object-fit: contain; display: block; filter: grayscale(1); opacity: .85; }
.rp .chip { display: inline-block; background: #fff; border: .5px solid #888; padding: .3mm 1.2mm; font-size: 7pt; font-weight: 700; white-space: nowrap; line-height: 1.3; }
.rp .chip span { font-weight: 400; color: #555; }
.rp .chip-col { display: flex; flex-direction: column; gap: .6mm; align-items: flex-start; }
.rp .st { font-size: 8pt; font-weight: 700; }
.rp .st-ok { color: #1b7f3b; }
.rp .st-bad { color: #b42318; }
.rp .st-na { color: #666; font-weight: 400; }
.rp .fault-text { color: #b42318; }
.rp .note { font-size: 8.5pt; padding: 1mm; border-bottom: .5px solid #d4d4d4; white-space: pre-wrap; }
.rp .photos { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm 5mm; margin-top: 2mm; }
.rp figure { margin: 0; break-inside: avoid; page-break-inside: avoid; }
.rp figure img { width: 100%; max-height: 70mm; object-fit: contain; border: .5px solid #d4d4d4; display: block; }
.rp figcaption { font-size: 7.5pt; color: #555; margin-top: .8mm; }
.rp .sign { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6mm; margin-top: 8mm; break-inside: avoid; page-break-inside: avoid; }
.rp .sign div { border-top: .5px solid #111; padding-top: 1mm; font-size: 8pt; color: #555; }
.rp .sign strong { display: block; color: #111; font-size: 9pt; font-weight: 400; min-height: 4mm; }
@media print { @page { size: A4 portrait; margin: 12mm 13mm; } .no-print { display: none !important; } }

/* Muiden laitetyyppien sisältö (vanhat inline-tyylit) hillitysti: harmaa/musta, väri vain tilamerkeissä. */
.rp .legacy, .rp .legacy * { color: #111 !important; }
.rp .legacy [style*="background"] { background: transparent !important; }
.rp .legacy [style*="border"] { border-color: #d4d4d4 !important; }
.rp .legacy [style*="border-bottom:2px"], .rp .legacy [style*="border-bottom: 2px"] { border-bottom-width: .5px !important; }
.rp .legacy [style*="border-radius"] { border-radius: 0 !important; }
.rp img[src*="/assets/konvektorit/"] { filter: grayscale(1); opacity: .85; }
.rp .legacy [style*="#16a34a"], .rp .legacy [style*="#2e7d32"], .rp .legacy [style*="#388E3C"][style*="font-weight"], .rp .legacy .st-ok { color: #1b7f3b !important; }
.rp .legacy [style*="#dc2626"], .rp .legacy [style*="#b91c1c"], .rp .legacy [style*="#c62828"], .rp .legacy [style*="#d32f2f"], .rp .legacy [style*="color:red"], .rp .legacy .st-bad { color: #b42318 !important; }
.rp .legacy strong { font-weight: 700; }
.rp .legacy h2, .rp .legacy h3, .rp .legacy h4 { font-size: 9pt !important; margin: 3mm 0 1mm !important; break-after: avoid; page-break-after: avoid; }
.rp .legacy [style*="font-size:14px"], .rp .legacy [style*="font-size:13px"], .rp .legacy [style*="font-size:12px"], .rp .legacy [style*="font-size:16px"], .rp .legacy [style*="font-size: 14px"], .rp .legacy [style*="font-size:11pt"] { font-size: 9pt !important; }
.rp .legacy [style*="font-size:18px"], .rp .legacy [style*="font-size:20px"], .rp .legacy [style*="font-size:22px"] { font-size: 10pt !important; }
.rp .kvr { display: grid; grid-template-columns: 42% 1fr; gap: 0 2mm; padding: .9mm 1mm; border-bottom: .5px solid #d4d4d4; font-size: 8.5pt; }
.rp .kvr > span:first-child { color: #555; }
.rp .kvr.full { display: block; }
.rp .sec-body { font-size: 8.5pt; }
.rp .sec-body .box-content { border: .5px solid #d4d4d4; padding: 1.5mm; margin-top: 2mm; }
`;

function esc(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function renderPrintHeader(opts: { logoUrl?: string; companyLine: string; title: string; subtitle: string }): string {
  const logo = opts.logoUrl ? `<img src="${escAttr(opts.logoUrl)}" alt="" />` : '';
  return `<header class="hdr">
    <div>${logo}${opts.companyLine ? `<div class="co">${esc(opts.companyLine)}</div>` : ''}</div>
    <div class="ttl"><h1>${esc(opts.title)}</h1>${opts.subtitle ? `<div class="sub">${esc(opts.subtitle)}</div>` : ''}</div>
  </header>`;
}

/** Yksirivinen tilakaista; items ovat valmista HTML:ää. */
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

export function renderSignatureRow(opts: { name: string; tukes?: string; date: string }): string {
  return `<div class="sign">
    <div><strong>${esc(opts.name)}</strong>Suorittaja${opts.tukes ? ` · TUKES ${esc(opts.tukes)}` : ''}</div>
    <div><strong>${esc(opts.date)}</strong>Päivämäärä</div>
    <div><strong></strong>Allekirjoitus</div>
  </div>`;
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
