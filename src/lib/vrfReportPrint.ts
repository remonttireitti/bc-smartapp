import { buildStyledPrintDocumentHtml, escapeHtmlPrint } from './printDocumentShell';
import {
  VRF_BINARY_LANES,
  VRF_TREND_SERIES,
  type VrfBinaryLaneKey,
  type VrfReading,
  type VrfTrendSeriesKey,
} from './vrfMonitoring';
import { renderVrfBinaryTrendSvg, renderVrfTrendChartSvg } from './vrfMonitoringChart';

function formatPeriod(startIso: string, endIso: string) {
  return `${new Date(startIso).toLocaleString('fi-FI')} – ${new Date(endIso).toLocaleString('fi-FI')}`;
}

export function buildVrfReportPrintHtml(input: {
  deviceName: string;
  periodStart: string;
  periodEnd: string;
  readings: VrfReading[];
  tempSeries: VrfTrendSeriesKey[];
  binaryLanes: VrfBinaryLaneKey[];
  companyName: string;
  logoUrl?: string | null;
  title?: string;
}) {
  const title = input.title?.trim() || `VRF-seuranta — ${input.deviceName}`;
  const tempLabels = VRF_TREND_SERIES.filter((s) => input.tempSeries.includes(s.key))
    .map((s) => s.label)
    .join(', ');
  const binaryLabels = VRF_BINARY_LANES.filter((l) => input.binaryLanes.includes(l.key))
    .map((l) => l.label)
    .join(', ');

  const tempSvg =
    input.tempSeries.length > 0
      ? renderVrfTrendChartSvg(input.readings, input.tempSeries)
      : '<p class="print-card-muted">Lämpötiloja ei valittu.</p>';
  const binarySvg =
    input.binaryLanes.length > 0
      ? renderVrfBinaryTrendSvg(input.readings, input.binaryLanes)
      : '<p class="print-card-muted">Tilatietoja ei valittu.</p>';

  const mainHtml = `
<section class="print-card-section">
  <h2 class="print-card-h2">Raportin tiedot</h2>
  <table class="tbl kv-table">
  <tbody>
    <tr><th scope="row">Laite</th><td>${escapeHtmlPrint(input.deviceName)}</td></tr>
    <tr><th scope="row">Aikaväli</th><td>${escapeHtmlPrint(formatPeriod(input.periodStart, input.periodEnd))}</td></tr>
    <tr><th scope="row">Mittauksia</th><td>${input.readings.length}</td></tr>
    <tr><th scope="row">Lämpötilat</th><td>${escapeHtmlPrint(tempLabels || '—')}</td></tr>
    <tr><th scope="row">Tilatiedot</th><td>${escapeHtmlPrint(binaryLabels || '—')}</td></tr>
  </tbody>
  </table>
</section>
${
  input.tempSeries.length > 0
    ? `<section class="print-card-section">
  <h2 class="print-card-h2">Lämpötilatrendi</h2>
  ${tempSvg}
</section>`
    : ''
}
${
  input.binaryLanes.length > 0
    ? `<section class="print-card-section">
  <h2 class="print-card-h2">Ohjaus, tilat ja sulatus</h2>
  <p class="print-card-muted">Sulatus tunnistetaan arviona historiadatasta.</p>
  ${binarySvg}
</section>`
    : ''
}`;

  return buildStyledPrintDocumentHtml({
    documentTitle: title,
    pageH1: title,
    subtitleEscaped: escapeHtmlPrint(input.deviceName),
    badge: 'VRF-seuranta',
    branding: {
      companyName: input.companyName,
      logoUrl: input.logoUrl ?? null,
    },
    mainHtml,
    footerHtml: `<div>VRF ohjaus ja seuranta · ${escapeHtmlPrint(input.companyName)}</div>`,
  });
}
