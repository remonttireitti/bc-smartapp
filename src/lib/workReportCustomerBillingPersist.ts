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
} from './workReportCustomerBilling';
import { fetchCustomerBillingLogs } from './workReportDailyLogSelect';

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
  rateOptions?: { useCustomRates?: boolean; reportRates?: PartnerBillingRates },
) {
  const billingApplies = shouldCalculateCustomerBilling(logs);
  if (!billingApplies) {
    await supabase.from('work_report_billable').upsert({
      work_report_id: reportRow.id,
      customer_total: 0,
      customer_calculation: {},
      calculated_at: new Date().toISOString(),
    });
    return null;
  }

  const [{ data: companyRow }, { data: billingRow }] = await Promise.all([
    supabase.from('companies').select('settings').eq('id', reportRow.owner_company_id).single(),
    supabase
      .from('work_report_billing')
      .select('customer_rates_override, use_custom_customer_rates')
      .eq('work_report_id', reportRow.id)
      .maybeSingle(),
  ]);

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

  const calculation = calculateWorkReportCustomerBillable({
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
      calculated_at: new Date().toISOString(),
    }),
    supabase.from('work_report_billing').upsert({
      work_report_id: reportRow.id,
      customer_invoice_amount: calculation.grandTotal,
      use_custom_customer_rates: storedUseCustom,
      customer_rates_override: storedUseCustom ? storedOverride : null,
    }),
  ]);

  return calculation;
}

export async function ensureCustomerBillableCalculated(
  supabase: SupabaseClient,
  reportId: string,
): Promise<void> {
  const { data: reportData } = await supabase
    .from('work_reports')
    .select('id, owner_company_id, customers(name)')
    .eq('id', reportId)
    .single();

  if (!reportData) return;

  const logs = await loadWorkReportDailyLogs(supabase, reportId);
  await refreshAndPersistCustomerBillable(
    supabase,
    reportData as unknown as Pick<WorkReport, 'id' | 'owner_company_id' | 'customers'>,
    logs,
  );
}
