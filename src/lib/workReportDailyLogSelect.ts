import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { WorkReportDailyLog } from '../types';

/** Expense line columns safe before migration 20260603000081. */
export const EXPENSE_LINE_FIELDS_BASE =
  'id, daily_log_id, expense_type, description, qty, unit_price, bill_to_customer, customer_unit_price, sort_order';

export const EXPENSE_LINE_FIELDS_WITH_PARTNER =
  'id, daily_log_id, expense_type, description, qty, unit_price, bill_to_partner, bill_to_customer, customer_unit_price, sort_order';

export const EXPENSE_LINE_FIELDS_WITH_WAREHOUSE =
  'id, daily_log_id, expense_type, description, qty, unit_price, bill_to_partner, bill_to_customer, customer_unit_price, warehouse_company_id, warehouse_cost_deducted, sort_order';

export const EXPENSE_LINE_FIELDS_WITH_EXTRA_BILLING =
  'id, daily_log_id, expense_type, description, qty, unit_price, bill_to_partner, bill_to_customer, customer_unit_price, extra_billable, extra_billing_allowed, customer_margin_percent, warehouse_company_id, warehouse_cost_deducted, sort_order';

export function isMissingHoursAgreedRegularColumn(error: PostgrestError | null | undefined): boolean {
  if (!error?.message) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('hours_agreed_regular') &&
    (msg.includes('does not exist') ||
      msg.includes('could not find') ||
      msg.includes('schema cache'))
  );
}

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

export function isMissingExpenseExtraBillingColumn(error: PostgrestError | null | undefined): boolean {
  if (!error?.message) return false;
  const msg = error.message.toLowerCase();
  return (
    (msg.includes('extra_billable')
      || msg.includes('extra_billing_allowed')
      || msg.includes('customer_margin_percent')) &&
    (msg.includes('does not exist') ||
      msg.includes('could not find') ||
      msg.includes('schema cache'))
  );
}

export function isMissingWarehouseExpenseColumn(error: PostgrestError | null | undefined): boolean {
  if (!error?.message) return false;
  const msg = error.message.toLowerCase();
  return (
    (msg.includes('warehouse_company_id') || msg.includes('warehouse_cost_deducted')) &&
    (msg.includes('does not exist') ||
      msg.includes('could not find') ||
      msg.includes('schema cache'))
  );
}

export function expenseLinesSelectFragment(
  includeBillToPartner: boolean,
  includeWarehouse = true,
  includeExtraBilling = true,
): string {
  const fields =
    includeExtraBilling && includeWarehouse
      ? EXPENSE_LINE_FIELDS_WITH_EXTRA_BILLING
      : includeWarehouse
        ? EXPENSE_LINE_FIELDS_WITH_WAREHOUSE
        : includeBillToPartner
          ? EXPENSE_LINE_FIELDS_WITH_PARTNER
          : EXPENSE_LINE_FIELDS_BASE;
  return `expense_lines:work_report_daily_expense_lines(${fields})`;
}

export const PARTNER_PURCHASE_LINE_FIELDS =
  'id, daily_log_id, work_report_id, partner_company_id, supplier_name, description, qty, unit_price, partner_margin_percent, cost_deducted, inventory_kind, inventory_item_id, inventory_tool_ids, sort_order, created_by, created_at';

export function isMissingPartnerPurchaseInventoryColumn(error: PostgrestError | null | undefined): boolean {
  if (!error?.message) return false;
  const msg = error.message.toLowerCase();
  return (
    (msg.includes('inventory_kind') || msg.includes('inventory_item_id') || msg.includes('inventory_tool_ids')) &&
    (msg.includes('does not exist') ||
      msg.includes('could not find') ||
      msg.includes('schema cache'))
  );
}

export const PARTNER_PURCHASE_LINE_FIELDS_LEGACY =
  'id, daily_log_id, work_report_id, partner_company_id, supplier_name, description, qty, unit_price, partner_margin_percent, cost_deducted, sort_order, created_by, created_at';

export function isMissingPartnerPurchaseTable(error: PostgrestError | null | undefined): boolean {
  if (!error?.message) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('work_report_partner_purchase_lines') &&
    (msg.includes('does not exist') ||
      msg.includes('could not find') ||
      msg.includes('schema cache'))
  );
}

export function partnerPurchaseLinesSelectFragment(
  includePartnerPurchases = true,
  includeInventory = true,
): string {
  if (!includePartnerPurchases) return '';
  const fields = includeInventory ? PARTNER_PURCHASE_LINE_FIELDS : PARTNER_PURCHASE_LINE_FIELDS_LEGACY;
  return `partner_purchase_lines:work_report_partner_purchase_lines(${fields}, partner_company:companies!work_report_partner_purchase_lines_partner_company_id_fkey(name))`;
}

