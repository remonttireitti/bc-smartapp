import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { renderElementToPdf, shareOrDownloadPdf, shouldUsePdfExport } from './pdfExport';
import { extractPrintableHtmlFragment, formatPrintSaveFileName } from './printDocumentShell';

/**
 * Asiakasportaalin dokumenttien PDF-lataus (asiakastuloste) ja "Tulostettu"-merkintä.
 * Tulostusloki: document_print_log (SQL); ilman taulua merkintä on piilossa eikä lokia kirjata.
 */
export type PortalDocKind = 'work_report' | 'maintenance_report' | 'quote_request';

export function portalDocPrintPath(kind: PortalDocKind, id: string): string {
  if (kind === 'work_report') return `/tyoraportit/${id}/tuloste`;
  if (kind === 'maintenance_report') return `/huoltoraportit/${id}/tuloste`;
  return `/tarjouspyynnot/${id}/tuloste`;
}

/** Vanhoista kumppanikopioista jäänyt sisäinen tunniste ei kuulu tulosteeseen. */
function stripInternalMarkers(text: string): string {
  return text.replace(/\s*bc_partner_copy_source_report_id:[0-9a-f-]{36}/gi, '');
}

async function renderHtmlHostToPdf(html: string, hostClass: string, fileName: string): Promise<File> {
  const host = document.createElement('div');
  host.className = hostClass;
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:760px;';
  host.innerHTML = html;
  document.body.appendChild(host);
  try {
    // Anna tyylien ja kuvien asettua ennen kuvaa.
    await new Promise((r) => window.setTimeout(r, 150));
    return await renderElementToPdf(host, fileName);
  } finally {
    host.remove();
  }
}

/** Tarjous: tulostussivu upotettuna piilo-iframeen (asiakastuloste), sen sisäinen esikatselu renderöidään PDF:ksi. */
async function quotePdfViaFrame(id: string): Promise<File> {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1100px;height:1400px;border:0;';
  frame.src = portalDocPrintPath('quote_request', id);
  document.body.appendChild(frame);
  try {
    const deadline = Date.now() + 40_000;
    for (;;) {
      if (Date.now() > deadline) throw new Error('Tarjouksen PDF:n luonti aikakatkaistiin.');
      await new Promise((r) => window.setTimeout(r, 400));
      const outer = frame.contentDocument;
      const inner = outer?.querySelector<HTMLIFrameElement>('iframe.print-preview-frame');
      const doc = inner?.contentDocument;
      const loading = /Valmistellaan tulostetta/.test(outer?.body?.innerText ?? '');
      if (doc?.body && doc.body.innerText.trim().length > 20 && !loading && inner) {
        inner.style.width = '760px';
        inner.style.height = `${doc.documentElement.scrollHeight + 40}px`;
        await new Promise((r) => window.setTimeout(r, 300));
        const title = formatPrintSaveFileName(doc.title || 'Tarjous');
        return await renderElementToPdf(doc.body, title, { inPlace: true });
      }
    }
  } finally {
    frame.remove();
  }
}

async function resolveViewerCompanyId(): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase.from('profiles').select('company_id').eq('id', auth.user.id).maybeSingle();
  return (data as { company_id?: string | null } | null)?.company_id ?? null;
}

export async function buildPortalDocumentPdf(kind: PortalDocKind, id: string, viewerCompanyId?: string | null): Promise<File> {
  if (kind === 'maintenance_report') {
    const { loadMaintenanceReportPrintBundle } = await import('./maintenanceReportPrintAction');
    const bundle = await loadMaintenanceReportPrintBundle(id, { embedImages: false });
    const name = formatPrintSaveFileName(bundle.documentTitle);
    return renderHtmlHostToPdf(extractPrintableHtmlFragment(bundle.html), 'maintenance-print-host', name);
  }
  if (kind === 'work_report') {
    const [{ loadWorkReportPrintBundle }, { parseCustomerPrintQuantitySettings }, { buildWorkReportPrintTitle }] = await Promise.all([
      import('./workReportPrintAction'),
      import('./workReportCustomerPrintSettings'),
      import('./workReportPrintHtml'),
    ]);
    const bundle = await loadWorkReportPrintBundle(id, {
      printMode: 'customer',
      viewerCompanyId: viewerCompanyId ?? (await resolveViewerCompanyId()),
      customerPrintQuantitySettings: parseCustomerPrintQuantitySettings(new URLSearchParams()),
    });
    const name = formatPrintSaveFileName(buildWorkReportPrintTitle(bundle.report));
    return renderHtmlHostToPdf(stripInternalMarkers(bundle.html), 'work-report-print-host', name);
  }
  return quotePdfViaFrame(id);
}

function saveFile(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Luo PDF, tallenna suoraan (iOS-kotivalikkosovellus: jakovalikko) ja kirjaa tulostus. */
export async function downloadPortalDocumentPdf(kind: PortalDocKind, id: string, viewerCompanyId?: string | null): Promise<boolean> {
  const file = await buildPortalDocumentPdf(kind, id, viewerCompanyId);
  if (shouldUsePdfExport()) {
    const result = await shareOrDownloadPdf(file);
    if (result === 'cancelled') return false;
  } else {
    saveFile(file);
  }
  await recordPortalPrint(supabase, kind, id);
  return true;
}

// ---- Tulostusloki ----

export type PrintLog = Map<string, string>;
const logKey = (kind: PortalDocKind, id: string) => `${kind}:${id}`;
export const printLogKey = logKey;

/** Viimeisin tulostus per dokumentti (YYYY-MM-DD, Suomen aikaa). null = taulua ei ole (SQL ajamatta). */
export async function loadPrintLog(
  client: SupabaseClient,
  items: Array<{ kind: PortalDocKind; id: string }>,
): Promise<PrintLog | null> {
  if (items.length === 0) return new Map();
  const out: PrintLog = new Map();
  for (const kind of ['work_report', 'maintenance_report', 'quote_request'] as PortalDocKind[]) {
    const ids = items.filter((i) => i.kind === kind).map((i) => i.id);
    if (ids.length === 0) continue;
    const { data, error } = await client.from('document_print_log').select('doc_id, printed_at').eq('kind', kind).in('doc_id', ids);
    if (error) return null;
    for (const row of (data ?? []) as Array<{ doc_id: string; printed_at: string }>) {
      out.set(logKey(kind, row.doc_id), row.printed_at);
    }
  }
  return out;
}

export async function recordPortalPrint(client: SupabaseClient, kind: PortalDocKind, id: string): Promise<void> {
  // Hiljaa ohi, jos taulua ei ole tai ei oikeutta: PDF on jo ladattu.
  await client
    .from('document_print_log')
    .upsert({ kind, doc_id: id, printed_at: new Date().toISOString() }, { onConflict: 'kind,doc_id' });
}

/** d.m.yyyy */
export function printedDateFi(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}
