import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { WorkReportDailyLog } from '../types';

/** Expense line columns safe before migration 20260603000081. */
export const EXPENSE_LINE_FIELDS_BASE =
  'id, daily_log_id, expense_type, description, qty, unit_price, bill_to_customer, customer_unit_price, sort_order';

export const EXPENSE_LINE_FIELDS_WITH_PARTNER =
  'id, daily_log_id, expense_type, description, qty, unit_price, bill_to_partner, bill_to_customer, customer_unit_price, sort_order';

export function isMissingBillToPartnerColumn(error: PostgrestError | null | undefined): boolean {
  if (!error?.message) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('bill_to_partner') &&
    (msg.includes('does not exist') ||
      msg.includes('could not find') ||
      msg.includes('schema cache'))
  );
}

export function expenseLinesSelectFragment(includeBillToPartner: boolean): string {
  const fields = includeBillToPartner ? EXPENSE_LINE_FIELDS_WITH_PARTNER : EXPENSE_LINE_FIELDS_BASE;
  return `expense_lines:work_report_daily_expense_lines(${fields})`;
}

export function buildWorkReportDetailLogSelect(includeBillToPartner: boolean): string {
  const expenseLines = expenseLinesSelectFragment(includeBillToPartner);
  return `
  id, work_report_id, log_date, log_start_time, entry_type,
  hours_regular, hours_overtime, hours_on_call, fixed_price_amount,
  customer_fixed_price_amount, partner_urakka_margin_percent,
  hourly_rate_override, customer_hourly_rate_override,
  commission_amount, commission_note, work_done, created_by, created_at,
  author_name_snapshot, author_deleted,
  author:profiles!work_report_daily_logs_created_by_fkey(display_name),
  ${expenseLines},
  trip_legs:work_report_daily_trip_legs(id, daily_log_id, from_label, to_label, distance_km, bill_to_customer, sort_order),
  refrigerant_lines:work_report_refrigerant_lines(
    id, daily_log_id, work_report_id, source, cylinder_id, warehouse_company_id, owner_user_id, supplier_name,
    supplier_paid_by, unit_price, customer_unit_price, bill_to_customer, warehouse_cost_deducted,
    refrigerant_type, qty_kg, notes, cylinder_disposition, created_by, created_at,
    cylinder:refrigerant_cylinders(serial_number, refrigerant_type, bottle_size, notes),
    warehouse_company:companies!work_report_refrigerant_lines_warehouse_company_id_fkey(name),
    owner_user:profiles!work_report_refrigerant_lines_owner_user_id_fkey(display_name)
  ),
  images:work_report_daily_log_images(id, daily_log_id, storage_path, file_name, mime_type, caption)
`;
}

export function buildWorkReportPrintLogSelect(includeBillToPartner: boolean): string {
  const expenseLines = expenseLinesSelectFragment(includeBillToPartner);
  return `
  id, work_report_id, log_date, entry_type,
  hours_regular, hours_overtime, hours_on_call, fixed_price_amount,
  customer_fixed_price_amount, partner_urakka_margin_percent,
  hourly_rate_override, customer_hourly_rate_override,
  commission_amount, commission_note, work_done, created_by, created_at,
  author_name_snapshot, author_deleted,
  author:profiles!work_report_daily_logs_created_by_fkey(display_name),
  ${expenseLines},
  refrigerant_lines:work_report_refrigerant_lines(
    id, daily_log_id, work_report_id, source, cylinder_id, warehouse_company_id, owner_user_id, supplier_name,
    supplier_paid_by, unit_price, customer_unit_price, bill_to_customer, warehouse_cost_deducted,
    refrigerant_type, qty_kg, notes, created_by, created_at,
    cylinder:refrigerant_cylinders(serial_number, refrigerant_type),
    warehouse_company:companies!work_report_refrigerant_lines_warehouse_company_id_fkey(name),
    owner_user:profiles!work_report_refrigerant_lines_owner_user_id_fkey(display_name)
  ),
  images:work_report_daily_log_images(id, daily_log_id, storage_path, file_name, mime_type, caption)
`;
}

