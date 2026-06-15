import type { SupabaseClient } from '@supabase/supabase-js';
import type { InvoiceStatus, WorkReport, WorkReportDailyLog } from '../types';
import {
  parseCompanySettings,
  parsePartnerBillingRates,
  readPartnershipBillingRates,
  resolveBillingRates,
  type PartnerBillingRates,
} from './management';
import {
  calculateWorkReportBillable,
  shouldCalculatePartnerBilling,
  type UserBillingProfile,
} from './workReportBilling';
import { isBillablePartnerReport } from './workReportBillingCopy';
import { fetchWorkReportDetailLogs } from './workReportDailyLogSelect';

type PartnerBillableReport = Pick<
  WorkReport,
  | 'id'
  | 'owner_company_id'
  | 'created_by_company_id'
  | 'delegate_company_id'
  | 'partnership_id'
  | 'owner_company'
  | 'delegate_company'
>;

async function loadBillableUsers(
  supabase: SupabaseClient,
  logs: WorkReportDailyLog[],
): Promise<UserBillingProfile[]> {
  const userIds = [...new Set(logs.map((log) => log.created_by).filter(Boolean))] as string[];
  if (userIds.length === 0) return [];

  const { data: profileRows } = await supabase
    .from('profiles')
    .select('id, display_name, bill_hours_enabled, bill_expenses_enabled')
    .in('id', userIds);

  return (profileRows as UserBillingProfile[]) ?? [];
}

export async function refreshAndPersistPartnerBillable(
  supabase: SupabaseClient,
  reportRow: PartnerBillableReport,
  logs: WorkReportDailyLog[],
  rateOptions?: { useCustomRates?: boolean; reportRates?: PartnerBillingRates },
) {
  const users = await loadBillableUsers(supabase, logs);
  const billingApplies = shouldCalculatePartnerBilling(logs, users);

  if (!billingApplies) {
    await supabase.from('work_report_billable').upsert({
      work_report_id: reportRow.id,
      partner_total: 0,
      calculation: {},
      calculated_at: new Date().toISOString(),
    });
    return null;
  }

  const isDelegatedOrder =
    !!reportRow.delegate_company_id && reportRow.created_by_company_id === reportRow.owner_company_id;
  const isPartnerReport =
    reportRow.created_by_company_id !== reportRow.owner_company_id || isDelegatedOrder;
  if (!isPartnerReport) return null;

  const billedCompanyId = isDelegatedOrder
    ? reportRow.delegate_company_id!
    : reportRow.owner_company_id;

  const [{ data: companyRow }, { data: billableRow }] = await Promise.all([
    supabase.from('companies').select('settings').eq('id', reportRow.created_by_company_id).single(),
    supabase
      .from('work_report_billable')
      .select('billing_rates_override, use_custom_rates')
      .eq('work_report_id', reportRow.id)
      .maybeSingle(),
  ]);

  const settings = parseCompanySettings((companyRow as { settings: unknown } | null)?.settings);

  let partnershipRates: PartnerBillingRates = {};
  let partnershipRatesFallback: PartnerBillingRates = {};
  const partnershipQuery = reportRow.partnership_id
    ? supabase
        .from('company_partnerships')
        .select('company_a_id, company_b_id, billing_rates_a_to_b, billing_rates_b_to_a')
        .eq('id', reportRow.partnership_id)
        .maybeSingle()
    : supabase
        .from('company_partnerships')
        .select('company_a_id, company_b_id, billing_rates_a_to_b, billing_rates_b_to_a')
        .eq('status', 'active')
        .or(
          `and(company_a_id.eq.${reportRow.created_by_company_id},company_b_id.eq.${billedCompanyId}),and(company_a_id.eq.${billedCompanyId},company_b_id.eq.${reportRow.created_by_company_id})`,
        )
        .maybeSingle();

  const { data: partnership } = await partnershipQuery;
  if (partnership) {
    const rates = readPartnershipBillingRates(
      partnership,
      reportRow.created_by_company_id,
      billedCompanyId,
    );
    partnershipRates = rates.primary;
    partnershipRatesFallback = rates.fallback;
  }

  const storedUseCustom = rateOptions?.useCustomRates ?? billableRow?.use_custom_rates ?? false;
  const storedOverride = parsePartnerBillingRates(
    rateOptions?.reportRates ?? billableRow?.billing_rates_override,
  );

  const { rates, source } = resolveBillingRates({
    companyDefaults: settings.billing?.partner_rates ?? {},
    partnershipRates,
    partnershipRatesFallback,
    reportOverride: storedOverride,
    useReportRates: storedUseCustom,
  });

  const calculation = calculateWorkReportBillable({
    logs,
    users,
    rates,
    ratesSource: source,
    billToCompanyId: billedCompanyId,
    billToCompanyName: isDelegatedOrder
      ? (reportRow.delegate_company?.name ?? null)
      : (reportRow.owner_company?.name ?? null),
  });

  await supabase.from('work_report_billable').upsert({
    work_report_id: reportRow.id,
    partner_total: calculation.grandTotal,
    calculation,
    calculated_at: new Date().toISOString(),
    use_custom_rates: storedUseCustom,
    billing_rates_override: storedUseCustom ? storedOverride : null,
  });

  const { data: existingBilling } = await supabase
    .from('work_report_billing')
    .select('partner_billed_amount, partner_invoice_status')
    .eq('work_report_id', reportRow.id)
    .maybeSingle();

  const billedAmount = Number(existingBilling?.partner_billed_amount ?? 0);
  const grandTotal = calculation.grandTotal;
  let invoiceStatus = (existingBilling?.partner_invoice_status ?? 'none') as InvoiceStatus;

  if (billedAmount > 0.005) {
    invoiceStatus = grandTotal > billedAmount + 0.005 ? 'partial' : 'paid';
  } else if (invoiceStatus === 'paid' || invoiceStatus === 'partial') {
    invoiceStatus = 'none';
  }

  await supabase.from('work_report_billing').upsert({
    work_report_id: reportRow.id,
    partner_invoice_amount: grandTotal,
    billed_to_company_id: billedCompanyId,
    partner_invoice_status: invoiceStatus,
    ...(billedAmount > 0.005 ? { partner_billed_amount: billedAmount } : {}),
  });

  return calculation;
}

export async function ensurePartnerBillableCalculated(
  supabase: SupabaseClient,
  reportId: string,
): Promise<void> {
  const { data: reportData } = await supabase
    .from('work_reports')
    .select(`
      id, owner_company_id, created_by_company_id, delegate_company_id, partnership_id,
      owner_company:companies!work_reports_owner_company_id_fkey(name),
      delegate_company:companies!work_reports_delegate_company_id_fkey(name)
    `)
    .eq('id', reportId)
    .single();

  if (!reportData || !isBillablePartnerReport(reportData)) return;

  const { logs, error } = await fetchWorkReportDetailLogs(supabase, reportId);
  if (error) {
    console.error('Päiväkirjausten lataus epäonnistui:', error.message);
    return;
  }

  const users = await loadBillableUsers(supabase, logs);
  if (!shouldCalculatePartnerBilling(logs, users)) {
    await supabase.from('work_report_billable').upsert({
      work_report_id: reportId,
      partner_total: 0,
      calculation: {},
      calculated_at: new Date().toISOString(),
    });
    return;
  }

  await refreshAndPersistPartnerBillable(
    supabase,
    reportData as unknown as PartnerBillableReport,
    logs,
  );
}
