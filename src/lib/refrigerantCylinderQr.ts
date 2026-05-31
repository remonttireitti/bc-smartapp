import QRCode from 'qrcode';

import { formatBottleLabel } from './refrigerantBottle';
import { buildCylinderScanUrl } from './refrigerantCylinderCode';
import type { RefrigerantCylinder } from '../types/inventory';

export type CylinderQrContent = {
  title: string;
  scanUrl: string;
  qrDataUrl: string;
};

export async function buildCylinderQrContent(cylinder: RefrigerantCylinder): Promise<CylinderQrContent> {
  const scanUrl = buildCylinderScanUrl(cylinder.id);
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
  const url = buildCylinderScanUrl(cylinder.id);
  await navigator.clipboard.writeText(url);
  return url;
}

function sanitizeFilename(value: string) {
  return value.replace(/[^\w.-]+/g, '_').slice(0, 64) || 'pullo';
}

export async function downloadCylinderQrPng(cylinder: RefrigerantCylinder) {
  const content = await buildCylinderQrContent(cylinder);
  downloadQrPng(content.qrDataUrl, `${sanitizeFilename(content.title)}-qr.png`);
}
