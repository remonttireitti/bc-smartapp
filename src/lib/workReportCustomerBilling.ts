import type { WorkReportDailyLog } from '../types';
import { resolveDailyLogAuthorLabel } from '../types';
import type { PartnerBillingRates } from './management';
import {
  refrigerantCustomerUnitPrice,
  refrigerantIncludedInCustomerBilling,
  refrigerantLineTotal,
} from './refrigerantInventory';
import type { BillableLineKind, BillableCalculation, UserBillingProfile } from './workReportBilling';
import {
  resolveUrakkaCustomerAmount,
  urakkaCustomerLineDescription,
} from './workReportUrakkaBilling';
import {
  expenseCustomerPriceMissing,
} from './workReportExpenseBilling';
import { tripKmExpenseBillingLine } from './tripKmExpense';
import type { BillingQuoteExtraCustomerWork } from './billingQuoteExtraWork';
import type { BillableRatesSource } from './management';

const DEFAULT_RATES: Required<PartnerBillingRates> = {
  hourly_regular: 0,
  hourly_overtime: 0,
  hourly_on_call: 0,
};

function lineTotal(qty: number, unitPrice: number) {
  return Math.round(qty * unitPrice * 100) / 100;
}

function resolveCustomerHourUnitPrice(
  log: WorkReportDailyLog,
  kind: BillableLineKind,
  rates: Required<PartnerBillingRates>,
): number {
  const override =
    log.customer_hourly_rate_override != null ? Number(log.customer_hourly_rate_override) : null;
  if (override != null && override > 0) {
    if (kind === 'hours_regular') return override;
    if (kind === 'hours_overtime' && log.entry_type === 'overtime') return override;
    if (kind === 'hours_on_call' && log.entry_type === 'on_call') return override;
  }
  if (kind === 'hours_regular') return rates.hourly_regular;
  if (kind === 'hours_overtime') return rates.hourly_overtime;
  if (kind === 'hours_on_call') return rates.hourly_on_call;
  return 0;
}

function customerExpenseUnitPrice(line: NonNullable<WorkReportDailyLog['expense_lines']>[number]): number {
  const customerPrice = line.customer_unit_price != null ? Number(line.customer_unit_price) : null;
  if (customerPrice != null && customerPrice > 0) return customerPrice;
  if (line.bill_to_partner === false) return 0;
  return Number(line.unit_price || 0);
}

function customerExpensePriceMissing(line: NonNullable<WorkReportDailyLog['expense_lines']>[number]): boolean {
  return expenseCustomerPriceMissing(line);
}

function refrigerantCustomerPriceMissing(
  line: NonNullable<WorkReportDailyLog['refrigerant_lines']>[number],
): boolean {
  const customerPrice = line.customer_unit_price != null ? Number(line.customer_unit_price) : null;
  if (customerPrice != null && customerPrice > 0) return false;
  return !(Number(line.unit_price) > 0);
}

export function shouldCalculateCustomerBilling(logs: WorkReportDailyLog[]): boolean {
  if (logs.length === 0) return false;
  return logs.some(
    (log) =>
      Number(log.hours_regular) > 0 ||
      Number(log.hours_overtime) > 0 ||
      Number(log.hours_on_call) > 0 ||
      Number(log.fixed_price_amount) > 0 ||
      Number(log.customer_fixed_price_amount) > 0 ||
      Number(log.commission_amount) > 0 ||
      (log.expense_lines ?? []).some((line) => line.bill_to_customer !== false) ||
      (log.refrigerant_lines ?? []).some((line) => refrigerantIncludedInCustomerBilling(line)),
  );
}

export function shouldCalculateCustomerQuoteExtras(
  works: BillingQuoteExtraCustomerWork[] = [],
): boolean {
  return works.some(
    (work) =>
      Number(work.hours) > 0
      || (work.expense_lines ?? []).some(
        (line) => Number(line.qty) > 0 && Number(line.customer_unit_price) > 0,
      ),
  );
}

