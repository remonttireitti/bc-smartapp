import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkReport, WorkReportDailyLog } from '../types';
import {
  parseCompanySettings,
  parseCustomerBillingRates,
  resolveCustomerBillingRates,
  type PartnerBillingRates,
} from './management';
import {
  calculateWorkReportCustomerBillable,
  shouldCalculateCustomerBilling,
  shouldCalculateCustomerQuoteExtras,
} from './workReportCustomerBilling';
import {
  calculateWorkReportCustomerBillableFromQuote,
  calculateWorkReportCustomerBillableQuotePlusExtras,
  customerUsesFixedQuote,
  customerUsesQuoteBasedBilling,
  customerUsesQuotePlusExtras,
  parseBillingQuoteSettings,
  type BillingQuoteSettings,
} from './workReportBillingQuote';
import { fetchCustomerBillingLogs } from './workReportDailyLogSelect';
import { findStaleBillableReportIds } from './workReportBillableStale';

export async function loadWorkReportDailyLogs(
  supabase: SupabaseClient,
  workReportId: string,
): Promise<WorkReportDailyLog[]> {
  const { logs, error } = await fetchCustomerBillingLogs(supabase, workReportId);
  if (error) {
    console.error('Päiväkirjausten lataus epäonnistui:', error.message);
    return [];
  }
  return logs;
}

export async function refreshAndPersistCustomerBillable(
  supabase: SupabaseClient,
  reportRow: Pick<WorkReport, 'id' | 'owner_company_id' | 'customers'>,
  logs: WorkReportDailyLog[],
  rateOptions?: {
    useCustomRates?: boolean;
    reportRates?: PartnerBillingRates;
    billingQuote?: BillingQuoteSettings;
  },
) {
  const [{ data: companyRow }, { data: billingRow }, { data: billableRow }] = await Promise.all([
    supabase.from('companies').select('settings').eq('id', reportRow.owner_company_id).single(),
    supabase
      .from('work_report_billing')
      .select(
        'customer_rates_override, use_custom_customer_rates, customer_invoice_status, customer_billed_at',
      )
      .eq('work_report_id', reportRow.id)
      .maybeSingle(),
    supabase
      .from('work_report_billable')
      .select('billing_quote')
      .eq('work_report_id', reportRow.id)
      .maybeSingle(),
  ]);

  const billingQuote = parseBillingQuoteSettings(
    rateOptions?.billingQuote ?? billableRow?.billing_quote ?? {},
  );
  const useQuotePlusExtras = customerUsesQuotePlusExtras(billingQuote);
  const useFixedQuote = customerUsesFixedQuote(billingQuote);
  const useQuoteBilling = customerUsesQuoteBasedBilling(billingQuote);

  const billingApplies =
    useQuoteBilling
    || shouldCalculateCustomerBilling(logs)
    || (useQuotePlusExtras && shouldCalculateCustomerQuoteExtras(logs, billingQuote.extra_customer_lines));
  if (!billingApplies) {
    await supabase.from('work_report_billable').upsert({
      work_report_id: reportRow.id,
      customer_total: 0,
      customer_calculation: {},
    });
    return null;
  }

  const settings = parseCompanySettings((companyRow as { settings: unknown } | null)?.settings);
  const storedUseCustom = rateOptions?.useCustomRates ?? billingRow?.use_custom_customer_rates ?? false;
  const storedOverride = parseCustomerBillingRates(
    rateOptions?.reportRates ?? billingRow?.customer_rates_override,
  );

  const { rates, source } = resolveCustomerBillingRates({
    companyDefaults: settings.billing?.customer_rates ?? {},
    reportOverride: storedOverride,
    useReportRates: storedUseCustom,
  });

  const calculation =
    (useQuotePlusExtras
      ? calculateWorkReportCustomerBillableQuotePlusExtras({
          settings: billingQuote,
          logs,
          rates,
          ratesSource: source,
          customerName: reportRow.customers?.name ?? null,
        })
      : null)
    ?? (useFixedQuote
      ? calculateWorkReportCustomerBillableFromQuote({
          settings: billingQuote,
          customerName: reportRow.customers?.name ?? null,
          ratesSource: source,
        })
      : null)
    ?? calculateWorkReportCustomerBillable({
      logs,
      rates,
      ratesSource: source,
      customerName: reportRow.customers?.name ?? null,
    });

  await Promise.all([
    supabase.from('work_report_billable').upsert({
      work_report_id: reportRow.id,
      customer_total: calculation.grandTotal,
      customer_calculation: calculation,
    }),
    supabase.from('work_report_billing').upsert({
      work_report_id: reportRow.id,
      customer_invoice_amount: calculation.grandTotal,
      use_custom_customer_rates: storedUseCustom,
      customer_rates_override: storedUseCustom ? storedOverride : null,
      ...(billingRow?.customer_invoice_status
        ? { customer_invoice_status: billingRow.customer_invoice_status }
        : {}),
      ...(billingRow?.customer_billed_at ? { customer_billed_at: billingRow.customer_billed_at } : {}),
    }),
  ]);

  return calculation;
}

export async function ensureCustomerBillableCalculated(
  supabase: SupabaseClient,
  reportId: string,
  options?: { skipStaleCheck?: boolean },
): Promise<void> {
  const [{ data: reportData }, { data: billableRow }] = await Promise.all([
    supabase
      .from('work_reports')
      .select('id, owner_company_id, customers(name)')
      .eq('id', reportId)
      .single(),
    supabase
      .from('work_report_billable')
      .select('customer_total, customer_calculation, calculated_at, billing_quote')
      .eq('work_report_id', reportId)
      .maybeSingle(),
  ]);

  if (!reportData) return;

  const billingQuote = parseBillingQuoteSettings(billableRow?.billing_quote ?? {});
  const useQuoteBilling = customerUsesQuoteBasedBilling(billingQuote);
  const useFixedQuote = customerUsesFixedQuote(billingQuote);
  const useQuotePlusExtras = customerUsesQuotePlusExtras(billingQuote);
  const calc = billableRow?.customer_calculation as { byUser?: unknown[]; billingMode?: string } | null | undefined;
  const hasCalculation = (calc?.byUser?.length ?? 0) > 0;

  if (hasCalculation && !options?.skipStaleCheck && !useFixedQuote) {
    const staleIds = await findStaleBillableReportIds(supabase, [
      {
        workReportId: reportId,
        calculatedAt: billableRow?.calculated_at,
        hasCalculation: true,
        calculation: billableRow?.customer_calculation,
      },
    ]);
    if (!staleIds.includes(reportId)) return;
  }

  const logs = await loadWorkReportDailyLogs(supabase, reportId);
  if (
    !shouldCalculateCustomerBilling(logs)
    && !hasCalculation
    && !useQuoteBilling
    && !(useQuotePlusExtras && shouldCalculateCustomerQuoteExtras(logs, billingQuote.extra_customer_lines))
  ) {
    return;
  }

  await refreshAndPersistCustomerBillable(
    supabase,
    reportData as unknown as Pick<WorkReport, 'id' | 'owner_company_id' | 'customers'>,
    logs,
    { billingQuote },
  );
}
