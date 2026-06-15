import type { SupabaseClient } from '@supabase/supabase-js';
import type { InvoiceStatus, WorkReport, WorkReportDailyLog } from '../types';
import {
  hasPartnerBillingRates,
  parseCompanySettings,
  parsePartnerBillingRates,
  partnershipBillingRatesFieldPartnerChargesOwner,
  readPartnershipBillingRates,
  resolveBillingRates,
  type PartnerBillingRates,
} from './management';
import {
  calculateWorkReportBillable,
  shouldCalculatePartnerBilling,
  type UserBillingProfile,
} from './workReportBilling';
import { isBillablePartnerReport, resolvePartnerBilledCompanyId } from './workReportBillingCopy';
import { fetchWorkReportDetailLogs } from './workReportDailyLogSelect';
import { findStaleBillableReportIds } from './workReportBillableStale';
import { parseTripKmRate } from './tripKmExpense';

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

const EMPTY_PARTNER_CALCULATION = {
  version: 2 as const,
  billToCompanyId: null,
  billToCompanyName: null,
  ratesUsed: { hourly_regular: 0, hourly_overtime: 0, hourly_on_call: 0 },
  ratesSource: 'company_default' as const,
  byUser: [],
  grandTotal: 0,
  excludedTotal: 0,
};

async function clearPartnerBillableWhenEmpty(
  supabase: SupabaseClient,
  reportRow: PartnerBillableReport,
) {
  const billedCompanyId = resolvePartnerBilledCompanyId(reportRow);
  const { data: existingBilling } = await supabase
    .from('work_report_billing')
    .select('partner_invoice_status, partner_billed_amount')
    .eq('work_report_id', reportRow.id)
    .maybeSingle();

  const isPaid = existingBilling?.partner_invoice_status === 'paid';
  const billedAmount = Number(existingBilling?.partner_billed_amount ?? 0);

  const { error: billableError } = await supabase.from('work_report_billable').upsert({
    work_report_id: reportRow.id,
    partner_total: 0,
    calculation: EMPTY_PARTNER_CALCULATION,
    calculated_at: new Date().toISOString(),
    partner_recalc_needed: false,
  });
  if (billableError) throw new Error(billableError.message);

  if (isPaid) return;

  const { error: billingError } = await supabase.from('work_report_billing').upsert({
    work_report_id: reportRow.id,
    partner_invoice_amount: 0,
    billed_to_company_id: billedCompanyId,
    partner_invoice_status: billedAmount > 0.005 ? 'partial' : 'none',
    ...(billedAmount > 0.005 ? { partner_billed_amount: billedAmount } : {}),
  });
  if (billingError) throw new Error(billingError.message);
}

function resolvePartnerInvoiceStatus(
  existingStatus: InvoiceStatus,
  grandTotal: number,
  billedAmount: number,
): InvoiceStatus {
  if (billedAmount > 0.005) {
    return grandTotal > billedAmount + 0.005 ? 'partial' : 'paid';
  }
  if (existingStatus === 'paid' || existingStatus === 'partial') {
    return grandTotal > 0.005 ? 'partial' : existingStatus;
  }
  return 'none';
}

