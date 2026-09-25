/**
 * Tarjouspyynnön kohdistus olemassa olevaan työraporttiin (ja irrotus). Käyttää olemassa olevia
 * sarakkeita: quote_requests.work_report_id + work_report_billable.billing_quote. Ei migraatiota.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  billingQuoteAfterUnlink,
  billingQuoteForLinkedQuote,
  buildQuoteReportLinkIndex,
  isCustomerAlreadyBilled,
  planQuoteLink,
  type QuoteLinkPlan,
  type QuoteLinkRow,
  type QuoteReportLinkIndex,
  type WorkReportLinkRow,
} from './quoteWorkReportLinkLogic';
import { parseBillingQuoteSettings, saveBillingQuoteSettings } from './workReportBillingQuote';
import {
  ensurePartnerBillableCalculated,
  markPartnerBillableRecalcNeeded,
} from './workReportPartnerBillingPersist';

type CustomerJoin = { name?: string | null } | Array<{ name?: string | null }> | null | undefined;

function customerName(join: CustomerJoin): string | null {
  const row = Array.isArray(join) ? join[0] : join;
  return row?.name?.trim() || null;
}

/** Raporttien puolen linkit (billing_quote.quote_request_id). */
export async function loadBillingQuoteLinks(
  supabase: SupabaseClient,
): Promise<Array<{ work_report_id: string; quote_request_id: string | null }>> {
  const { data, error } = await supabase
    .from('work_report_billable')
    .select('work_report_id, quote_request_id:billing_quote->>quote_request_id')
    .not('billing_quote->>quote_request_id', 'is', null);
  if (error) {
    console.error('Tarjouslinkkien lataus epäonnistui:', error.message);
    return [];
  }
  return (data ?? []) as unknown as Array<{ work_report_id: string; quote_request_id: string | null }>;
}

/** Tarjoukset linkkitietoineen (kevyt: ei dataa). */
export async function loadQuoteLinkRows(supabase: SupabaseClient): Promise<QuoteLinkRow[]> {
  const { data, error } = await supabase
    .from('quote_requests')
    .select('id, title, status, customer_id, owner_company_id, work_report_id, updated_at, created_at, customers(name)')
    .order('updated_at', { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Array<QuoteLinkRow & { customers?: CustomerJoin }>).map((row) => ({
    ...row,
    customer_name: customerName(row.customers),
  }));
}

export async function loadWorkReportLinkRows(supabase: SupabaseClient): Promise<WorkReportLinkRow[]> {
  const { data, error } = await supabase
    .from('work_reports')
    .select('id, title, status, customer_id, owner_company_id, scheduled_start, created_at, customers(name)')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Array<WorkReportLinkRow & { customers?: CustomerJoin }>).map((row) => ({
    ...row,
    customer_name: customerName(row.customers),
  }));
}

export async function loadQuoteReportLinkIndex(
  supabase: SupabaseClient,
  quotes?: Array<Pick<QuoteLinkRow, 'id' | 'work_report_id'>>,
): Promise<QuoteReportLinkIndex> {
  const [quoteRows, billingLinks] = await Promise.all([
    quotes ? Promise.resolve(quotes) : loadQuoteLinkRows(supabase),
    loadBillingQuoteLinks(supabase),
  ]);
  return buildQuoteReportLinkIndex({ quotes: quoteRows, billingLinks });
}

