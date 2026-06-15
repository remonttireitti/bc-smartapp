import type { SupabaseClient } from '@supabase/supabase-js';
import {
  EXPENSE_TYPE_LABELS,
  formatDate,
  formatHourEntry,
  type InvoiceStatus,
  type WorkReportDailyLog,
} from '../types';
import {
  companyBillingModuleEnabled,
  loadCompanyTracksCustomerInvoicing,
  parseCompanySettings,
} from './management';
import {
  formatRefrigerantLineLabel,
  refrigerantBillingReminder,
  refrigerantCustomerUnitPrice,
  refrigerantIncludedInCustomerBilling,
  refrigerantLineTotal,
} from './refrigerantInventory';

export type BillingListRow = {
  id: string;
  title: string;
  status: string;
  completed_at: string | null;
  scheduled_start: string | null;
  created_at: string;
  owner_company_id: string;
  created_by_company_id: string;
  delegate_company_id: string | null;
  customers: { name: string } | null;
  owner_company: { name: string } | null;
  delegate_company: { name: string } | null;
  billing: {
    partner_invoice_status: InvoiceStatus;
    partner_invoice_amount: number | null;
    partner_billed_amount: number | null;
    customer_invoice_status: InvoiceStatus;
    customer_invoice_amount: number | null;
    customer_billed_at: string | null;
  } | null;
  billable: {
    partner_total: number;
    calculation?: import('./workReportBilling').BillableCalculation;
    customer_total?: number;
    customer_calculation?: import('./workReportBilling').BillableCalculation;
    calculated_at?: string | null;
    partner_recalc_needed?: boolean;
  } | null;
  customer_id?: string | null;
};

export type BillingModuleMode = 'partner' | 'customer' | 'total';

export function resolveBillingRowMode(
  row: Pick<BillingListRow, 'owner_company_id' | 'created_by_company_id' | 'delegate_company_id'>,
): 'partner' | 'customer' {
  return isBillablePartnerReport(row) ? 'partner' : 'customer';
}

export function effectiveBillingRowMode(
  pageMode: BillingModuleMode,
  row: Pick<BillingListRow, 'owner_company_id' | 'created_by_company_id' | 'delegate_company_id'>,
): 'partner' | 'customer' {
  if (pageMode === 'total') return resolveBillingRowMode(row);
  return pageMode;
}

export function isBillableCustomerReport(
  row: Pick<BillingListRow, 'owner_company_id' | 'created_by_company_id' | 'delegate_company_id'>,
): boolean {
  return !isBillablePartnerReport(row);
}

export function billingRowHasPartnerCalculation(row: BillingListRow): boolean {
  const calc = row.billable?.calculation as { byUser?: unknown[] } | null | undefined;
  return Number(row.billable?.partner_total ?? 0) > 0 && (calc?.byUser?.length ?? 0) > 0;
}

export function billingRowHasCustomerCalculation(row: BillingListRow): boolean {
  const calc = row.billable?.customer_calculation as { byUser?: unknown[] } | null | undefined;
  return Number(row.billable?.customer_total ?? 0) > 0 && (calc?.byUser?.length ?? 0) > 0;
}

/** Onko tietokannassa laskelmarakenne (käytetään vanhentuneisuuden tunnistukseen). */
export function billingRowHasStoredCalculation(row: BillingListRow, mode: 'partner' | 'customer'): boolean {
  const calc =
    mode === 'customer' ? row.billable?.customer_calculation : row.billable?.calculation;
  return ((calc as { byUser?: unknown[] } | null | undefined)?.byUser?.length ?? 0) > 0;
}

export function billingRowNeedsPartnerRecalc(row: BillingListRow): boolean {
  return row.billable?.partner_recalc_needed === true;
}

export function billingRowHasCalculation(row: BillingListRow, mode: 'partner' | 'customer'): boolean {
  return mode === 'customer' ? billingRowHasCustomerCalculation(row) : billingRowHasPartnerCalculation(row);
}

export function billingRowAmount(row: BillingListRow, mode: BillingModuleMode = 'partner'): number {
  if (mode === 'customer') {
    return Number(row.billable?.customer_total ?? row.billing?.customer_invoice_amount ?? 0);
  }
  return Number(row.billable?.partner_total ?? row.billing?.partner_invoice_amount ?? 0);
}

