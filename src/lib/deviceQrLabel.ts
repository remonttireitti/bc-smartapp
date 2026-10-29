import QRCode from 'qrcode';
import { devicePublicUrl } from './devicePublicCard';

/**
 * QR-tarra Dymo XTL 300 -tulostimelle: 24 mm leveä jatkuva XTL-teippi (All-Purpose Vinyl 1868753).
 * Tarra on vaaka-asennossa 60 × 24 mm (pituus × teipin leveys), marginaali 1 mm, QR 22 mm korkea.
 * PNG ladataan 300 dpi:llä (709 × 283 px), jolloin DYMO ID tuo sen täsmälleen oikeankokoisena.
 */
export const DEVICE_QR_LABEL_TAGLINE = 'Sähköinen huoltopöytäkirja – ylläpitää BC Smartapp';
export const DEVICE_QR_LABEL = { widthMm: 24, lengthMm: 60, padMm: 1, gapMm: 2, dpi: 300 } as const;
const QR_QUIET_MODULES = 2;
const TAGLINE_PT = 6.5;
const TUNNUS_SIZES_PT = [20, 16, 13, 11, 9];

/** token = laitteen QR-koodi; url = valmis osoite (esim. kylmäainepullo); tagline = tarran pieni teksti. */
export type DeviceQrLabelItem = { token?: string; url?: string; name: string | null; tag: string | null; tagline?: string };

function itemUrl(item: DeviceQrLabelItem, origin?: string): string {
  if (item.url) return item.url;
  if (!item.token) throw new Error('QR-linkki puuttuu.');
  return devicePublicUrl(item.token, origin);
}