function dailyLogHourFields(includeAgreedRegular: boolean): string {
  const agreed = includeAgreedRegular ? ', hours_agreed_regular' : '';
  return `hours_regular, hours_overtime, hours_on_call${agreed}`;
}

export function buildWorkReportDetailLogSelect(
  includeBillToPartner: boolean,
  includeWarehouse = true,
  includePartnerPurchases = true,
  includePartnerPurchaseInventory = true,
  includeAgreedRegular = true,
  includeExtraBilling = true,
): string {
  const expenseLines = expenseLinesSelectFragment(includeBillToPartner, includeWarehouse, includeExtraBilling);
  const partnerPurchases = partnerPurchaseLinesSelectFragment(includePartnerPurchases, includePartnerPurchaseInventory);
  return `
  id, work_report_id, log_date, log_start_time, entry_type,
  ${dailyLogHourFields(includeAgreedRegular)}, fixed_price_amount,
  customer_fixed_price_amount, partner_urakka_margin_percent,
  hourly_rate_override, customer_hourly_rate_override,
  commission_amount, commission_note, customer_extra_beyond_quote, customer_extra_billing, work_done, created_by, created_at,
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
  )${partnerPurchases ? `,\n  ${partnerPurchases}` : ''},
  images:work_report_daily_log_images(id, daily_log_id, storage_path, file_name, mime_type, caption)
`;
}

export function buildWorkReportPrintLogSelect(
  includeBillToPartner: boolean,
  includeWarehouse = true,
  includeAgreedRegular = true,
  includeExtraBilling = true,
): string {
  const expenseLines = expenseLinesSelectFragment(includeBillToPartner, includeWarehouse, includeExtraBilling);
  return `
  id, work_report_id, log_date, entry_type,
  ${dailyLogHourFields(includeAgreedRegular)}, fixed_price_amount,
  customer_fixed_price_amount, partner_urakka_margin_percent,
  hourly_rate_override, customer_hourly_rate_override,
  commission_amount, commission_note, customer_extra_beyond_quote, customer_extra_billing, work_done, created_by, created_at,
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

export function buildCustomerBillingLogSelect(
  includeBillToPartner: boolean,
  includeWarehouse = true,
  includeAgreedRegular = true,
  includeExtraBilling = true,
): string {
  const expenseLines = expenseLinesSelectFragment(includeBillToPartner, includeWarehouse, includeExtraBilling);
  return `
  id, work_report_id, log_date, log_start_time, entry_type,
  ${dailyLogHourFields(includeAgreedRegular)}, fixed_price_amount,
  customer_fixed_price_amount, partner_urakka_margin_percent,
  hourly_rate_override, customer_hourly_rate_override,
  commission_amount, commission_note, customer_extra_beyond_quote, customer_extra_billing, work_done, created_by, created_at,
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
  agreedRegularSupported: boolean;
}> {
  const run = (
    includeBillToPartner: boolean,
    includeWarehouse: boolean,
    includePartnerPurchases: boolean,
    includePartnerPurchaseInventory = true,
    includeAgreedRegular = true,
    includeExtraBilling = true,
  ) =>
    queryDailyLogs(
      supabase,
      workReportId,
      buildWorkReportDetailLogSelect(
        includeBillToPartner,
        includeWarehouse,
        includePartnerPurchases,
        includePartnerPurchaseInventory,
        includeAgreedRegular,
        includeExtraBilling,
      ),
    );

  let includeAgreedRegular = true;
  let includeExtraBilling = true;
  let result = await run(true, true, true, true, includeAgreedRegular, includeExtraBilling);
  if (isMissingExpenseExtraBillingColumn(result.error)) {
    includeExtraBilling = false;
    result = await run(true, true, true, true, includeAgreedRegular, includeExtraBilling);
  }
  if (isMissingHoursAgreedRegularColumn(result.error)) {
    includeAgreedRegular = false;
    result = await run(true, true, true, true, includeAgreedRegular, includeExtraBilling);
  }
  if (isMissingPartnerPurchaseInventoryColumn(result.error)) {
    result = await run(true, true, true, false, includeAgreedRegular, includeExtraBilling);
  }
  if (isMissingPartnerPurchaseTable(result.error)) {
    result = await run(true, true, false, false, includeAgreedRegular, includeExtraBilling);
  }
  if (isMissingWarehouseExpenseColumn(result.error)) {
    result = await run(
      true,
      false,
      !isMissingPartnerPurchaseTable(result.error),
      false,
      includeAgreedRegular,
      includeExtraBilling,
    );
  }
  if (isMissingPartnerPurchaseTable(result.error)) {
    result = await run(true, false, false, false, includeAgreedRegular, includeExtraBilling);
  }
  if (isMissingBillToPartnerColumn(result.error)) {
    result = await run(false, true, true, true, includeAgreedRegular, includeExtraBilling);
    if (isMissingPartnerPurchaseInventoryColumn(result.error)) {
      result = await run(false, true, true, false, includeAgreedRegular, includeExtraBilling);
    }
    if (isMissingPartnerPurchaseTable(result.error)) {
      result = await run(false, true, false, false, includeAgreedRegular, includeExtraBilling);
    }
    if (isMissingWarehouseExpenseColumn(result.error)) {
      result = await run(false, false, true, false, includeAgreedRegular, includeExtraBilling);
    }
    if (isMissingPartnerPurchaseTable(result.error)) {
      result = await run(false, false, false, false, includeAgreedRegular, includeExtraBilling);
    }
    return {
      logs: (result.data as unknown as WorkReportDailyLog[]) ?? [],
      error: result.error,
      billToPartnerSupported: false,
      agreedRegularSupported: includeAgreedRegular,
    };
  }
  return {
    logs: (result.data as unknown as WorkReportDailyLog[]) ?? [],
    error: result.error,
    billToPartnerSupported: true,
    agreedRegularSupported: includeAgreedRegular,
  };
}

