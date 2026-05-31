import {
  buildDymoXtlLabelContent,
  buildDymoXtlCsvRow,
  DYMO_XTL_LABEL_HEIGHT_MM,
  DYMO_XTL_LABEL_WIDTH_MM,
  downloadPngDataUrl,
  dymoXtlCsvHeader,
  dymoXtlCsvLine,
} from './dymoXtlLabelLayout';
import { formatBottleLabel } from './refrigerantBottle';
import { openPrintHtml } from './openPrintWindow';
import type { RefrigerantCylinder } from '../types/inventory';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizeFilename(value: string) {
  return value.replace(/[^\w.-]+/g, '_').slice(0, 64) || 'pullo';
}

/** Tulostaa DYMO XTL 300 -koossa (24×51 mm). Lataa myös PNG-varmuuskopion. */
export async function printRefrigerantCylinderLabel(
  cylinder: RefrigerantCylinder,
  options?: { companyName?: string | null },
): Promise<{ message: string }> {
  const content = await buildDymoXtlLabelContent(cylinder, options);
  const filename = `${sanitizeFilename(formatBottleLabel(cylinder))}-dymo-xtl.png`;

  downloadPngDataUrl(content.pngDataUrl, filename);

  const html = `<!DOCTYPE html>
<html lang="fi">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(content.title)}</title>
  <style>
    @page {
      size: ${DYMO_XTL_LABEL_WIDTH_MM}mm ${DYMO_XTL_LABEL_HEIGHT_MM}mm;
      margin: 0;
    }
    * { box-sizing: border-box; }
    html, body {
      width: ${DYMO_XTL_LABEL_WIDTH_MM}mm;
      height: ${DYMO_XTL_LABEL_HEIGHT_MM}mm;
      margin: 0;
      padding: 0;
    }
    img {
      display: block;
      width: ${DYMO_XTL_LABEL_WIDTH_MM}mm;
      height: ${DYMO_XTL_LABEL_HEIGHT_MM}mm;
    }
    .hint {
      display: none;
    }
  </style>
</head>
<body>
  <img src="${content.pngDataUrl}" alt="${escapeHtml(content.title)}" />
  <p class="hint">DYMO XTL 24×51 mm</p>
</body>
</html>`;

  openPrintHtml(html);

  return {
    message:
      'Tarrakuva ladattu (24×51 mm). Tulostusikkunassa valitse DYMO XTL (DYMO ID asennettuna, laite USB:llä). Vaihtoehto: DYMO ID → General → Lisää kuva → valitse ladattu PNG.',
  };
}

export async function downloadRefrigerantCylinderDymoCsv(
  cylinders: RefrigerantCylinder[],
  options?: { companyName?: string | null },
): Promise<void> {
  const lines = [dymoXtlCsvHeader()];
  for (const cylinder of cylinders) {
    const content = await buildDymoXtlLabelContent(cylinder, options);
    lines.push(dymoXtlCsvLine(buildDymoXtlCsvRow(content)));
  }
  const blob = new Blob([`${lines.join('\n')}\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'kylmäaine-pulloverkk.csv';
  link.click();
  URL.revokeObjectURL(url);
}
