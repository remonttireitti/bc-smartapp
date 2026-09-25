import { syncQuoteRowsToWorkReport } from '../quoteSeededRows';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildWorkReportTitle } from '../../types';
import type { SubscriberPortalVisibility } from '../subscriberPortalVisibility';
import { billingQuoteFromQuoteRow, saveBillingQuoteSettings } from '../workReportBillingQuote';
import { isRepairQuoteType } from './constants';
import { normalizeQuoteRequestData } from './defaults';
import { quoteCustomTitleText, quoteRequestTitle } from './title';
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

/** Työraportin heading (Otsikko) = tarjouksen introText. */
export function buildWorkReportHeadingFromQuote(data: QuoteRequestData): string | null {
  const intro = normalizeQuoteRequestData(data).introText.trim();
  return intro || null;
}

/** Työraportin description (Tehtävän kuvaus) = tarjouksen faultDescription. */
export function buildWorkReportDescriptionFromQuote(data: QuoteRequestData): string | null {
  const workDescription = normalizeQuoteRequestData(data).faultDescription.trim();
  return workDescription || null;
}

/**
 * Työraportin otsikko tarjouksesta. Huolto/korjaus, jolla on oma "Tarjouksen otsikko":
 * sama kuin tarjouspyynnön otsikko = asiakas + " – " + oma otsikko (ei toistoa, jos otsikko
 * alkaa jo asiakasnimellä). Muuten ennallaan (asiakas – kuvaus / tarjouksen otsikko).
 */
export function buildWorkReportTitleFromQuote(input: {
  customerName: string;
  data: QuoteRequestData;
  heading: string | null;
  description: string | null;
  quoteTitle: string;
}): string {
  const repair = isRepairQuoteType(input.data.type);
  const custom = quoteCustomTitleText(input.data);
  if (repair && custom) {
    return input.customerName ? quoteRequestTitle(input.customerName, custom) : custom;
  }
  const snippetSource = repair ? custom : input.heading;
  return buildWorkReportTitle(
    input.customerName,
    snippetSource || input.description || input.quoteTitle,
  );
}

export function buildWorkReportPayloadFromQuote(input: {
  quote: QuoteForWorkReportCreation;
  customer: QuoteCustomerForWorkReport | null;
  sessionUserId: string;
}) {
  const customerName = input.customer?.name?.trim() ?? '';
  const normalized = normalizeQuoteRequestData(input.quote.data);
  const heading = buildWorkReportHeadingFromQuote(input.quote.data);
  const description = buildWorkReportDescriptionFromQuote(input.quote.data);
  const title = buildWorkReportTitleFromQuote({
    customerName,
    data: normalized,
    heading,
    description,
    quoteTitle: input.quote.title,
  });

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
    // Tarjouksen tarvike-/kulurivit valmiiksi raporttiin (idempotentti; uusi raportti saa ne
    // ensimmäiseen työkirjaukseen).
    try {
      await syncQuoteRowsToWorkReport(supabase, input.quote.work_report_id);
    } catch (error) {
      console.error('Tarjouksen rivien luonti työraporttiin epäonnistui:', error);
    }
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