export type BillingPartnerState = 'open' | 'partial' | 'billed';

export function resolvePartnerBillingAmounts(
  total: number,
  partnerBilledAmount: number | null | undefined,
  partnerInvoiceStatus?: InvoiceStatus | null,
): {
  total: number;
  billed: number;
  open: number;
  state: BillingPartnerState;
} {
  let billed = Math.round(Number(partnerBilledAmount ?? 0) * 100) / 100;
  if (billed <= 0.005 && partnerInvoiceStatus === 'paid') {
    billed = Math.round(total * 100) / 100;
  }
  const open = Math.max(0, Math.round((total - billed) * 100) / 100);
  let state: BillingPartnerState = 'open';
  if (billed > 0.005) {
    state = open <= 0.005 ? 'billed' : 'partial';
  } else if (partnerInvoiceStatus === 'partial') {
    state = 'partial';
  }
  return { total, billed, open, state };
}

export function billingRowBilledAmount(row: BillingListRow, mode: BillingModuleMode = 'partner'): number {
  if (mode === 'customer') {
    return billingCustomerState(row) === 'billed' ? billingRowAmount(row, mode) : 0;
  }
  return resolvePartnerBillingAmounts(
    billingRowAmount(row, mode),
    row.billing?.partner_billed_amount,
    row.billing?.partner_invoice_status,
  ).billed;
}

export function billingRowOpenAmount(row: BillingListRow, mode: BillingModuleMode = 'partner'): number {
  if (mode === 'customer') {
    return billingCustomerState(row) === 'billed' ? 0 : billingRowAmount(row, mode);
  }
  return resolvePartnerBillingAmounts(
    billingRowAmount(row, mode),
    row.billing?.partner_billed_amount,
    row.billing?.partner_invoice_status,
  ).open;
}

export function billingPartnerState(row: BillingListRow): BillingPartnerState {
  return resolvePartnerBillingAmounts(
    billingRowAmount(row, 'partner'),
    row.billing?.partner_billed_amount,
    row.billing?.partner_invoice_status,
  ).state;
}

export function billingCustomerState(row: BillingListRow): BillingPartnerState {
  return row.billing?.customer_invoice_status === 'paid' ? 'billed' : 'open';
}

export function billingRowState(row: BillingListRow, mode: BillingModuleMode): BillingPartnerState {
  return mode === 'customer' ? billingCustomerState(row) : billingPartnerState(row);
}

export function billingPartnerStatusLabel(state: BillingPartnerState): string {
  if (state === 'billed') return 'Laskutettu';
  if (state === 'partial') return 'Osittain laskutettu';
  return 'Laskuttamatta';
}

export function billingRowBreakdown(
  row: BillingListRow,
  mode: BillingModuleMode = 'partner',
): {
  work: number;
  materials: number;
  total: number;
} {
  const total = billingRowAmount(row, mode);
  const calc =
    mode === 'customer' ? row.billable?.customer_calculation : row.billable?.calculation;
  if (calc?.byUser?.length) {
    const work = calc.byUser.reduce((sum, user) => sum + Number(user.hoursTotal || 0), 0);
    const materials = calc.byUser.reduce(
      (sum, user) =>
        sum
        + Number(user.expensesTotal || 0)
        + Number(user.fixedTotal || 0)
        + Number(user.commissionTotal || 0),
      0,
    );
    return {
      work: Math.round(work * 100) / 100,
      materials: Math.round(materials * 100) / 100,
      total: Number(calc.grandTotal ?? total),
    };
  }
  return { work: total, materials: 0, total };
}

export function isBillablePartnerReport(
  row: Pick<BillingListRow, 'owner_company_id' | 'created_by_company_id' | 'delegate_company_id'>,
): boolean {
  return (
    row.owner_company_id !== row.created_by_company_id
    || (!!row.delegate_company_id && row.created_by_company_id === row.owner_company_id)
  );
}

/** Statuses where partner billing can appear (matches work report detail, not only "Valmis"). */
export const BILLING_LIST_STATUSES = [
  'scheduled',
  'in_progress',
  'completed',
  'billed_partner',
  'billed_customer',
] as const;