export function buildCustomerBillingLogSelect(includeBillToPartner: boolean): string {
  const expenseLines = expenseLinesSelectFragment(includeBillToPartner);
  return `
  id, work_report_id, log_date, log_start_time, entry_type,
  hours_regular, hours_overtime, hours_on_call, fixed_price_amount,
  customer_fixed_price_amount, partner_urakka_margin_percent,
  hourly_rate_override, customer_hourly_rate_override,
  commission_amount, commission_note, work_done, created_by, created_at,
  author_name_snapshot, author_deleted,
  ${expenseLines},
  refrigerant_lines:work_report_refrigerant_lines(
    id, daily_log_id, work_report_id, source, cylinder_id, warehouse_company_id, owner_user_id, supplier_name,
    supplier_paid_by, unit_price, customer_unit_price, bill_to_customer, warehouse_cost_deducted,
    refrigerant_type, qty_kg, notes, created_by, created_at,
    cylinder:refrigerant_cylinders(serial_number, refrigerant_type),
    warehouse_company:companies!work_report_refrigerant_lines_warehouse_company_id_fkey(name),
    owner_user:profiles!work_report_refrigerant_lines_owner_user_id_fkey(display_name)
  )
`;
}

async function queryDailyLogs(
  supabase: SupabaseClient,
  workReportId: string,
  logSelect: string,
) {
  return supabase
    .from('work_report_daily_logs')
    .select(logSelect)
    .eq('work_report_id', workReportId)
    .order('log_date', { ascending: false })
    .order('created_at', { ascending: false });
}

export async function fetchWorkReportDetailLogs(
  supabase: SupabaseClient,
  workReportId: string,
): Promise<{
  logs: WorkReportDailyLog[];
  error: PostgrestError | null;
  billToPartnerSupported: boolean;
}> {
  const withPartner = buildWorkReportDetailLogSelect(true);
  let result = await queryDailyLogs(supabase, workReportId, withPartner);
  if (isMissingBillToPartnerColumn(result.error)) {
    const withoutPartner = buildWorkReportDetailLogSelect(false);
    result = await queryDailyLogs(supabase, workReportId, withoutPartner);
    return {
      logs: (result.data as unknown as WorkReportDailyLog[]) ?? [],
      error: result.error,
      billToPartnerSupported: false,
    };
  }
  return {
    logs: (result.data as unknown as WorkReportDailyLog[]) ?? [],
    error: result.error,
    billToPartnerSupported: true,
  };
}

export async function fetchWorkReportPrintLogs(
  supabase: SupabaseClient,
  workReportId: string,
): Promise<{ logs: WorkReportDailyLog[]; error: PostgrestError | null }> {
  const run = (logSelect: string) =>
    supabase
      .from('work_report_daily_logs')
      .select(logSelect)
      .eq('work_report_id', workReportId)
      .order('log_date', { ascending: true })
      .order('created_at', { ascending: true });

  const withPartner = buildWorkReportPrintLogSelect(true);
  let result = await run(withPartner);
  if (isMissingBillToPartnerColumn(result.error)) {
    result = await run(buildWorkReportPrintLogSelect(false));
  }
  return {
    logs: (result.data as unknown as WorkReportDailyLog[]) ?? [],
    error: result.error,
  };
}

export async function fetchCustomerBillingLogs(
  supabase: SupabaseClient,
  workReportId: string,
): Promise<{ logs: WorkReportDailyLog[]; error: PostgrestError | null }> {
  const withPartner = buildCustomerBillingLogSelect(true);
  let result = await supabase
    .from('work_report_daily_logs')
    .select(withPartner)
    .eq('work_report_id', workReportId)
    .order('log_date', { ascending: false });
  if (isMissingBillToPartnerColumn(result.error)) {
    result = await supabase
      .from('work_report_daily_logs')
      .select(buildCustomerBillingLogSelect(false))
      .eq('work_report_id', workReportId)
      .order('log_date', { ascending: false });
  }
  return {
    logs: (result.data as unknown as WorkReportDailyLog[]) ?? [],
    error: result.error,
  };
}
