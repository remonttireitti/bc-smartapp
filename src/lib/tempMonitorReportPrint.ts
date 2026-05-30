import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveCompanyLogoUrl } from './companyLogo';
import { buildStyledPrintDocumentHtml, escapeHtmlPrint } from './printDocumentShell';
import { supabase } from './supabase';
import {
  TEMP_REPORT_SELECT,
  complianceLabel,
  formatTempC,
  getEffectiveLimitsFromSnapshot,
  type TempMonitorReport,
  type TempReading,
  type TempReportSummary,
} from './tempMonitoring';
import { renderTempTrendChartSvg } from './tempMonitoringChart';

const READINGS_SELECT = 'id, device_id, session_id, recorded_at, temp_c';

export async function loadTempMonitorReportReadings(
  report: TempMonitorReport,
  client: SupabaseClient = supabase,
) {
  const { data, error } = await client
    .from('temp_readings')
    .select(READINGS_SELECT)
    .eq('device_id', report.device_id)
    .gte('recorded_at', report.period_start)
    .lte('recorded_at', report.period_end)
    .order('recorded_at', { ascending: true })
    .limit(5000);

  if (error) throw new Error(error.message);
  return (data as TempReading[] | null) ?? [];
}

function formatPeriod(startIso: string, endIso: string) {
  return `${new Date(startIso).toLocaleString('fi-FI')} – ${new Date(endIso).toLocaleString('fi-FI')}`;
}

function summaryTable(summary: TempReportSummary, limits: ReturnType<typeof getEffectiveLimitsFromSnapshot>) {
  return `<table class="tbl kv-table">
<tbody>
<tr><th scope="row">Mittauksia</th><td>${summary.readingCount}</td></tr>
<tr><th scope="row">Min</th><td>${formatTempC(summary.minTemp)}</td></tr>
<tr><th scope="row">Keskiarvo</th><td>${formatTempC(summary.avgTemp)}</td></tr>
<tr><th scope="row">Max</th><td>${formatTempC(summary.maxTemp)}</td></tr>
<tr><th scope="row">Tila</th><td>${escapeHtmlPrint(complianceLabel(summary.complianceStatus))}</td></tr>
${
  limits
    ? `<tr><th scope="row">Toivottu alue</th><td>${limits.targetMin}–${limits.targetMax} °C</td></tr>
<tr><th scope="row">Sallittu alue</th><td>${limits.acceptableMin.toFixed(1)}–${limits.acceptableMax.toFixed(1)} °C</td></tr>
<tr><th scope="row">Poikkeama-aika</th><td>${summary.outOfRangeMinutes} min (raja ${limits.allowedDeviationMinutes} min)</td></tr>`
    : ''
}
</tbody>
</table>`;
}

export function buildTempMonitorReportPrintHtml(input: {
  report: TempMonitorReport;
  readings: TempReading[];
  companyName: string;
  logoUrl?: string | null;
}) {
  const { report, readings } = input;
  const limits = getEffectiveLimitsFromSnapshot(report);
  const summary = report.summary;
  const trendSvg = renderTempTrendChartSvg(readings, limits, 720, 240);

  const mainHtml = `
<section class="print-card-section">
  <h2 class="print-card-h2">Mittauksen tiedot</h2>
  <table class="tbl kv-table">
  <tbody>
    <tr><th scope="row">Laite</th><td>${escapeHtmlPrint(input.report.device?.name ?? '—')}</td></tr>
    <tr><th scope="row">Mitä seurattiin</th><td>${escapeHtmlPrint(report.monitor_label ?? '—')}</td></tr>
    <tr><th scope="row">Missä</th><td>${escapeHtmlPrint(report.site_label ?? '—')}</td></tr>
    <tr><th scope="row">Asiakas</th><td>${escapeHtmlPrint(report.customer?.name ?? '—')}</td></tr>
    <tr><th scope="row">Milloin</th><td>${escapeHtmlPrint(formatPeriod(report.period_start, report.period_end))}</td></tr>
    <tr><th scope="row">Miksi / tarkoitus</th><td>${escapeHtmlPrint(report.purpose_notes ?? report.notes ?? '—')}</td></tr>
  </tbody>
  </table>
</section>

<section class="print-card-section">
  <h2 class="print-card-h2">Yhteenveto</h2>
  ${summaryTable(summary, limits)}
</section>

<section class="print-card-section">
  <h2 class="print-card-h2">Lämpötilatrendi</h2>
  ${trendSvg}
  ${
    limits
      ? `<p class="print-card-muted">Sininen alue = toivottu ${limits.targetMin}–${limits.targetMax} °C, vihreä = sallittu poikkeama.</p>`
      : ''
  }
</section>`;

  return buildStyledPrintDocumentHtml({
    documentTitle: report.title,
    pageH1: report.title,
    subtitleEscaped: escapeHtmlPrint(report.monitor_label ?? 'Lämpötilaseuranta'),
    badge: 'Lämpötilaraportti',
    rightColumnHtml: `<div>Luotu: <strong>${escapeHtmlPrint(new Date(report.created_at).toLocaleString('fi-FI'))}</strong></div>`,
    branding: {
      companyName: input.companyName,
      logoUrl: input.logoUrl ?? null,
    },
    mainHtml,
    footerHtml: `<div class="footer">Lämpötilaseuranta · ${escapeHtmlPrint(input.companyName)}</div>`,
  });
}

export async function loadTempMonitorReportPrintBundle(reportId: string, client: SupabaseClient = supabase) {
  const { data: reportRow, error } = await client
    .from('temp_monitor_reports')
    .select(TEMP_REPORT_SELECT)
    .eq('id', reportId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!reportRow) throw new Error('Raporttia ei löydy');

  const report = reportRow as unknown as TempMonitorReport;
  const readings = await loadTempMonitorReportReadings(report, client);

  const { data: company } = await client
    .from('companies')
    .select('name, logo_url')
    .eq('id', report.created_by_company_id)
    .maybeSingle();

  const logoUrl = company?.logo_url ? await resolveCompanyLogoUrl(company.logo_url) : null;
  const html = buildTempMonitorReportPrintHtml({
    report,
    readings,
    companyName: company?.name ?? 'Yritys',
    logoUrl,
  });

  return { report, readings, html };
}
