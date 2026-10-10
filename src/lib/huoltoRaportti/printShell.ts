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