export async function refreshAndPersistPartnerBillable(
  supabase: SupabaseClient,
  reportRow: PartnerBillableReport,
  logs: WorkReportDailyLog[],
  rateOptions?: {
    useCustomRates?: boolean;
    reportRates?: PartnerBillingRates;
    viewerCompanyId?: string | null;
  },
) {
  const users = await loadBillableUsers(supabase, logs);
  const billingApplies = shouldCalculatePartnerBilling(logs, users);

  if (!billingApplies) {
    await clearPartnerBillableWhenEmpty(supabase, reportRow);
    return null;
  }

  const isDelegatedOrder =
    !!reportRow.delegate_company_id && reportRow.created_by_company_id === reportRow.owner_company_id;
  const isPartnerReport =
    reportRow.created_by_company_id !== reportRow.owner_company_id || isDelegatedOrder;
  if (!isPartnerReport) return null;

  const billedCompanyId = resolvePartnerBilledCompanyId(reportRow);

  const isIncomingToViewer =
    !!rateOptions?.viewerCompanyId
    && reportRow.owner_company_id === rateOptions.viewerCompanyId
    && reportRow.created_by_company_id !== rateOptions.viewerCompanyId;

  const isDelegateViewer =
    !!rateOptions?.viewerCompanyId
    && reportRow.delegate_company_id === rateOptions.viewerCompanyId
    && reportRow.created_by_company_id === reportRow.owner_company_id;

  const loadViewerSettings = isIncomingToViewer || isDelegateViewer;

  const [{ data: companyRow }, { data: viewerCompanyRow }, { data: billableRow }] = await Promise.all([
    supabase.from('companies').select('settings').eq('id', reportRow.created_by_company_id).single(),
    loadViewerSettings
      ? supabase.from('companies').select('settings').eq('id', rateOptions!.viewerCompanyId!).single()
      : Promise.resolve({ data: null }),
    supabase
      .from('work_report_billable')
      .select('billing_rates_override, use_custom_rates')
      .eq('work_report_id', reportRow.id)
      .maybeSingle(),
  ]);

  const settings = parseCompanySettings((companyRow as { settings: unknown } | null)?.settings);
  const viewerSettings = parseCompanySettings(
    (viewerCompanyRow as { settings: unknown } | null)?.settings,
  );

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

    if (isIncomingToViewer && rateOptions?.viewerCompanyId) {
      const ownerChargeField = partnershipBillingRatesFieldPartnerChargesOwner(
        partnership,
        rateOptions.viewerCompanyId,
        reportRow.created_by_company_id,
      );
      if (ownerChargeField) {
        const ownerChargeRates = parsePartnerBillingRates(partnership[ownerChargeField]);
        if (hasPartnerBillingRates(ownerChargeRates)) {
          partnershipRates = ownerChargeRates;
        }
      }
    }

    if (isDelegateViewer && rateOptions?.viewerCompanyId) {
      const delegateRates = readPartnershipBillingRates(
        partnership,
        reportRow.created_by_company_id,
        reportRow.delegate_company_id!,
      );
      if (hasPartnerBillingRates(delegateRates.primary)) {
        partnershipRates = delegateRates.primary;
      } else if (hasPartnerBillingRates(delegateRates.fallback)) {
        partnershipRates = delegateRates.fallback;
      }
    }
  }

  const storedUseCustom = rateOptions?.useCustomRates ?? billableRow?.use_custom_rates ?? false;
  const storedOverride = parsePartnerBillingRates(
    rateOptions?.reportRates ?? billableRow?.billing_rates_override,
  );

  const companyDefaults = loadViewerSettings
    ? {
        ...(settings.billing?.partner_rates ?? {}),
        ...(viewerSettings.billing?.partner_rates ?? {}),
      }
    : (settings.billing?.partner_rates ?? {});

  const { rates, source } = resolveBillingRates({
    companyDefaults,
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
    tripKmRate: parseTripKmRate(settings) ?? parseTripKmRate(viewerSettings),
  });

  const { error: billableError } = await supabase.from('work_report_billable').upsert({
    work_report_id: reportRow.id,
    partner_total: calculation.grandTotal,
    calculation,
    calculated_at: new Date().toISOString(),
    partner_recalc_needed: false,
    use_custom_rates: storedUseCustom,
    billing_rates_override: storedUseCustom ? storedOverride : null,
  });
  if (billableError) {
    throw new Error(billableError.message);
  }

  const { data: existingBilling } = await supabase
    .from('work_report_billing')
    .select('partner_billed_amount, partner_invoice_status')
    .eq('work_report_id', reportRow.id)
    .maybeSingle();

  const billedAmount = Number(existingBilling?.partner_billed_amount ?? 0);
  const grandTotal = calculation.grandTotal;
  const existingStatus = (existingBilling?.partner_invoice_status ?? 'none') as InvoiceStatus;
  const invoiceStatus = resolvePartnerInvoiceStatus(existingStatus, grandTotal, billedAmount);

  const upsertBilling: Record<string, unknown> = {
    work_report_id: reportRow.id,
    partner_invoice_amount: grandTotal,
    billed_to_company_id: billedCompanyId,
    partner_invoice_status: invoiceStatus,
  };

  if (invoiceStatus === 'paid') {
    upsertBilling.partner_billed_amount = billedAmount > 0.005 ? billedAmount : grandTotal;
  } else if (billedAmount > 0.005) {
    upsertBilling.partner_billed_amount = billedAmount;
  }

  const { error: billingError } = await supabase.from('work_report_billing').upsert(upsertBilling);
  if (billingError) {
    throw new Error(billingError.message);
  }

  return calculation;
}

export async function markPartnerBillableRecalcNeeded(
  supabase: SupabaseClient,
  workReportId: string,
): Promise<void> {
  const { error } = await supabase.rpc('mark_partner_billable_recalc_needed', {
    p_work_report_id: workReportId,
  });
  if (error) {
    console.error('Kumppanilaskelman merkintä epäonnistui:', error.message);
  }
}

export async function ensurePartnerBillableCalculated(
  supabase: SupabaseClient,
  reportId: string,
  viewerCompanyId?: string | null,
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

  const { data: existingBilling } = await supabase
    .from('work_report_billing')
    .select('partner_invoice_status, partner_billed_amount')
    .eq('work_report_id', reportId)
    .maybeSingle();

  const { data: billableFlags } = await supabase
    .from('work_report_billable')
    .select('partner_recalc_needed')
    .eq('work_report_id', reportId)
    .maybeSingle();

  const isFullyPaid =
    existingBilling?.partner_invoice_status === 'paid'
    && Number(existingBilling.partner_billed_amount ?? 0) > 0.005
    && billableFlags?.partner_recalc_needed !== true;

  if (isFullyPaid) return;

  const { logs, error } = await fetchWorkReportDetailLogs(supabase, reportId);
  if (error) {
    console.error('Päiväkirjausten lataus epäonnistui:', error.message);
    return;
  }

  const users = await loadBillableUsers(supabase, logs);
  if (!shouldCalculatePartnerBilling(logs, users)) return;

  await refreshAndPersistPartnerBillable(
    supabase,
    reportData as unknown as PartnerBillableReport,
    logs,
    { viewerCompanyId },
  );
}

export async function ensurePartnerBillableCalculatedWhenNeeded(
  supabase: SupabaseClient,
  reportId: string,
): Promise<void> {
  const { data: billableRow } = await supabase
    .from('work_report_billable')
    .select('calculated_at, partner_total, calculation')
    .eq('work_report_id', reportId)
    .maybeSingle();

  const calc = billableRow?.calculation as { byUser?: unknown[] } | null | undefined;
  const hasPartnerCalculation =
    Number(billableRow?.partner_total ?? 0) > 0 && (calc?.byUser?.length ?? 0) > 0;

  if (hasPartnerCalculation && billableRow?.calculated_at) {
    const staleIds = await findStaleBillableReportIds(supabase, [
      {
        workReportId: reportId,
        calculatedAt: billableRow.calculated_at,
        hasCalculation: true,
        calculation: billableRow.calculation,
      },
    ]);
    if (!staleIds.includes(reportId)) return;
  }

  await ensurePartnerBillableCalculated(supabase, reportId);
}
