/** iOS-kotivalikkosovellus (standalone PWA): window.print() ei toimi → tehdään oikea PDF. */
export function shouldUsePdfExport(): boolean {
  if (typeof window === 'undefined') return false;
  if (new URLSearchParams(window.location.search).get('pdf') === '1') return true;
  const nav = navigator as Navigator & { standalone?: boolean };
  const ios = /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  const standalone = nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
  return Boolean(ios && standalone) || typeof window.print !== 'function';
}

const A4_W_MM = 210;
const A4_H_MM = 297;
const MARGIN_MM = 12;
const RENDER_W_PX = 760; // ≈ A4 sisäleveys 96 dpi

/** Renderöi elementin A4-sivuiksi; sivunvaihdot rivien/lohkojen rajoille. */
export async function renderElementToPdf(source: HTMLElement, fileName: string): Promise<File> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')]);
  const holder = document.createElement('div');
  holder.style.cssText = `position:fixed;left:-10000px;top:0;width:${RENDER_W_PX}px;background:#fff;`;
  holder.className = 'pdf-export-holder';
  const clone = source.cloneNode(true) as HTMLElement;
  clone.classList.add('pdf-a4');
  clone.querySelectorAll('img').forEach((img) => { img.loading = 'eager'; img.decoding = 'sync'; img.style.filter = 'none'; });
  holder.appendChild(clone);
  document.body.appendChild(holder);
  try {
    await Promise.all([...holder.querySelectorAll('img')].map((img) => (img.complete && img.naturalWidth ? img.decode?.().catch(() => null) : new Promise((r) => { img.onload = img.onerror = () => r(null); window.setTimeout(() => r(null), 8000); }))));
    const top = holder.getBoundingClientRect().top;
    const breaks = new Set<number>();
    holder.querySelectorAll('tr, .keep, .sec, .unit, h2, h3, p, .kvr, section, .print-box, table, img').forEach((el) => {
      const r = el.getBoundingClientRect();
      breaks.add(Math.round(r.top - top));
    });
    const scale = 2;
    const canvas = await html2canvas(holder, { scale, useCORS: true, backgroundColor: '#ffffff', windowWidth: RENDER_W_PX });
    const pageWmm = A4_W_MM - 2 * MARGIN_MM;
    const pageHmm = A4_H_MM - 2 * MARGIN_MM;
    const pxPerMm = canvas.width / scale / pageWmm;
    const pageHpx = Math.floor(pageHmm * pxPerMm);
    const totalH = canvas.height / scale;
    const sorted = [...breaks].filter((y) => y > 0 && y < totalH).sort((a, b) => a - b);
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    let y = 0;
    let first = true;
    while (y < totalH - 1) {
      let end = Math.min(totalH, y + pageHpx);
      if (end < totalH) {
        const candidates = sorted.filter((b) => b > y + pageHpx * 0.5 && b <= end);
        if (candidates.length) end = candidates[candidates.length - 1];
      }
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = Math.ceil((end - y) * scale);
      slice.getContext('2d')!.drawImage(canvas, 0, -y * scale);
      if (!first) pdf.addPage();
      first = false;
      pdf.addImage(slice.toDataURL('image/jpeg', 0.9), 'JPEG', MARGIN_MM, MARGIN_MM, pageWmm, (end - y) / pxPerMm);
      y = end;
    }
    const blob = pdf.output('blob');
    return new File([blob], `${fileName.replace(/[\\/:*?"<>|]+/g, '-')}.pdf`, { type: 'application/pdf' });
  } finally {
    holder.remove();
  }
}

/** Jaa (iOS jakovalikko: Tulosta, Tallenna tiedostoihin…) tai lataa. */
export async function shareOrDownloadPdf(file: File): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: file.name });
      return 'shared';
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'downloaded';
}