function esc(v: string): string {
  return v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Tarran iso teksti: laitteen tunnus (tag), muuten nimi; max 28 merkkiä. */
export function deviceQrShortName(item: Pick<DeviceQrLabelItem, 'name' | 'tag'>): string {
  const raw = item.tag?.trim() || item.name?.trim() || 'Laite';
  return raw.length > 28 ? `${raw.slice(0, 27)}…` : raw;
}

const qrBoxMm = () => DEVICE_QR_LABEL.widthMm - 2 * DEVICE_QR_LABEL.padMm;
const textXMm = () => DEVICE_QR_LABEL.padMm + qrBoxMm() + DEVICE_QR_LABEL.gapMm;
const textWidthMm = () => DEVICE_QR_LABEL.lengthMm - textXMm() - DEVICE_QR_LABEL.padMm;

/** Rivitys annetulla leveysmitalla (mm); liian pitkä sana katkaistaan merkeittäin. */
function wrapLines(text: string, maxMm: number, width: (s: string) => number): string[] {
  const lines: string[] = [];
  let cur = '';
  const push = (w: string) => {
    let word = w;
    while (width(word) > maxMm && word.length > 1) {
      let n = word.length - 1;
      while (n > 1 && width(word.slice(0, n)) > maxMm) n -= 1;
      if (cur) { lines.push(cur); cur = ''; }
      lines.push(word.slice(0, n));
      word = word.slice(n);
    }
    const next = cur ? `${cur} ${word}` : word;
    if (cur && width(next) > maxMm) { lines.push(cur); cur = word; } else cur = next;
  };
  for (const w of text.split(/\s+/).filter(Boolean)) push(w);
  if (cur) lines.push(cur);
  return lines;
}

export type DeviceQrLabelText = {
  tunnusPt: number;
  tunnus: Array<{ text: string; yMm: number }>;
  tagPt: number;
  tag: Array<{ text: string; yMm: number }>;
};

const PT_MM = 25.4 / 72;

/** Teksti- ja rivipaikat (baseline, mm) — sama asettelu PNG:lle ja PDF:lle. */
export function layoutDeviceQrLabelText(
  tunnusText: string,
  measure: (text: string, pt: number, bold: boolean) => number,
  tagline: string = DEVICE_QR_LABEL_TAGLINE,
): DeviceQrLabelText {
  const maxW = textWidthMm();
  const avail = qrBoxMm();
  const tagLines = wrapLines(tagline, maxW, (s) => measure(s, TAGLINE_PT, false)).slice(0, 3);
  const tagH = tagLines.length * TAGLINE_PT * PT_MM * 1.2;
  let chosen = { pt: TUNNUS_SIZES_PT[TUNNUS_SIZES_PT.length - 1], lines: [tunnusText] };
  for (const pt of TUNNUS_SIZES_PT) {
    const lines = wrapLines(tunnusText, maxW, (s) => measure(s, pt, true));
    const h = lines.length * pt * PT_MM * 1.1 + 1.2 + tagH;
    chosen = { pt, lines: lines.slice(0, 2) };
    if (lines.length <= 2 && h <= avail) break;
  }
  const tunnusLineH = chosen.pt * PT_MM * 1.1;
  const totalH = chosen.lines.length * tunnusLineH + 1.2 + tagH;
  let y = DEVICE_QR_LABEL.padMm + (avail - totalH) / 2;
  const tunnus = chosen.lines.map((text) => {
    y += tunnusLineH;
    return { text, yMm: y - tunnusLineH * 0.2 };
  });
  y += 1.2;
  const tagLineH = TAGLINE_PT * PT_MM * 1.2;
  const tag = tagLines.map((text) => {
    y += tagLineH;
    return { text, yMm: y - tagLineH * 0.22 };
  });
  return { tunnusPt: chosen.pt, tunnus, tagPt: TAGLINE_PT, tag };
}

function qrModules(url: string) {
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
  return { size: qr.modules.size as number, data: qr.modules.data as ArrayLike<number> };
}

/** Tulostus: yksi tarra = yksi 60 × 24 mm sivu (jatkuva teippi, ei marginaaleja). */
export async function buildDeviceQrLabelsHtml(items: DeviceQrLabelItem[], origin?: string): Promise<string> {
  const { widthMm: W, lengthMm: L, padMm, gapMm } = DEVICE_QR_LABEL;
  const labels = await Promise.all(
    items.map(async (item) => {
      const svg = await QRCode.toString(itemUrl(item, origin), {
        type: 'svg', margin: QR_QUIET_MODULES, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' },
      });
      const name = deviceQrShortName(item);
      const len = name.length;
      const pt = len <= 8 ? 20 : len <= 12 ? 16 : len <= 18 ? 13 : len <= 24 ? 11 : 9;
      return `<div class="qr-label"><div class="qr-code">${svg}</div><div class="qr-text"><strong style="font-size:${pt}pt">${esc(name)}</strong><span>${esc(item.tagline ?? DEVICE_QR_LABEL_TAGLINE)}</span></div></div>`;
    }),
  );
  return `<!doctype html><html lang="fi"><head><meta charset="utf-8"><title>QR-tarrat</title><style>
@page { size: ${L}mm ${W}mm; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; font-family: Arial, Helvetica, sans-serif; color: #000; }
.qr-label { width: ${L}mm; height: ${W}mm; padding: ${padMm}mm; display: flex; gap: ${gapMm}mm; align-items: center; page-break-after: always; break-after: page; overflow: hidden; background: #fff; }
.qr-label:last-child { page-break-after: auto; break-after: auto; }
.qr-code { width: ${W - 2 * padMm}mm; height: ${W - 2 * padMm}mm; flex: 0 0 ${W - 2 * padMm}mm; }
.qr-code svg { width: 100%; height: 100%; display: block; shape-rendering: crispEdges; }
.qr-text { display: flex; flex-direction: column; gap: 1.2mm; min-width: 0; flex: 1 1 auto; overflow-wrap: anywhere; }
.qr-text strong { line-height: 1.1; font-weight: 700; }
.qr-text span { font-size: ${TAGLINE_PT}pt; line-height: 1.2; }
@media screen { body { background: #eee; padding: 8px; } .qr-label { margin: 0 auto 8px; outline: 1px dashed #999; } }
</style></head><body>${labels.join('')}</body></html>`;
}

function crc32(bytes: Uint8Array): number {
  let c: number;
  let crc = 0xffffffff;
  for (let n = 0; n < bytes.length; n += 1) {
    c = (crc ^ bytes[n]) & 0xff;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Lisää PNG:hen pHYs-lohko (300 dpi), jotta DYMO ID tuo kuvan fyysisessä koossa. */
export function pngWithDpi(png: Uint8Array, dpi: number): Uint8Array {
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // 'pHYs'
  dv.setUint32(8, ppm);
  dv.setUint32(12, ppm);
  chunk[16] = 1; // metre
  dv.setUint32(17, crc32(chunk.subarray(4, 17)));
  // Lisää heti IHDR:n (8 + 25 tavua) jälkeen.
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, 33), 0);
  out.set(chunk, 33);
  out.set(png.subarray(33), 33 + chunk.length);
  return out;
}

/** PNG täsmälleen 60 × 24 mm @ 300 dpi (709 × 283 px), terävät QR-moduulit kokonaisin pikselein. */
export async function renderDeviceQrLabelPng(item: DeviceQrLabelItem, origin?: string): Promise<Blob> {
  const { widthMm: W, lengthMm: L, padMm, dpi } = DEVICE_QR_LABEL;
  const px = (mm: number) => (mm * dpi) / 25.4;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(px(L));
  canvas.height = Math.round(px(W));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas ei käytettävissä.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;

  const qr = qrModules(itemUrl(item, origin));
  const total = qr.size + 2 * QR_QUIET_MODULES;
  const boxPx = Math.floor(px(qrBoxMm()));
  const modulePx = Math.max(1, Math.floor(boxPx / total));
  const qrPx = modulePx * total;
  const x0 = Math.round(px(padMm)) + Math.floor((boxPx - qrPx) / 2) + QR_QUIET_MODULES * modulePx;
  const y0 = Math.round(px(padMm)) + Math.floor((boxPx - qrPx) / 2) + QR_QUIET_MODULES * modulePx;
  ctx.fillStyle = '#000000';
  for (let r = 0; r < qr.size; r += 1) {
    for (let c = 0; c < qr.size; c += 1) {
      if (qr.data[r * qr.size + c]) ctx.fillRect(x0 + c * modulePx, y0 + r * modulePx, modulePx, modulePx);
    }
  }

  const fontPx = (pt: number) => (pt * dpi) / 72;
  const layout = layoutDeviceQrLabelText(deviceQrShortName(item), (text, pt, bold) => {
    ctx.font = `${bold ? 'bold ' : ''}${fontPx(pt)}px Arial, Helvetica, sans-serif`;
    return (ctx.measureText(text).width * 25.4) / dpi;
  }, item.tagline);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#000000';
  const tx = px(textXMm());
  ctx.font = `bold ${fontPx(layout.tunnusPt)}px Arial, Helvetica, sans-serif`;
  for (const l of layout.tunnus) ctx.fillText(l.text, tx, px(l.yMm));
  ctx.font = `${fontPx(layout.tagPt)}px Arial, Helvetica, sans-serif`;
  for (const l of layout.tag) ctx.fillText(l.text, tx, px(l.yMm));

  const raw: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!raw) throw new Error('PNG:n luonti epäonnistui.');
  const bytes = pngWithDpi(new Uint8Array(await raw.arrayBuffer()), dpi);
  return new Blob([bytes.buffer as ArrayBuffer], { type: "image/png" });
}