async function loadBillingQuote(supabase: SupabaseClient, reportId: string) {
  const { data, error } = await supabase
    .from('work_report_billable')
    .select('billing_quote')
    .eq('work_report_id', reportId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return parseBillingQuoteSettings((data as { billing_quote?: unknown } | null)?.billing_quote ?? {});
}

/** Onko raportin asiakas jo laskutettu (työraportin tila / work_report_billing). */
export async function loadCustomerAlreadyBilled(supabase: SupabaseClient, reportId: string): Promise<boolean> {
  const [{ data: report }, { data: billing }] = await Promise.all([
    supabase.from('work_reports').select('status').eq('id', reportId).maybeSingle(),
    supabase
      .from('work_report_billing')
      .select('customer_invoice_status, customer_billed_at')
      .eq('work_report_id', reportId)
      .maybeSingle(),
  ]);
  return isCustomerAlreadyBilled({
    reportStatus: (report as { status?: string } | null)?.status,
    customerInvoiceStatus: (billing as { customer_invoice_status?: string } | null)?.customer_invoice_status,
    customerBilledAt: (billing as { customer_billed_at?: string | null } | null)?.customer_billed_at,
  });
}

async function clearBillingQuoteIfLinked(supabase: SupabaseClient, reportId: string, quoteId: string) {
  const current = await loadBillingQuote(supabase, reportId);
  const next = billingQuoteAfterUnlink(current, quoteId);
  if (next) await saveBillingQuoteSettings(supabase, reportId, next);
}

async function recalcPartner(supabase: SupabaseClient, reportIds: string[], viewerCompanyId?: string | null) {
  for (const id of new Set(reportIds)) {
    await markPartnerBillableRecalcNeeded(supabase, id);
    try {
      await ensurePartnerBillableCalculated(supabase, id, viewerCompanyId);
    } catch (error) {
      console.error('Kumppanilaskelman päivitys epäonnistui:', error);
    }
  }
}

/**
 * Kohdistaa tarjouksen työraporttiin kuten tarjouksesta luotu raportti:
 * billing_quote-snapshot tarjouksesta, quote_requests.work_report_id + tila tilattu,
 * kumppanilaskelma (provisio, partner_total) lasketaan uudelleen. Laskutettuja summia
 * (partner_billed_amount, asiakkaan laskutus) ei muuteta.
 */
export async function linkQuoteToWorkReport(
  supabase: SupabaseClient,
  input: {
    quote: { id: string; title: string | null; status: string; work_report_id?: string | null; data?: unknown };
    reportId: string;
    plan: QuoteLinkPlan;
    viewerCompanyId?: string | null;
  },
): Promise<void> {
  const { quote, reportId, plan } = input;
  let quoteData = quote.data;
  let quoteTitle = quote.title;
  if (quoteData === undefined) {
    const { data, error } = await supabase.from('quote_requests').select('title, data').eq('id', quote.id).single();
    if (error || !data) throw new Error(error?.message ?? 'Tarjousta ei löytynyt.');
    quoteData = (data as { data: unknown }).data;
    quoteTitle = (data as { title: string | null }).title ?? quoteTitle;
  }

  // 1) Irrota tarjous aiemmista raporteista (1 tarjous = 1 raportti).
  for (const oldReportId of plan.detachQuoteFromReportIds) {
    await clearBillingQuoteIfLinked(supabase, oldReportId, quote.id);
  }
  // 2) Irrota raportin muut tarjoukset (raportilla yksi tarjous).
  if (plan.detachOtherQuoteIds.length > 0) {
    const { error } = await supabase
      .from('quote_requests')
      .update({ work_report_id: null })
      .in('id', plan.detachOtherQuoteIds);
    if (error) throw new Error(error.message);
  }

  // 3) Raportin billing_quote tarjouksesta (sama kuin luonnissa).
  const [previous, customerAlreadyBilled] = await Promise.all([
    loadBillingQuote(supabase, reportId),
    loadCustomerAlreadyBilled(supabase, reportId),
  ]);
  const settings = billingQuoteForLinkedQuote({
    quote: { id: quote.id, title: quoteTitle, data: quoteData },
    previous,
    customerAlreadyBilled,
  });
  await saveBillingQuoteSettings(supabase, reportId, settings);

  // 4) Tarjouksen puoli: linkki + tilattu.
  const { error: linkError } = await supabase
    .from('quote_requests')
    .update({ status: 'ordered', work_report_id: reportId })
    .eq('id', quote.id);
  if (linkError) throw new Error(linkError.message);

  // 5) Kumppanilaskelma uudelleen (provisio + partner_total).
  await recalcPartner(supabase, [reportId, ...plan.detachQuoteFromReportIds], input.viewerCompanyId);
}

/** Poistaa kohdistuksen molemmilta puolilta. Tarjous jää tilatuksi. */
export async function unlinkQuoteFromWorkReport(
  supabase: SupabaseClient,
  input: { quoteId: string; reportId: string; viewerCompanyId?: string | null },
): Promise<void> {
  const { error } = await supabase
    .from('quote_requests')
    .update({ work_report_id: null })
    .eq('id', input.quoteId)
    .eq('work_report_id', input.reportId);
  if (error) throw new Error(error.message);
  await clearBillingQuoteIfLinked(supabase, input.reportId, input.quoteId);
  await recalcPartner(supabase, [input.reportId], input.viewerCompanyId);
}

export { planQuoteLink };