export function calculateWorkReportCustomerBillable(input: {
  logs: WorkReportDailyLog[];
  rates: PartnerBillingRates;
  ratesSource: BillableRatesSource;
  customerName: string | null;
}): BillableCalculation {
  const rates = { ...DEFAULT_RATES, ...input.rates };
  const byUserId = new Map<string, BillableCalculation['byUser'][number]>();

  function ensureUser(user: UserBillingProfile) {
    if (!byUserId.has(user.id)) {
      byUserId.set(user.id, {
        userId: user.id,
        userName: user.display_name ?? user.id,
        billHoursEnabled: true,
        billExpensesEnabled: true,
        effectiveBillHoursEnabled: true,
        effectiveBillExpensesEnabled: true,
        hoursQty: 0,
        hoursTotal: 0,
        expensesTotal: 0,
        fixedTotal: 0,
        commissionTotal: 0,
        subtotal: 0,
        excludedSubtotal: 0,
        lines: [],
      });
    }
    return byUserId.get(user.id)!;
  }

  for (const log of input.logs) {
    const authorLabel = resolveDailyLogAuthorLabel(log);
    const user: UserBillingProfile = {
      id: log.created_by ?? 'unknown',
      display_name: authorLabel.name === '—' ? 'Tuntematon' : authorLabel.name,
      bill_hours_enabled: true,
      bill_expenses_enabled: true,
    };
    const summary = ensureUser(user);

    const hourLines: Array<{ kind: BillableLineKind; qty: number; unitPrice: number; label: string }> = [];

    if (log.entry_type === 'regular' || log.entry_type === 'regular_and_overtime') {
      if (Number(log.hours_regular) > 0) {
        hourLines.push({
          kind: 'hours_regular',
          qty: Number(log.hours_regular),
          unitPrice: resolveCustomerHourUnitPrice(log, 'hours_regular', rates),
          label: 'Tunnit',
        });
      }
    }
    if (log.entry_type === 'overtime' || log.entry_type === 'regular_and_overtime') {
      if (Number(log.hours_overtime) > 0) {
        hourLines.push({
          kind: 'hours_overtime',
          qty: Number(log.hours_overtime),
          unitPrice: resolveCustomerHourUnitPrice(log, 'hours_overtime', rates),
          label: 'Ylitötunnit',
        });
      }
    }
    if (log.entry_type === 'on_call' && Number(log.hours_on_call) > 0) {
      hourLines.push({
        kind: 'hours_on_call',
        qty: Number(log.hours_on_call),
        unitPrice: resolveCustomerHourUnitPrice(log, 'hours_on_call', rates),
        label: 'Päivystystunnit',
      });
    }
    if (log.entry_type === 'fixed_price') {
      const total = resolveUrakkaCustomerAmount(log);
      if (total == null || total <= 0) continue;
      summary.lines.push({
        logId: log.id,
        logDate: log.log_date,
        kind: 'fixed_price',
        description: urakkaCustomerLineDescription(log),
        qty: 1,
        unitPrice: total,
        total,
        included: true,
      });
      summary.fixedTotal += total;
    }

    for (const hl of hourLines) {
      const total = lineTotal(hl.qty, hl.unitPrice);
      summary.lines.push({
        logId: log.id,
        logDate: log.log_date,
        kind: hl.kind,
        description: hl.label,
        qty: hl.qty,
        unitPrice: hl.unitPrice,
        total,
        included: true,
      });
      summary.hoursTotal += total;
      summary.hoursQty += hl.qty;
    }

    for (const expense of log.expense_lines ?? []) {
      if (expense.bill_to_customer === false) continue;
      const unitPrice = customerExpenseUnitPrice(expense);
      const priceMissing = customerExpensePriceMissing(expense);
      const billed =
        expense.expense_type === 'km'
          ? tripKmExpenseBillingLine({
              expense_type: 'km',
              qty: expense.qty,
              unit_price: unitPrice,
            })
          : {
              qty: Number(expense.qty),
              unitPrice,
              total: lineTotal(Number(expense.qty), unitPrice),
            };
      summary.lines.push({
        logId: log.id,
        logDate: log.log_date,
        kind: 'expense',
        description: expense.description,
        qty: billed.qty,
        unitPrice: billed.unitPrice,
        total: billed.total,
        included: true,
        priceMissing,
      });
      summary.expensesTotal += billed.total;
    }

    for (const refLine of log.refrigerant_lines ?? []) {
      if (!refrigerantIncludedInCustomerBilling(refLine)) continue;
      const unitPrice = refrigerantCustomerUnitPrice(refLine);
      const priceMissing = refrigerantCustomerPriceMissing(refLine);
      const total = refrigerantLineTotal(refLine);
      summary.lines.push({
        logId: log.id,
        logDate: log.log_date,
        kind: 'refrigerant',
        description: `${refLine.refrigerant_type} (kylmäaine)`,
        qty: Number(refLine.qty_kg),
        unitPrice,
        total,
        included: true,
        priceMissing,
      });
      summary.expensesTotal += total;
    }

    if (Number(log.commission_amount) > 0) {
      const total = Number(log.commission_amount);
      summary.lines.push({
        logId: log.id,
        logDate: log.log_date,
        kind: 'commission',
        description: log.commission_note?.trim() || 'Myyntiprovisio',
        qty: 1,
        unitPrice: total,
        total,
        included: true,
      });
      summary.commissionTotal += total;
    }
  }

  const byUser = Array.from(byUserId.values())
    .map((user) => ({
      ...user,
      subtotal: user.hoursTotal + user.expensesTotal + user.fixedTotal + user.commissionTotal,
    }))
    .sort((a, b) => a.userName.localeCompare(b.userName, 'fi'));

  const grandTotal = byUser.reduce((sum, user) => sum + user.subtotal, 0);

  return {
    version: 3,
    billToCompanyId: null,
    billToCompanyName: input.customerName,
    ratesUsed: rates,
    ratesSource: input.ratesSource,
    byUser,
    grandTotal: Math.round(grandTotal * 100) / 100,
    excludedTotal: 0,
  };
}