export function billToPartnerId(row: BillingListRow): string {
  if (row.delegate_company_id && row.created_by_company_id === row.owner_company_id) {
    return row.delegate_company_id;
  }
  return row.owner_company_id;
}

export function billToPartnerName(row: BillingListRow): string {
  if (row.delegate_company_id && row.created_by_company_id === row.owner_company_id) {
    return row.delegate_company?.name ?? '—';
  }
  return row.owner_company?.name ?? '—';
}

export function isBillingRowBilled(row: BillingListRow): boolean {
  return billingPartnerState(row) === 'billed';
}

export function isBillingRowOpen(row: BillingListRow): boolean {
  return billingRowOpenAmount(row) > 0.005;
}

export function billingRowDate(row: BillingListRow): Date {
  const raw = row.completed_at ?? row.scheduled_start ?? row.created_at;
  return new Date(raw);
}

export async function companyHasBillableBilling(
  supabase: SupabaseClient,
  companyId: string,
): Promise<boolean> {
  const { data: moduleRpc, error: moduleError } = await supabase.rpc('company_billing_module_enabled', {
    p_company_id: companyId,
  });
  if (!moduleError && moduleRpc === false) return false;

  const { data: rpcData, error: rpcError } = await supabase.rpc('company_has_billable_billing', {
    p_company_id: companyId,
  });

  if (!rpcError) return !!rpcData;

  const { data, error } = await supabase
    .from('profiles')
    .select('bill_hours_enabled, bill_expenses_enabled')
    .eq('company_id', companyId)
    .neq('role', 'customer')
    .limit(100);

  if (error) {
    console.error('Laskutusasetusten tarkistus epäonnistui:', error.message);
    return false;
  }

  return (data ?? []).some((row) => row.bill_hours_enabled || row.bill_expenses_enabled);
}

/** Omalle yritykselle kumppanilaskutus: riittää moduuli, ei kumppanin moduulia eikä käyttäjäkohtaisia kytkimiä. */
export async function companyPartnerBillingAvailable(
  supabase: SupabaseClient,
  companyId: string,
): Promise<boolean> {
  const { data: moduleRpc, error: moduleError } = await supabase.rpc('company_billing_module_enabled', {
    p_company_id: companyId,
  });
  if (!moduleError) return moduleRpc !== false;

  const { data, error } = await supabase.from('companies').select('settings').eq('id', companyId).single();
  if (error) {
    console.error('Laskutusmoduulin tarkistus epäonnistui:', error.message);
    return false;
  }
  const settings = parseCompanySettings((data as { settings: unknown } | null)?.settings);
  return companyBillingModuleEnabled(settings);
}

