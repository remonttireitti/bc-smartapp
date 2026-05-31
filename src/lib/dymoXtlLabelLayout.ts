import QRCode from 'qrcode';

import { formatBottleLabel, formatBottleSizeLabel } from './refrigerantBottle';
import { buildCylinderScanUrl } from './refrigerantCylinderCode';
import type { RefrigerantCylinder } from '../types/inventory';

/** DYMO XTL 300: 24 mm jatkoteippi, oletuspituus 51 mm (General). */
export const DYMO_XTL_LABEL_WIDTH_MM = 24;
export const DYMO_XTL_LABEL_HEIGHT_MM = 51;
export const DYMO_XTL_LABEL_DPI = 300;

export type DymoXtlLabelContent = {
  title: string;
  size: string;
  companyLine: string;
  qrUrl: string;
  qrDataUrl: string;
  pngDataUrl: string;
  widthPx: number;
  heightPx: number;
};

export function mmToPx(mm: number, dpi = DYMO_XTL_LABEL_DPI): number {
  return Math.round((mm / 25.4) * dpi);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Tarrakuvan lataus epäonnistui'));
    img.src = src;
  });
}

export async function buildDymoXtlLabelContent(
  cylinder: RefrigerantCylinder,
  options?: { companyName?: string | null },
): Promise<DymoXtlLabelContent> {
  const qrUrl = buildCylinderScanUrl(cylinder.id);
  const title = formatBottleLabel(cylinder);
  const size = formatBottleSizeLabel(cylinder.bottle_size);
  const companyLine = (options?.companyName || '').trim();

  const widthPx = mmToPx(DYMO_XTL_LABEL_WIDTH_MM);
  const heightPx = mmToPx(DYMO_XTL_LABEL_HEIGHT_MM);
  const qrSizePx = mmToPx(18);

  const qrDataUrl = await QRCode.toDataURL(qrUrl, {
    width: qrSizePx,
    margin: 0,
    errorCorrectionLevel: 'M',
  });

  const canvas = document.createElement('canvas');
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas ei käytettävissä');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, widthPx, heightPx);

  const qrImg = await loadImage(qrDataUrl);
  const qrX = Math.round((widthPx - qrSizePx) / 2);
  const qrY = mmToPx(2.5);
  ctx.drawImage(qrImg, qrX, qrY, qrSizePx, qrSizePx);

  const textY = qrY + qrSizePx + mmToPx(1.5);
  const maxTextWidth = widthPx - mmToPx(2);

  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  ctx.font = `bold ${Math.round(mmToPx(2.8))}px Arial, Helvetica, sans-serif`;
  wrapCenterText(ctx, title, widthPx / 2, textY, maxTextWidth, mmToPx(3.2));

  ctx.font = `${Math.round(mmToPx(2.2))}px Arial, Helvetica, sans-serif`;
  const sizeY = textY + measureWrappedHeight(ctx, title, maxTextWidth, mmToPx(3.2)) + mmToPx(0.8);
  ctx.fillText(size, widthPx / 2, sizeY);

  if (companyLine) {
    ctx.font = `${Math.round(mmToPx(1.8))}px Arial, Helvetica, sans-serif`;
    ctx.fillStyle = '#333333';
    ctx.fillText(companyLine, widthPx / 2, sizeY + mmToPx(3));
  }

  return {
    title,
    size,
    companyLine,
    qrUrl,
    qrDataUrl,
    pngDataUrl: canvas.toDataURL('image/png'),
    widthPx,
    heightPx,
  };
}

function measureWrappedHeight(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  lineHeight: number,
): number {
  const lines = wrapLines(ctx, text, maxWidth);
  return Math.max(lineHeight, lines.length * lineHeight);
}

function wrapCenterText(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const lines = wrapLines(ctx, text, maxWidth);
  lines.forEach((line, index) => {
    ctx.fillText(line, centerX, y + index * lineHeight);
  });
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [''];

  const words = trimmed.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const chunks = splitLongToken(ctx, word, maxWidth);
    for (const chunk of chunks) {
      const next = current ? `${current} ${chunk}` : chunk;
      if (current && ctx.measureText(next).width > maxWidth) {
        lines.push(current);
        current = chunk;
      } else {
        current = next;
      }
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

function splitLongToken(ctx: CanvasRenderingContext2D, token: string, maxWidth: number): string[] {
  if (ctx.measureText(token).width <= maxWidth) return [token];
  const parts: string[] = [];
  let part = '';
  for (const char of token) {
    const next = part + char;
    if (part && ctx.measureText(next).width > maxWidth) {
      parts.push(part);
      part = char;
    } else {
      part = next;
    }
  }
  if (part) parts.push(part);
  return parts;
}

export function downloadPngDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

export function buildDymoXtlCsvRow(content: Pick<DymoXtlLabelContent, 'title' | 'size' | 'qrUrl' | 'companyLine'>) {
  return {
    SERIAL: content.title,
    QR_URL: content.qrUrl,
    SIZE: content.size,
    COMPANY: content.companyLine,
  };
}

export function dymoXtlCsvHeader() {
  return 'SERIAL,QR_URL,SIZE,COMPANY';
}

export function dymoXtlCsvLine(row: ReturnType<typeof buildDymoXtlCsvRow>) {
  return [row.SERIAL, row.QR_URL, row.SIZE, row.COMPANY].map(csvEscape).join(',');
}

function csvEscape(value: string) {
  const text = value.replace(/"/g, '""');
  return `"${text}"`;
}