export async function fetchWorkReportPrintLogs(
  supabase: SupabaseClient,
  workReportId: string,
): Promise<{ logs: WorkReportDailyLog[]; error: PostgrestError | null }> {
  const run = (
    includeBillToPartner: boolean,
    includeWarehouse: boolean,
    includeAgreedRegular = true,
    includeExtraBilling = true,
  ) =>
    supabase
      .from('work_report_daily_logs')
      .select(
        buildWorkReportPrintLogSelect(
          includeBillToPartner,
          includeWarehouse,
          includeAgreedRegular,
          includeExtraBilling,
        ),
      )
      .eq('work_report_id', workReportId)
      .order('log_date', { ascending: true })
      .order('created_at', { ascending: true });

  let includeAgreedRegular = true;
  let includeExtraBilling = true;
  let result = await run(true, true, includeAgreedRegular, includeExtraBilling);
  if (isMissingExpenseExtraBillingColumn(result.error)) {
    includeExtraBilling = false;
    result = await run(true, true, includeAgreedRegular, includeExtraBilling);
  }
  if (isMissingHoursAgreedRegularColumn(result.error)) {
    includeAgreedRegular = false;
    result = await run(true, true, includeAgreedRegular, includeExtraBilling);
  }
  if (isMissingWarehouseExpenseColumn(result.error)) {
    result = await run(true, false, includeAgreedRegular, includeExtraBilling);
  }
  if (isMissingBillToPartnerColumn(result.error)) {
    result = await run(
      false,
      isMissingWarehouseExpenseColumn(result.error) ? false : true,
      includeAgreedRegular,
      includeExtraBilling,
    );
    if (isMissingWarehouseExpenseColumn(result.error)) {
      result = await run(false, false, includeAgreedRegular, includeExtraBilling);
    }
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
  const run = (
    includeBillToPartner: boolean,
    includeWarehouse: boolean,
    includeAgreedRegular = true,
    includeExtraBilling = true,
  ) =>
    supabase
      .from('work_report_daily_logs')
      .select(
        buildCustomerBillingLogSelect(
          includeBillToPartner,
          includeWarehouse,
          includeAgreedRegular,
          includeExtraBilling,
        ),
      )
      .eq('work_report_id', workReportId)
      .order('log_date', { ascending: false });

  let includeAgreedRegular = true;
  let includeExtraBilling = true;
  let result = await run(true, true, includeAgreedRegular, includeExtraBilling);
  if (isMissingExpenseExtraBillingColumn(result.error)) {
    includeExtraBilling = false;
    result = await run(true, true, includeAgreedRegular, includeExtraBilling);
  }
  if (isMissingHoursAgreedRegularColumn(result.error)) {
    includeAgreedRegular = false;
    result = await run(true, true, includeAgreedRegular, includeExtraBilling);
  }
  if (isMissingWarehouseExpenseColumn(result.error)) {
    result = await run(true, false, includeAgreedRegular, includeExtraBilling);
  }
  if (isMissingBillToPartnerColumn(result.error)) {
    result = await run(
      false,
      isMissingWarehouseExpenseColumn(result.error) ? false : true,
      includeAgreedRegular,
      includeExtraBilling,
    );
    if (isMissingWarehouseExpenseColumn(result.error)) {
      result = await run(false, false, includeAgreedRegular, includeExtraBilling);
    }
  }
  return {
    logs: (result.data as unknown as WorkReportDailyLog[]) ?? [],
    error: result.error,
  };
}