export function formatWorkReportBillingCopy(input: {
  title: string;
  partnerName: string;
  customerName: string | null;
  logs: WorkReportDailyLog[];
  showMoney?: boolean;
}): string {
  const lines: string[] = [
    `Työraportti: ${input.title}`,
    `Kumppani: ${input.partnerName}`,
  ];
  if (input.customerName) lines.push(`Asiakas: ${input.customerName}`);
  lines.push('');

  const sorted = [...input.logs].sort((a, b) => a.log_date.localeCompare(b.log_date));
  for (const log of sorted) {
    lines.push(formatDate(log.log_date));
    const hours = formatHourEntry(log, { showMoney: input.showMoney ?? false });
    if (hours !== '—') lines.push(hours);
    if (log.work_done?.trim()) lines.push(log.work_done.trim());
    if (log.commission_note?.trim()) lines.push(`Provisio: ${log.commission_note.trim()}`);
    for (const expense of log.expense_lines ?? []) {
      const typeLabel = EXPENSE_TYPE_LABELS[expense.expense_type] ?? expense.expense_type;
      const qty = Number(expense.qty);
      const qtyLabel = Number.isInteger(qty) ? `${qty} kpl` : `${qty} kpl`;
      const unit = Number(expense.unit_price);
      const priceSuffix =
        input.showMoney && unit > 0 && expense.bill_to_partner !== false
          ? ` (${unit.toFixed(2)} €/kpl)`
          : '';
      const partnerSuffix = expense.bill_to_partner === false ? ' — kumppanin piikki' : '';
      lines.push(`${typeLabel}: ${expense.description} (${qtyLabel})${priceSuffix}${partnerSuffix}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

export function billToCustomerName(row: BillingListRow): string {
  return row.customers?.name ?? '—';
}

export function billToCustomerKey(row: BillingListRow): string {
  return row.customer_id ?? row.customers?.name ?? row.id;
}

export async function companyHasCustomerBillableBilling(
  supabase: SupabaseClient,
  companyId: string,
): Promise<boolean> {
  if (!companyId) return false;
  return loadCompanyTracksCustomerInvoicing(supabase, companyId);
}

export function formatWorkReportCustomerBillingCopy(input: {
  title: string;
  customerName: string | null;
  logs: WorkReportDailyLog[];
  showMoney?: boolean;
}): string {
  const lines: string[] = [`Työraportti: ${input.title}`];
  if (input.customerName) lines.push(`Asiakas: ${input.customerName}`);
  lines.push('');

  const sorted = [...input.logs].sort((a, b) => a.log_date.localeCompare(b.log_date));
  for (const log of sorted) {
    lines.push(formatDate(log.log_date));
    const hours = formatHourEntry(log, { showMoney: input.showMoney ?? false });
    if (hours !== '—') lines.push(hours);
    if (log.work_done?.trim()) lines.push(log.work_done.trim());
    if (log.commission_note?.trim()) lines.push(`Provisio: ${log.commission_note.trim()}`);
    for (const expense of log.expense_lines ?? []) {
      if (expense.bill_to_customer === false) continue;
      const typeLabel = EXPENSE_TYPE_LABELS[expense.expense_type] ?? expense.expense_type;
      const qty = Number(expense.qty);
      const qtyLabel = Number.isInteger(qty) ? `${qty} kpl` : `${qty} kpl`;
      const customerUnit =
        expense.customer_unit_price != null && Number(expense.customer_unit_price) > 0
          ? Number(expense.customer_unit_price)
          : Number(expense.unit_price);
      const priceMissing =
        !(expense.customer_unit_price != null && Number(expense.customer_unit_price) > 0) &&
        !(Number(expense.unit_price) > 0);
      const priceSuffix = input.showMoney
        ? priceMissing
          ? ' (hinta ?)'
          : customerUnit > 0
            ? ` (${customerUnit.toFixed(2)} €/kpl)`
            : ''
        : '';
      lines.push(`${typeLabel}: ${expense.description} (${qtyLabel})${priceSuffix}`);
    }
    for (const refLine of log.refrigerant_lines ?? []) {
      const qtyLabel = `${Number(refLine.qty_kg).toFixed(3)} kg`;
      const reminder = refrigerantBillingReminder(refLine);
      if (refrigerantIncludedInCustomerBilling(refLine)) {
        const unit = refrigerantCustomerUnitPrice(refLine);
        const priceMissing = !(unit > 0);
        const priceSuffix = input.showMoney
          ? priceMissing
            ? ' (hinta ?)'
            : ` (${unit.toFixed(2)} €/kg = ${refrigerantLineTotal(refLine).toFixed(2)} €)`
          : '';
        lines.push(`Kylmäaine: ${formatRefrigerantLineLabel(refLine)} (${qtyLabel})${priceSuffix}`);
      } else if (reminder) {
        lines.push(`Kylmäaine: ${formatRefrigerantLineLabel(refLine)} (${qtyLabel}) — ${reminder}`);
      } else {
        lines.push(`Kylmäaine: ${formatRefrigerantLineLabel(refLine)} (${qtyLabel})`);
      }
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

export async function loadCustomerBillingCopyText(
  supabase: SupabaseClient,
  row: BillingListRow,
): Promise<string> {
  const { data: logs } = await supabase
    .from('work_report_daily_logs')
    .select(`
      id, log_date, entry_type, hours_regular, hours_overtime, hours_on_call,
      fixed_price_amount, hourly_rate_override, customer_hourly_rate_override, commission_note, work_done,
      expense_lines:work_report_daily_expense_lines(
        id, expense_type, description, qty, unit_price, bill_to_customer, customer_unit_price
      ),
      refrigerant_lines:work_report_refrigerant_lines(
        id, source, supplier_paid_by, unit_price, customer_unit_price, bill_to_customer,
        refrigerant_type, qty_kg, supplier_name,
        cylinder:refrigerant_cylinders(serial_number),
        warehouse_company:companies!work_report_refrigerant_lines_warehouse_company_id_fkey(name),
        owner_user:profiles!work_report_refrigerant_lines_owner_user_id_fkey(display_name)
      )
    `)
    .eq('work_report_id', row.id)
    .order('log_date', { ascending: true });

  return formatWorkReportCustomerBillingCopy({
    title: row.title,
    customerName: row.customers?.name ?? null,
    logs: (logs as unknown as WorkReportDailyLog[]) ?? [],
    showMoney: true,
  });
}

export async function loadBillingCopyText(
  supabase: SupabaseClient,
  row: BillingListRow,
  mode: BillingModuleMode = 'partner',
): Promise<string> {
  if (mode === 'customer') {
    return loadCustomerBillingCopyText(supabase, row);
  }
  const { data: logs } = await supabase
    .from('work_report_daily_logs')
    .select(`
      id, log_date, entry_type, hours_regular, hours_overtime, hours_on_call,
      fixed_price_amount, hourly_rate_override, commission_note, work_done,
      expense_lines:work_report_daily_expense_lines(
        id, expense_type, description, qty, unit_price
      )
    `)
    .eq('work_report_id', row.id)
    .order('log_date', { ascending: true });

  return formatWorkReportBillingCopy({
    title: row.title,
    partnerName: billToPartnerName(row),
    customerName: row.customers?.name ?? null,
    logs: (logs as unknown as WorkReportDailyLog[]) ?? [],
    showMoney: false,
  });
}

export async function markPartnerReportBilled(
  supabase: SupabaseClient,
  workReportId: string,
): Promise<void> {
  const { data, error: loadError } = await supabase
    .from('work_reports')
    .select(`
      billable:work_report_billable(partner_total),
      billing:work_report_billing(partner_invoice_amount)
    `)
    .eq('id', workReportId)
    .single();

  if (loadError) throw loadError;

  const row = data as unknown as {
    billable: { partner_total: number } | null;
    billing: { partner_invoice_amount: number | null } | null;
  };

  const total = Number(row.billable?.partner_total ?? row.billing?.partner_invoice_amount ?? 0);

  const { error } = await supabase.from('work_report_billing').upsert({
    work_report_id: workReportId,
    partner_invoice_status: 'paid',
    partner_billed_amount: total,
    partner_billed_at: new Date().toISOString(),
    partner_invoice_amount: total,
  });
  if (error) throw error;
}

export async function unmarkPartnerReportBilled(
  supabase: SupabaseClient,
  workReportId: string,
): Promise<void> {
  const { error } = await supabase
    .from('work_report_billing')
    .update({
      partner_invoice_status: 'none',
      partner_billed_amount: null,
      partner_billed_at: null,
    })
    .eq('work_report_id', workReportId);

  if (error) throw error;
}

export function isCustomerInvoicePaid(
  billing: { customer_invoice_status?: InvoiceStatus | null } | null | undefined,
): boolean {
  return billing?.customer_invoice_status === 'paid';
}

export async function markCustomerReportBilled(
  supabase: SupabaseClient,
  workReportId: string,
): Promise<void> {
  const { data, error: loadError } = await supabase
    .from('work_reports')
    .select(`
      billable:work_report_billable(customer_total),
      billing:work_report_billing(customer_invoice_amount)
    `)
    .eq('id', workReportId)
    .single();

  if (loadError) throw loadError;

  const row = data as unknown as {
    billable: { customer_total: number } | null;
    billing: { customer_invoice_amount: number | null } | null;
  };

  const total = Number(row.billable?.customer_total ?? row.billing?.customer_invoice_amount ?? 0);

  const { error } = await supabase.from('work_report_billing').upsert({
    work_report_id: workReportId,
    customer_invoice_status: 'paid',
    customer_billed_at: new Date().toISOString(),
    customer_invoice_amount: total,
  });
  if (error) throw error;
}

export async function unmarkCustomerReportBilled(
  supabase: SupabaseClient,
  workReportId: string,
): Promise<void> {
  const { error } = await supabase
    .from('work_report_billing')
    .update({
      customer_invoice_status: 'none',
      customer_billed_at: null,
    })
    .eq('work_report_id', workReportId);

  if (error) throw error;
}
