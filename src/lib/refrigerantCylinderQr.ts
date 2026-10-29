import QRCode from 'qrcode';

import { formatBottleLabel } from './refrigerantBottle';
import { buildCylinderShortUrl } from './refrigerantCylinderCode';
import { copyText } from './copyText';
import { buildDeviceQrLabelsHtml, renderDeviceQrLabelPdf, renderDeviceQrLabelPng, downloadBlob, deviceQrLabelFileName } from './deviceQrLabel';
import type { RefrigerantCylinder } from '../types/inventory';

export type CylinderQrContent = {
  title: string;
  scanUrl: string;
  qrDataUrl: string;
};

export async function buildCylinderQrContent(cylinder: RefrigerantCylinder): Promise<CylinderQrContent> {
  const scanUrl = buildCylinderShortUrl(cylinder.id);
  const qrDataUrl = await QRCode.toDataURL(scanUrl, {
    width: 512,
    margin: 1,
    errorCorrectionLevel: 'M',
  });

  return {
    title: formatBottleLabel(cylinder),
    scanUrl,
    qrDataUrl,
  };
}

export function downloadQrPng(qrDataUrl: string, filename: string) {
  const link = document.createElement('a');
  link.href = qrDataUrl;
  link.download = filename;
  link.click();
}

export async function copyCylinderScanUrl(cylinder: RefrigerantCylinder): Promise<string> {
  const url = buildCylinderShortUrl(cylinder.id);
  await copyText(url);
  return url;
}

export const CYLINDER_LABEL_TAGLINE = 'Kylmäainepullo – BC Smartapp';

/** Dymo XTL 300 -tarra (60 × 24 mm), sama asettelu kuin laitteen QR-tarra. */
export function cylinderLabelItem(cylinder: RefrigerantCylinder) {
  return {
    url: buildCylinderShortUrl(cylinder.id),
    name: formatBottleLabel(cylinder),
    tag: null,
    tagline: CYLINDER_LABEL_TAGLINE,
  };
}

export async function buildCylinderLabelHtml(cylinder: RefrigerantCylinder): Promise<string> {
  return buildDeviceQrLabelsHtml([cylinderLabelItem(cylinder)]);
}

export async function downloadCylinderLabel(cylinder: RefrigerantCylinder, kind: 'png' | 'pdf') {
  const item = cylinderLabelItem(cylinder);
  const blob = kind === 'png' ? await renderDeviceQrLabelPng(item) : await renderDeviceQrLabelPdf(item);
  downloadBlob(blob, deviceQrLabelFileName(item, kind));
}

function sanitizeFilename(value: string) {
  return value.replace(/[^\w.-]+/g, '_').slice(0, 64) || 'pullo';
}

export async function downloadCylinderQrPng(cylinder: RefrigerantCylinder) {
  const content = await buildCylinderQrContent(cylinder);
  downloadQrPng(content.qrDataUrl, `${sanitizeFilename(content.title)}-qr.png`);
}