export function calculateWorkReportCustomerQuoteExtras(input: {
  works: BillingQuoteExtraCustomerWork[];
  rates: PartnerBillingRates;
  ratesSource: BillableRatesSource;
  customerName: string | null;
}): BillableCalculation {
  const rates = { ...DEFAULT_RATES, ...input.rates };
  const summary: BillableCalculation['byUser'][number] = {
    userId: 'quote-extras',
    userName: 'Lisätyöt asiakkaalle',
    billHoursEnabled: true,
    billExpensesEnabled: true,
    effectiveBillHoursEnabled: true,
    effectiveBillExpensesEnabled: true,
    hoursQty: 0,
    hoursTotal: 0,
    expensesTotal: 0,
    fixedTotal: 0,
    commissionTotal: 0,
    subtotal: 0,
    excludedSubtotal: 0,
    lines: [],
  };

  for (const work of input.works) {
    const logDate = work.work_date ?? new Date().toISOString().slice(0, 10);
    const title = work.description.trim() || 'Lisätyö';
    const hours = Number(work.hours) || 0;
    const hourlyRate =
      work.hourly_rate != null && work.hourly_rate > 0
        ? work.hourly_rate
        : rates.hourly_regular;
    if (hours > 0) {
      const total = lineTotal(hours, hourlyRate);
      const priceMissing = !(hourlyRate > 0);
      summary.lines.push({
        logId: work.id,
        logDate,
        kind: 'hours_regular',
        description: title,
        qty: hours,
        unitPrice: hourlyRate,
        total,
        included: true,
        priceMissing,
      });
      summary.hoursQty += hours;
      summary.hoursTotal += total;
    }

    for (const expense of work.expense_lines ?? []) {
      const qty = Number(expense.qty) || 0;
      const unitPrice = Number(expense.customer_unit_price) || 0;
      if (qty <= 0 || unitPrice <= 0) continue;
      const total = lineTotal(qty, unitPrice);
      summary.lines.push({
        logId: `${work.id}:${expense.id}`,
        logDate,
        kind: 'expense',
        description: expense.description,
        qty,
        unitPrice,
        total,
        included: true,
      });
      summary.expensesTotal += total;
    }
  }

  summary.subtotal = summary.hoursTotal + summary.expensesTotal + summary.fixedTotal + summary.commissionTotal;

  return {
    version: 3,
    billToCompanyId: null,
    billToCompanyName: input.customerName,
    ratesUsed: rates,
    ratesSource: input.ratesSource,
    byUser: summary.subtotal > 0 || summary.lines.length > 0 ? [summary] : [],
    grandTotal: Math.round(summary.subtotal * 100) / 100,
    excludedTotal: 0,
  };
}
