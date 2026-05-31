import QRCode from 'qrcode';

import { formatBottleLabel, formatBottleSizeLabel } from './refrigerantBottle';
import { buildCylinderScanUrl } from './refrigerantCylinderCode';
import { openPrintHtml } from './openPrintWindow';
import type { RefrigerantCylinder } from '../types/inventory';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Tulostettava tarra: vain pysyvät tiedot. Aine/saldo/sijainti haetaan skannauksella. */
export async function printRefrigerantCylinderLabel(
  cylinder: RefrigerantCylinder,
  options?: { companyName?: string | null },
): Promise<void> {
  const payload = buildCylinderScanUrl(cylinder.id);
  const qrDataUrl = await QRCode.toDataURL(payload, {
    width: 280,
    margin: 1,
    errorCorrectionLevel: 'M',
  });

  const title = formatBottleLabel(cylinder);
  const size = formatBottleSizeLabel(cylinder.bottle_size);
  const companyLine = (options?.companyName || '').trim();
  const serial = (cylinder.serial_number || '').trim();

  const html = `<!DOCTYPE html>
<html lang="fi">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: 90mm 50mm; margin: 4mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      color: #111;
    }
    .label {
      width: 82mm;
      min-height: 42mm;
      display: flex;
      gap: 3mm;
      align-items: center;
    }
    .label-text {
      flex: 1;
      min-width: 0;
    }
    .label-company {
      margin: 0 0 1mm;
      font-size: 8pt;
      color: #444;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .label-title {
      margin: 0;
      font-size: 15pt;
      font-weight: 700;
      line-height: 1.15;
      word-break: break-word;
    }
    .label-meta {
      margin: 1.5mm 0 0;
      font-size: 9pt;
      color: #333;
      line-height: 1.35;
    }
    .label-hint {
      margin: 2mm 0 0;
      font-size: 7.5pt;
      color: #555;
      line-height: 1.3;
    }
    .label-qr img {
      display: block;
      width: 28mm;
      height: 28mm;
    }
  </style>
</head>
<body>
  <div class="label">
    <div class="label-text">
      ${companyLine ? `<p class="label-company">${escapeHtml(companyLine)}</p>` : ''}
      <h1 class="label-title">${escapeHtml(title)}</h1>
      <p class="label-meta">${escapeHtml(size)}</p>
      ${serial ? '' : `<p class="label-meta">ID ${escapeHtml(cylinder.id.slice(0, 8))}</p>`}
      <p class="label-hint">Skannaa QR — ajantasainen aine, saldo ja sijainti sovelluksesta.</p>
    </div>
    <div class="label-qr">
      <img src="${qrDataUrl}" alt="QR ${escapeHtml(title)}" />
    </div>
  </div>
</body>
</html>`;

  openPrintHtml(html);
}
