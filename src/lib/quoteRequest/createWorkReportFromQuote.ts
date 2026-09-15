import type { SupabaseClient } from '@supabase/supabase-js';
import { buildWorkReportTitle } from '../../types';
import type { SubscriberPortalVisibility } from '../subscriberPortalVisibility';
import { billingQuoteFromQuoteRow, saveBillingQuoteSettings } from '../workReportBillingQuote';
import { normalizeQuoteRequestData } from './defaults';
import type { QuoteRequestData } from './types';

export type QuoteForWorkReportCreation = {
  id: string;
  title: string;
  data: QuoteRequestData;
  customer_id: string | null;
  owner_company_id: string;
  created_by_company_id: string;
  branding_company_id: string;
  partnership_id: string | null;
  subscriber_id: string | null;
  subscriber_portal_visibility?: SubscriberPortalVisibility | null;
  work_report_id?: string | null;
};

export type QuoteCustomerForWorkReport = {
  name?: string | null;
};

const DEFAULT_QUOTE_INTRO_TEXT = 'Tarjoamme seuraavat työt ja tuotteet:';

function quoteIntroText(data: QuoteRequestData): string {
  return normalizeQuoteRequestData(data).introText.trim();
}

function quoteFaultText(data: QuoteRequestData): string {
  return normalizeQuoteRequestData(data).faultDescription.trim();
}

function isDefaultQuoteIntroText(intro: string): boolean {
  return !intro || intro === DEFAULT_QUOTE_INTRO_TEXT;
}

/** Vikakuvauksen lyhyt otsikkorivi (esim. ennen ", tarjotaan teille"). */
export function extractFaultHeadingFromQuote(fault: string): string | null {
  const trimmed = fault.trim();
  if (!trimmed) return null;
  const firstLine = trimmed.split(/\r?\n/, 1)[0]?.trim() ?? '';
  const tarjotaanMatch = firstLine.match(/^(.+?),\s*tarjotaan\b/i);
  if (tarjotaanMatch?.[1]?.trim()) return tarjotaanMatch[1].trim();
  return firstLine || null;
}

/** Työraportin Otsikko-kenttä (tuloste / tiedostonimi). */
export function buildWorkReportHeadingFromQuote(data: QuoteRequestData): string | null {
  const intro = quoteIntroText(data);
  const fault = quoteFaultText(data);
  if (!isDefaultQuoteIntroText(intro)) return intro;
  return extractFaultHeadingFromQuote(fault);
}

/** Työraportin tehtävän kuvaus. */
export function buildWorkReportDescriptionFromQuote(data: QuoteRequestData): string | null {
  const intro = quoteIntroText(data);
  const fault = quoteFaultText(data);
  if (fault) {
    const tarjotaanIdx = fault.search(/,\s*tarjotaan\b/i);
    if (tarjotaanIdx >= 0) {
      const body = fault.slice(tarjotaanIdx + 1).replace(/^,\s*/, '').trim();
      if (body) return body;
    }
    return fault;
  }
  if (!isDefaultQuoteIntroText(intro)) return intro;
  return null;
}

/** @deprecated Käytä buildWorkReportHeadingFromQuote */
export function buildWorkReportTitleFromQuote(
  data: QuoteRequestData,
  fallbackTitle?: string | null,
): string {
  const heading = buildWorkReportHeadingFromQuote(data);
  if (heading) return heading;
  const fallback = fallbackTitle?.trim();
  return fallback || 'Työraportti';
}

export function buildWorkReportPayloadFromQuote(input: {
  quote: QuoteForWorkReportCreation;
  customer: QuoteCustomerForWorkReport | null;
  sessionUserId: string;
}) {
  const customerName = input.customer?.name?.trim() ?? '';
  const heading = buildWorkReportHeadingFromQuote(input.quote.data);
  const description = buildWorkReportDescriptionFromQuote(input.quote.data);
  const title = buildWorkReportTitle(customerName, heading || description || input.quote.title);

  return {
    title,
    heading,
    description,
    orderer_name: null,
    subscriber_id: input.quote.subscriber_id,
    location_text: null,
    owner_company_id: input.quote.owner_company_id,
    created_by_company_id: input.quote.created_by_company_id,
    branding_company_id: input.quote.branding_company_id,
    partnership_id: input.quote.partnership_id,
    customer_id: input.quote.customer_id,
    equipment_id: null,
    created_by_user_id: input.sessionUserId,
    assigned_user_id: null,
    scheduled_start: null,
    scheduled_end: null,
    status: 'draft' as const,
  };
}

/** Merkitsee tarjouksen tilatuksi ilman työraportin luontia (esim. vanhat tarjoukset). */
export async function markQuoteAsOrderedOnly(
  supabase: SupabaseClient,
  quoteId: string,
): Promise<void> {
  const { error } = await supabase
    .from('quote_requests')
    .update({ status: 'ordered' })
    .eq('id', quoteId);
  if (error) throw new Error(error.message);
}

/** Palauttaa tilauksen merkinnän lähetetyksi. Työraporttilinkki säilyy. */
export async function markQuoteAsNotOrdered(
  supabase: SupabaseClient,
  quoteId: string,
): Promise<void> {
  const { error } = await supabase
    .from('quote_requests')
    .update({ status: 'sent' })
    .eq('id', quoteId);
  if (error) throw new Error(error.message);
}

/**
 * Luo työraportin tarjouksesta ja merkitsee tarjouksen tilatuksi.
 * Jos työraportti on jo linkitetty, palauttaa olemassa olevan id:n.
 */
export async function createWorkReportFromQuote(
  supabase: SupabaseClient,
  input: {
    quote: QuoteForWorkReportCreation;
    customer: QuoteCustomerForWorkReport | null;
    sessionUserId: string;
  },
): Promise<string> {
  if (input.quote.work_report_id) {
    await markQuoteAsOrderedOnly(supabase, input.quote.id);
    return input.quote.work_report_id;
  }

  const payload = buildWorkReportPayloadFromQuote(input);
  const { data: report, error: insertError } = await supabase
    .from('work_reports')
    .insert(payload)
    .select('id')
    .single();

  if (insertError || !report?.id) {
    throw new Error(insertError?.message ?? 'Työraportin luonti epäonnistui.');
  }

  const reportId = report.id as string;
  const { error: billingInsertError } = await supabase
    .from('work_report_billing')
    .insert({ work_report_id: reportId });
  if (billingInsertError) {
    throw new Error(billingInsertError.message);
  }

  const billingQuote = billingQuoteFromQuoteRow(
    input.quote.id,
    input.quote.title,
    input.quote.data,
    { fixedCustomerBilling: true },
  );
  await saveBillingQuoteSettings(supabase, reportId, billingQuote);

  const { error: linkError } = await supabase
    .from('quote_requests')
    .update({ status: 'ordered', work_report_id: reportId })
    .eq('id', input.quote.id);
  if (linkError) throw new Error(linkError.message);

  return reportId;
}
