import type { SupabaseClient } from '@supabase/supabase-js';
import {
  EXPENSE_TYPE_LABELS,
  formatDate,
  formatHourEntry,
  normalizeWorkflowStatus,
  type InvoiceStatus,
  type WorkReportDailyLog,
  type WorkStatus,
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
import { TRIP_VEHICLE_MIN_BILLING_EUR } from './tripKmExpense';
import {
  breakdownFromBillableCalculation,
  billingPartnerNetTotal,
  type BillableCalculation,
  warehouseDeductionTotalsFromCalculation,
} from './workReportBilling';

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
  creator_company?: { name: string } | null;
  billing: {
    partner_invoice_status: InvoiceStatus;
    partner_invoice_amount: number | null;
    partner_billed_amount: number | null;
    partner_billed_at: string | null;
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
  if ((calc as { byUser?: unknown[] } | null | undefined)?.byUser?.length) {
    return true;
  }
  if (mode === 'partner' && Number(row.billing?.partner_invoice_amount ?? 0) > 0.005) {
    return true;
  }
  return false;
}

export function billingRowNeedsPartnerRecalc(row: BillingListRow): boolean {
  return row.billable?.partner_recalc_needed === true;
}

/** Näytetäänkö rivi laskutuslistassa (0 € -rivit piilotetaan). */
export function billingRowVisibleInList(
  row: BillingListRow,
  mode: 'partner' | 'customer',
  statusFilter: 'all' | 'unbilled' | 'billed',
): boolean {
  const openAmount = billingRowOpenAmount(row, mode);
  const billedAmount = billingRowBilledAmount(row, mode);
  const breakdown = billingRowBreakdown(row, mode);

  if (statusFilter === 'billed') {
    return billedAmount > 0.005;
  }

  if (mode === 'customer') {
    if (statusFilter === 'unbilled') {
      return billingRowState(row, mode) !== 'billed' && breakdown.total > 0.005;
    }
    return breakdown.total > 0.005 || billedAmount > 0.005;
  }

  if (statusFilter === 'unbilled') {
    const hasDeductions = mode === 'partner' && breakdown.deductionsPending > 0.005;
    return (openAmount > 0.005 || hasDeductions) && billingRowState(row, mode) !== 'billed';
  }

  return (
    openAmount > 0.005
    || billedAmount > 0.005
    || (mode === 'partner' && breakdown.deductionsPending > 0.005)
  );
}

/** Voiko katsoja laskea / päivittää kumppanilaskelman tähän raporttiin. */
export function isDelegatedPartnerOrder(
  row: Pick<BillingListRow, 'owner_company_id' | 'created_by_company_id' | 'delegate_company_id'>,
): boolean {
  return !!row.delegate_company_id && row.created_by_company_id === row.owner_company_id;
}

/** Kenelle kumppanilasku kohdistuu (laskutettava yritys). */
export function resolvePartnerBilledCompanyId(
  row: Pick<BillingListRow, 'owner_company_id' | 'created_by_company_id' | 'delegate_company_id'>,
): string {
  if (isDelegatedPartnerOrder(row)) {
    return row.delegate_company_id!;
  }
  return row.owner_company_id;
}

/** Voiko katsoja tallentaa kumppanilaskelman tähän raporttiin. */
export function canPersistPartnerBillable(
  row: Pick<BillingListRow, 'owner_company_id' | 'created_by_company_id' | 'delegate_company_id'>,
  viewerCompanyId: string | null | undefined,
): boolean {
  if (!viewerCompanyId) return false;
  if (viewerCompanyId === row.created_by_company_id) return true;
  if (
    viewerCompanyId === row.owner_company_id
    && row.created_by_company_id !== row.owner_company_id
  ) {
    return true;
  }
  if (isDelegatedPartnerOrder(row) && viewerCompanyId === row.delegate_company_id) {
    return true;
  }
  return false;
}

export function isDelegatedPartnerBill(
  row: BillingListRow,
  viewerCompanyId: string | null | undefined,
): boolean {
  if (!viewerCompanyId || !isDelegatedPartnerOrder(row)) return false;
  return row.delegate_company_id === viewerCompanyId;
}

export function canViewerRecalcPartnerBill(
  row: BillingListRow,
  viewerCompanyId: string | null | undefined,
): boolean {
  if (!viewerCompanyId || !isBillablePartnerReport(row)) return false;
  if (isOutgoingPartnerBill(row, viewerCompanyId)) return true;
  if (isIncomingPartnerBill(row, viewerCompanyId)) return true;
  if (isDelegatedPartnerBill(row, viewerCompanyId)) return true;
  return false;
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

/** Päiväkirjaukset, jotka on lisätty kumppanilaskutuksen merkinnän jälkeen. */
export function resolveUnbilledPartnerDailyLogDates(
  dailyLogs: Array<{ log_date: string; created_at: string }>,
  partnerBilledAt: string | null | undefined,
): string[] {
  if (!partnerBilledAt) return [];
  const billedAtMs = new Date(partnerBilledAt).getTime();
  if (!Number.isFinite(billedAtMs)) return [];

  const dates = new Set<string>();
  for (const log of dailyLogs) {
    const createdMs = new Date(log.created_at).getTime();
    if (Number.isFinite(createdMs) && createdMs > billedAtMs) {
      dates.add(log.log_date.slice(0, 10));
    }
  }
  return [...dates].sort();
}

export function hasUnbilledPartnerDailyLogsAfterBilling(
  dailyLogs: Array<{ log_date: string; created_at: string }>,
  partnerBilledAt: string | null | undefined,
): boolean {
  return resolveUnbilledPartnerDailyLogDates(dailyLogs, partnerBilledAt).length > 0;
}

/** Sulje avoin erä automaattisesti, jos se johtuu yhdestä 35 € minimilaskutuksesta eikä uusia päiviä ole lisätty. */
export function shouldAutoClosePartnerKmMinimumRemainder(
  grandTotal: number,
  billedAmount: number,
  partnerBilledAt: string | null | undefined,
  dailyLogs: Array<{ log_date: string; created_at: string }>,
): boolean {
  if (billedAmount <= 0.005 || !partnerBilledAt) return false;
  const open = Math.max(0, Math.round((grandTotal - billedAmount) * 100) / 100);
  if (open <= 0.005 || open > TRIP_VEHICLE_MIN_BILLING_EUR) return false;
  return !hasUnbilledPartnerDailyLogsAfterBilling(dailyLogs, partnerBilledAt);
}

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
  return billingRowPartnerAmounts(row).open;
}

/** Kumppanilaskutuksen tila — riippumaton laskutusmoduulin summalaskennasta. */
export function billingPartnerState(
  row: BillingListRow,
  dailyLogs: Array<{ log_date: string; created_at: string }> = [],
): BillingPartnerState {
  const amountState = resolvePartnerBillingAmounts(
    billingRowPartnerAmounts(row).netTotal,
    row.billing?.partner_billed_amount,
    row.billing?.partner_invoice_status,
  ).state;
  const partnerBilledAt = row.billing?.partner_billed_at;
  if (
    partnerBilledAt
    && hasUnbilledPartnerDailyLogsAfterBilling(dailyLogs, partnerBilledAt)
    && (amountState === 'billed'
      || amountState === 'partial'
      || row.billing?.partner_invoice_status === 'paid')
  ) {
    return 'partial';
  }
  return amountState;
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
  deductionsPending: number;
  deductionsDeducted: number;
  netTotal: number;
} {
  const grossTotal = billingRowAmount(row, mode);
  const calc =
    mode === 'customer' ? row.billable?.customer_calculation : row.billable?.calculation;
  const deductions = warehouseDeductionTotalsFromCalculation(calc as BillableCalculation | undefined);
  if (calc?.byUser?.length) {
    const base = breakdownFromBillableCalculation(calc as BillableCalculation);
    const netTotal =
      mode === 'partner'
        ? billingPartnerNetTotal(grossTotal, calc as BillableCalculation)
        : grossTotal;
    return {
      ...base,
      total: grossTotal,
      deductionsPending: deductions.pending,
      deductionsDeducted: deductions.deducted,
      netTotal,
    };
  }
  if (grossTotal > 0.005) {
    return {
      work: grossTotal,
      materials: 0,
      total: grossTotal,
      deductionsPending: 0,
      deductionsDeducted: 0,
      netTotal: grossTotal,
    };
  }
  return {
    work: 0,
    materials: 0,
    total: 0,
    deductionsPending: deductions.pending,
    deductionsDeducted: deductions.deducted,
    netTotal: grossTotal,
  };
}

export function billingRowPartnerAmounts(row: BillingListRow) {
  const grossTotal = billingRowAmount(row, 'partner');
  const calc = row.billable?.calculation as BillableCalculation | undefined;
  const netTotal = billingPartnerNetTotal(grossTotal, calc);
  const deductions = warehouseDeductionTotalsFromCalculation(calc);
  const amounts = resolvePartnerBillingAmounts(
    netTotal,
    row.billing?.partner_billed_amount,
    row.billing?.partner_invoice_status,
  );
  return { grossTotal, netTotal, ...deductions, ...amounts };
}

export function isBillablePartnerReport(
  row: Pick<BillingListRow, 'owner_company_id' | 'created_by_company_id' | 'delegate_company_id'>,
): boolean {
  return (
    row.owner_company_id !== row.created_by_company_id
    || (!!row.delegate_company_id && row.created_by_company_id === row.owner_company_id)
  );
}

/** Kumppani lähetti raportin meille — emme laske laskelmaa, kumppani laskuttaa meitä. */
export function isIncomingPartnerBill(row: BillingListRow, viewerCompanyId: string | null | undefined): boolean {
  if (!viewerCompanyId || !isBillablePartnerReport(row)) return false;
  return row.owner_company_id === viewerCompanyId && row.created_by_company_id !== viewerCompanyId;
}

/** Me lähetimme / teimme raportin kumppanille — me laskemme laskutettavan summan. */
export function isOutgoingPartnerBill(row: BillingListRow, viewerCompanyId: string | null | undefined): boolean {
  if (!viewerCompanyId || !isBillablePartnerReport(row)) return false;
  return row.created_by_company_id === viewerCompanyId;
}

/** Onko raportilla kumppanilaskutusta seurattavaa (myös ennen laskelman valmistumista). */
export function hasPartnerBillingActivity(
  row: Pick<BillingListRow, 'owner_company_id' | 'created_by_company_id' | 'delegate_company_id' | 'billing' | 'billable'>,
  hasDailyLogs = false,
): boolean {
  if (!isBillablePartnerReport(row)) return false;
  if (Number(row.billable?.partner_total ?? 0) > 0.005) return true;
  if (Number(row.billing?.partner_billed_amount ?? 0) > 0.005) return true;
  if (row.billing?.partner_invoice_status === 'paid' || row.billing?.partner_invoice_status === 'partial') {
    return true;
  }
  return hasDailyLogs;
}

/** Omistaja voi merkitä kumppanilaskun listasta. */
export function canManageIncomingPartnerBilling(
  row: BillingListRow,
  viewerCompanyId: string | null | undefined,
  hasDailyLogs = false,
): boolean {
  return isIncomingPartnerBill(row, viewerCompanyId) && hasPartnerBillingActivity(row, hasDailyLogs);
}

/** Kumppani (laatija) näkee oman laskutuksensa tilan listassa. */
export function canViewOutgoingPartnerBilling(
  row: BillingListRow,
  viewerCompanyId: string | null | undefined,
  hasDailyLogs = false,
): boolean {
  return isOutgoingPartnerBill(row, viewerCompanyId) && hasPartnerBillingActivity(row, hasDailyLogs);
}

/** Statuses where partner billing can appear (matches work report detail, not only "Valmis"). */
export const BILLING_LIST_STATUSES = [
  'scheduled',
  'in_progress',
  'completed',
  'billed_partner',
  'billed_customer',
] as const;

export function billToPartnerId(row: BillingListRow, viewerCompanyId?: string | null): string {
  if (viewerCompanyId && isDelegatedPartnerOrder(row)) {
    return viewerCompanyId === row.delegate_company_id
      ? row.owner_company_id
      : row.delegate_company_id!;
  }
  if (viewerCompanyId && viewerCompanyId === row.created_by_company_id) {
    return isDelegatedPartnerOrder(row) ? row.delegate_company_id! : row.owner_company_id;
  }
  if (viewerCompanyId && viewerCompanyId === row.owner_company_id && row.created_by_company_id !== row.owner_company_id) {
    return row.created_by_company_id;
  }
  if (isDelegatedPartnerOrder(row)) {
    return row.delegate_company_id!;
  }
  return row.owner_company_id;
}

export function billToPartnerName(row: BillingListRow, viewerCompanyId?: string | null): string {
  if (viewerCompanyId && isDelegatedPartnerOrder(row)) {
    return viewerCompanyId === row.delegate_company_id
      ? (row.owner_company?.name ?? '—')
      : (row.delegate_company?.name ?? '—');
  }
  if (viewerCompanyId && viewerCompanyId === row.created_by_company_id) {
    return isDelegatedPartnerOrder(row)
      ? (row.delegate_company?.name ?? '—')
      : (row.owner_company?.name ?? '—');
  }
  if (viewerCompanyId && viewerCompanyId === row.owner_company_id && row.created_by_company_id !== row.owner_company_id) {
    return row.creator_company?.name ?? '—';
  }
  if (isDelegatedPartnerOrder(row)) {
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

/** Milloin laskutettu summa kohdistuu (laskutushetki tai raportin päivä). */
export function billingRowBilledDate(row: BillingListRow, mode: BillingModuleMode = 'partner'): Date {
  if (mode === 'customer') {
    const raw = row.billing?.customer_billed_at;
    if (raw) return new Date(raw);
  } else {
    const raw = row.billing?.partner_billed_at;
    if (raw) return new Date(raw);
  }
  return billingRowDate(row);
}

export type BillingSummaryPeriod = 'this_month' | 'this_year' | 'all';

export function isBillingSummaryPeriod(date: Date, period: BillingSummaryPeriod, anchor = new Date()): boolean {
  if (period === 'all') return true;
  if (period === 'this_year') return date.getFullYear() === anchor.getFullYear();
  return date.getFullYear() === anchor.getFullYear() && date.getMonth() === anchor.getMonth();
}

export function billingSummaryPeriodLabel(period: BillingSummaryPeriod): string {
  if (period === 'this_month') return 'Tämä kuukausi';
  if (period === 'this_year') return 'Tämä vuosi';
  return 'Kaikki';
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

type BillingCopyAudience = 'partner' | 'customer';

function expenseBillsToAudience(
  expense: { bill_to_partner?: boolean; bill_to_customer?: boolean },
  audience: BillingCopyAudience,
): boolean {
  return audience === 'partner'
    ? expense.bill_to_partner !== false
    : expense.bill_to_customer !== false;
}

function refrigerantBillsToAudience(
  line: { bill_to_partner?: boolean; bill_to_customer?: boolean },
  audience: BillingCopyAudience,
): boolean {
  if (audience === 'partner') {
    return line.bill_to_partner !== false;
  }
  return refrigerantIncludedInCustomerBilling(line);
}

function formatDetailedWorkReportBillingCopy(input: {
  title: string;
  audience: BillingCopyAudience;
  partnerName?: string | null;
  customerName?: string | null;
  logs: WorkReportDailyLog[];
  showMoney?: boolean;
  partialUnbilledOnly?: boolean;
}): string {
  const lines: string[] = [`Työraportti: ${input.title}`];
  if (input.audience === 'partner' && input.partnerName) {
    lines.push(`Kumppani: ${input.partnerName}`);
  }
  if (input.customerName) {
    lines.push(`Asiakas: ${input.customerName}`);
  }
  if (input.partialUnbilledOnly) {
    lines.push('', 'Laskuttamatta (uudet päiväkirjaukset):');
  }
  lines.push('');

  if (input.logs.length === 0) {
    if (input.partialUnbilledOnly) {
      lines.push('Ei uusia laskuttamattomia kirjauksia.');
    } else {
      lines.push('Ei päiväkirjauksia.');
    }
    return lines.join('\n').trim();
  }

  const sorted = [...input.logs].sort((a, b) => a.log_date.localeCompare(b.log_date));
  for (const log of sorted) {
    lines.push(formatDate(log.log_date));
    const hours = formatHourEntry(log, { showMoney: input.showMoney ?? false });
    if (hours !== '—') lines.push(hours);
    if (log.work_done?.trim()) lines.push(log.work_done.trim());
    if (log.commission_note?.trim()) lines.push(`Provisio: ${log.commission_note.trim()}`);
    for (const expense of log.expense_lines ?? []) {
      if (!expenseBillsToAudience(expense, input.audience)) continue;
      const typeLabel = EXPENSE_TYPE_LABELS[expense.expense_type] ?? expense.expense_type;
      const qty = Number(expense.qty);
      const qtyLabel = Number.isInteger(qty) ? `${qty} kpl` : `${qty} kpl`;
      const unitPrice =
        input.audience === 'customer'
        && expense.customer_unit_price != null
        && Number(expense.customer_unit_price) > 0
          ? Number(expense.customer_unit_price)
          : Number(expense.unit_price);
      const priceMissing =
        input.audience === 'customer'
          ? !(expense.customer_unit_price != null && Number(expense.customer_unit_price) > 0)
            && !(Number(expense.unit_price) > 0)
          : !(Number(expense.unit_price) > 0);
      const priceSuffix = input.showMoney
        ? priceMissing
          ? ' (hinta ?)'
          : unitPrice > 0
            ? ` (${unitPrice.toFixed(2)} €/kpl)`
            : ''
        : '';
      lines.push(`${typeLabel}: ${expense.description} (${qtyLabel})${priceSuffix}`);
    }
    for (const refLine of log.refrigerant_lines ?? []) {
      const qtyLabel = `${Number(refLine.qty_kg).toFixed(3)} kg`;
      const reminder = refrigerantBillingReminder(refLine);
      if (refrigerantBillsToAudience(refLine, input.audience)) {
        const unit =
          input.audience === 'customer'
            ? refrigerantCustomerUnitPrice(refLine)
            : Number(refLine.unit_price);
        const priceMissing = !(unit > 0);
        const priceSuffix = input.showMoney
          ? priceMissing
            ? ' (hinta ?)'
            : ` (${unit.toFixed(2)} €/kg = ${refrigerantLineTotal(refLine).toFixed(2)} €)`
          : '';
        lines.push(`Kylmäaine: ${formatRefrigerantLineLabel(refLine)} (${qtyLabel})${priceSuffix}`);
      } else if (reminder) {
        lines.push(`Kylmäaine: ${formatRefrigerantLineLabel(refLine)} (${qtyLabel}) — ${reminder}`);
      } else if (input.audience === 'customer') {
        lines.push(`Kylmäaine: ${formatRefrigerantLineLabel(refLine)} (${qtyLabel})`);
      }
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

export function formatWorkReportBillingCopy(input: {
  title: string;
  partnerName: string;
  customerName: string | null;
  logs: WorkReportDailyLog[];
  partialUnbilledOnly?: boolean;
}): string {
  return formatDetailedWorkReportBillingCopy({
    title: input.title,
    audience: 'partner',
    partnerName: input.partnerName,
    customerName: input.customerName,
    logs: input.logs,
    showMoney: false,
    partialUnbilledOnly: input.partialUnbilledOnly,
  });
}

/** Valitsee asiakaslaskutuksen kopiointiin kuuluvat päiväkirjaukset. */
export function filterCustomerBillingCopyLogs(
  logs: WorkReportDailyLog[],
  row: Pick<BillingListRow, 'billing'>,
): { logs: WorkReportDailyLog[]; partialUnbilledOnly: boolean } {
  const isPaid = row.billing?.customer_invoice_status === 'paid';
  if (!isPaid) {
    return { logs, partialUnbilledOnly: false };
  }
  const customerBilledAt = row.billing?.customer_billed_at;
  if (!customerBilledAt) {
    return { logs: [], partialUnbilledOnly: false };
  }
  if (!hasUnbilledPartnerDailyLogsAfterBilling(logs, customerBilledAt)) {
    return { logs: [], partialUnbilledOnly: false };
  }
  const billedAtMs = new Date(customerBilledAt).getTime();
  if (!Number.isFinite(billedAtMs)) {
    return { logs, partialUnbilledOnly: true };
  }
  const filtered = logs.filter((log) => {
    const createdMs = new Date(log.created_at).getTime();
    return Number.isFinite(createdMs) && createdMs > billedAtMs;
  });
  return { logs: filtered, partialUnbilledOnly: true };
}

/** Valitsee kumppanilaskutuksen kopiointiin kuuluvat päiväkirjaukset. */
export function filterPartnerBillingCopyLogs(
  logs: WorkReportDailyLog[],
  row: Pick<
    BillingListRow,
    'owner_company_id' | 'created_by_company_id' | 'delegate_company_id' | 'billing' | 'billable'
  >,
): { logs: WorkReportDailyLog[]; partialUnbilledOnly: boolean } {
  const billingRow = row as BillingListRow;
  const state = billingPartnerState(billingRow, logs);
  if (state === 'billed') {
    return { logs: [], partialUnbilledOnly: false };
  }

  const partnerBilledAt = row.billing?.partner_billed_at;
  const hasNewLogsAfterBilling =
    !!partnerBilledAt && hasUnbilledPartnerDailyLogsAfterBilling(logs, partnerBilledAt);

  if (state === 'partial' && hasNewLogsAfterBilling && partnerBilledAt) {
    const billedAtMs = new Date(partnerBilledAt).getTime();
    if (!Number.isFinite(billedAtMs)) {
      return { logs, partialUnbilledOnly: true };
    }
    const filtered = logs.filter((log) => {
      const createdMs = new Date(log.created_at).getTime();
      return Number.isFinite(createdMs) && createdMs > billedAtMs;
    });
    return { logs: filtered, partialUnbilledOnly: true };
  }

  return { logs, partialUnbilledOnly: false };
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
  partialUnbilledOnly?: boolean;
}): string {
  return formatDetailedWorkReportBillingCopy({
    title: input.title,
    audience: 'customer',
    customerName: input.customerName,
    logs: input.logs,
    showMoney: input.showMoney,
    partialUnbilledOnly: input.partialUnbilledOnly,
  });
}

const BILLING_COPY_LOG_SELECT = `
  id, log_date, entry_type, hours_regular, hours_overtime, hours_on_call,
  fixed_price_amount, hourly_rate_override, customer_hourly_rate_override, commission_note, work_done, created_at,
  expense_lines:work_report_daily_expense_lines(
    id, expense_type, description, qty, unit_price, bill_to_partner, bill_to_customer, customer_unit_price
  ),
  refrigerant_lines:work_report_refrigerant_lines(
    id, source, supplier_paid_by, unit_price, customer_unit_price, bill_to_partner, bill_to_customer,
    refrigerant_type, qty_kg, supplier_name,
    cylinder:refrigerant_cylinders(serial_number),
    warehouse_company:companies!work_report_refrigerant_lines_warehouse_company_id_fkey(name),
    owner_user:profiles!work_report_refrigerant_lines_owner_user_id_fkey(display_name)
  )
`;

export async function loadCustomerBillingCopyText(
  supabase: SupabaseClient,
  row: BillingListRow,
): Promise<{ text: string; partialUnbilledOnly: boolean }> {
  const { data: logs } = await supabase
    .from('work_report_daily_logs')
    .select(BILLING_COPY_LOG_SELECT)
    .eq('work_report_id', row.id)
    .order('log_date', { ascending: true });

  const allLogs = (logs as unknown as WorkReportDailyLog[]) ?? [];
  const { logs: copyLogs, partialUnbilledOnly } = filterCustomerBillingCopyLogs(allLogs, row);

  return {
    text: formatWorkReportCustomerBillingCopy({
      title: row.title,
      customerName: row.customers?.name ?? null,
      logs: copyLogs,
      showMoney: false,
      partialUnbilledOnly,
    }),
    partialUnbilledOnly,
  };
}

export async function loadBillingCopyText(
  supabase: SupabaseClient,
  row: BillingListRow,
  mode: BillingModuleMode = 'partner',
): Promise<{ text: string; partialUnbilledOnly: boolean }> {
  if (mode === 'customer') {
    return loadCustomerBillingCopyText(supabase, row);
  }
  const { data: logs } = await supabase
    .from('work_report_daily_logs')
    .select(BILLING_COPY_LOG_SELECT)
    .eq('work_report_id', row.id)
    .order('log_date', { ascending: true });

  const allLogs = (logs as unknown as WorkReportDailyLog[]) ?? [];
  const { logs: copyLogs, partialUnbilledOnly } = filterPartnerBillingCopyLogs(allLogs, row);

  return {
    text: formatWorkReportBillingCopy({
      title: row.title,
      partnerName: billToPartnerName(row),
      customerName: row.customers?.name ?? null,
      logs: copyLogs,
      partialUnbilledOnly,
    }),
    partialUnbilledOnly,
  };
}

export async function loadBillingPrintShareLink(
  row: Pick<BillingListRow, 'id'>,
  companyId: string,
): Promise<string> {
  const { ensureWorkReportPrintShare, workReportPrintShareUrl } = await import('./workReportPrintShares');
  const token = await ensureWorkReportPrintShare(row.id, companyId);
  return workReportPrintShareUrl(token);
}

export type PartnerBillWorkflowChoice = 'mark_completed' | 'keep_in_progress';

export function shouldPromptPartnerBillWorkflow(status: WorkStatus | string): boolean {
  return normalizeWorkflowStatus(status as WorkStatus) !== 'completed';
}

export async function applyPartnerBillWorkflowChoice(
  supabase: SupabaseClient,
  workReportId: string,
  choice: PartnerBillWorkflowChoice,
): Promise<void> {
  if (choice !== 'mark_completed') return;

  const { error } = await supabase
    .from('work_reports')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', workReportId);
  if (error) throw error;
}

export async function markPartnerReportBilled(
  supabase: SupabaseClient,
  workReportId: string,
): Promise<void> {
  const { data, error: loadError } = await supabase
    .from('work_reports')
    .select(`
      owner_company_id, created_by_company_id, delegate_company_id,
      billable:work_report_billable(partner_total),
      billing:work_report_billing(partner_invoice_amount)
    `)
    .eq('id', workReportId)
    .single();

  if (loadError) throw loadError;

  const row = data as unknown as {
    owner_company_id: string;
    created_by_company_id: string;
    delegate_company_id: string | null;
    billable: { partner_total: number } | null;
    billing: { partner_invoice_amount: number | null } | null;
  };

  const total = Number(row.billable?.partner_total ?? row.billing?.partner_invoice_amount ?? 0);
  const billedToCompanyId = resolvePartnerBilledCompanyId(row);

  const { error } = await supabase.from('work_report_billing').upsert({
    work_report_id: workReportId,
    partner_invoice_status: 'paid',
    partner_billed_amount: total,
    partner_billed_at: new Date().toISOString(),
    partner_invoice_amount: total,
    billed_to_company_id: billedToCompanyId,
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
