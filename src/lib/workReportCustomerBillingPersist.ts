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

const LOG_SELECT = `
  id, work_report_id, log_date, log_start_time, entry_type,
  hours_regular, hours_overtime, hours_on_call, fixed_price_amount, hourly_rate_override,
  customer_hourly_rate_override,
  commission_amount, commission_note, work_done, created_by, created_at,
  author_name_snapshot, author_deleted,
  expense_lines:work_report_daily_expense_lines(
    id, daily_log_id, expense_type, description, qty, unit_price, bill_to_partner, bill_to_customer, customer_unit_price, sort_order
  ),
  refrigerant_lines:work_report_refrigerant_lines(
    id, daily_log_id, work_report_id, source, cylinder_id, warehouse_company_id, owner_user_id, supplier_name,
    supplier_paid_by, unit_price, customer_unit_price, bill_to_customer,
    refrigerant_type, qty_kg, notes, created_by, created_at,
    cylinder:refrigerant_cylinders(serial_number, refrigerant_type),
    warehouse_company:companies!work_report_refrigerant_lines_warehouse_company_id_fkey(name),
    owner_user:profiles!work_report_refrigerant_lines_owner_user_id_fkey(display_name)
  )
`;

export async function loadWorkReportDailyLogs(
  supabase: SupabaseClient,
  workReportId: string,
): Promise<WorkReportDailyLog[]> {
  const { data } = await supabase
    .from('work_report_daily_logs')
    .select(LOG_SELECT)
    .eq('work_report_id', workReportId)
    .order('log_date', { ascending: false });
  return (data as unknown as WorkReportDailyLog[]) ?? [];
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
  const [{ data: reportData }, { data: billableRow }] = await Promise.all([
    supabase
      .from('work_reports')
      .select('id, owner_company_id, customers(name)')
      .eq('id', reportId)
      .single(),
    supabase
      .from('work_report_billable')
      .select('customer_total, customer_calculation')
      .eq('work_report_id', reportId)
      .maybeSingle(),
  ]);

  if (!reportData) return;

  const calc = billableRow?.customer_calculation as { byUser?: unknown[] } | null | undefined;
  if (Number(billableRow?.customer_total ?? 0) > 0 && (calc?.byUser?.length ?? 0) > 0) {
    return;
  }

  const logs = await loadWorkReportDailyLogs(supabase, reportId);
  if (!shouldCalculateCustomerBilling(logs)) return;

  await refreshAndPersistCustomerBillable(
    supabase,
    reportData as unknown as Pick<WorkReport, 'id' | 'owner_company_id' | 'customers'>,
    logs,
  );
}