/** PDF täsmälleen 60 × 24 mm (vektori: QR-moduulit ja teksti). */
export async function renderDeviceQrLabelPdf(item: DeviceQrLabelItem, origin?: string): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const { widthMm: W, lengthMm: L, padMm } = DEVICE_QR_LABEL;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [L, W] });
  doc.setFillColor(0, 0, 0);
  const qr = qrModules(itemUrl(item, origin));
  const total = qr.size + 2 * QR_QUIET_MODULES;
  const mod = qrBoxMm() / total;
  const x0 = padMm + QR_QUIET_MODULES * mod;
  const y0 = padMm + QR_QUIET_MODULES * mod;
  for (let r = 0; r < qr.size; r += 1) {
    for (let c = 0; c < qr.size; c += 1) {
      if (qr.data[r * qr.size + c]) doc.rect(x0 + c * mod, y0 + r * mod, mod + 0.005, mod + 0.005, 'F');
    }
  }
  const layout = layoutDeviceQrLabelText(deviceQrShortName(item), (text, pt, bold) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(pt);
    return doc.getTextWidth(text);
  }, item.tagline);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(layout.tunnusPt);
  for (const l of layout.tunnus) doc.text(l.text, textXMm(), l.yMm);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(layout.tagPt);
  for (const l of layout.tag) doc.text(l.text, textXMm(), l.yMm);
  return doc.output('blob');
}

export function deviceQrLabelFileName(item: Pick<DeviceQrLabelItem, 'name' | 'tag'>, ext: 'png' | 'pdf'): string {
  const base = deviceQrShortName(item).toLowerCase().replace(/[^a-z0-9äöå]+/gi, '-').replace(/^-+|-+$/g, '') || 'laite';
  return `qr-tarra-${base}.${ext}`;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
