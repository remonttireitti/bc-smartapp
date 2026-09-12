import type { QuoteCategoryKey } from './quoteCategoryComparison';
import type { BillableCalculation, BillableLine } from './workReportBilling';
import { billableLineDisplayTotal } from './workReportBilling';
import { parseDailyLogCustomerExtraBilling } from './dailyLogCustomerExtraBilling';
import { expenseCountsAsWorkReportPurchase } from './workReportActualPurchase';
import { resolveLogExpenseExtraBillingFlags } from './workReportExpenseBilling';
import {
  expensePurchaseLineTotal,
  resolveExpenseBillingMode,
  type ExpensePurchaseFields,
} from './workReportExpenseBilling';
import type { WorkReportDailyLog } from '../types';

export const QUOTE_CATEGORY_LABELS: Record<QuoteCategoryKey, string> = {
  labor: 'Työt',
  supplies: 'Tarvikkeet',
  expenses: 'Kulut',
  device: 'Laite',
};

export type WorkReportCategoryEntry = {
  id: string;
  logId: string;
  logDate: string;
  category: QuoteCategoryKey;
  description: string;
  qty: number | null;
  qtyLabel: string | null;
  actualNet: number;
};

type ExpenseLike = ExpensePurchaseFields & {
  expense_type?: string | null;
  purchase_price?: number | string | null;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function logBillableHours(log: WorkReportDailyLog): number {
  if (log.entry_type === 'fixed_price') return Number(log.hours_regular) || 0;
  if (log.entry_type === 'regular') return Number(log.hours_regular) || 0;
  if (log.entry_type === 'overtime') return Number(log.hours_overtime) || 0;
  if (log.entry_type === 'on_call') return Number(log.hours_on_call) || 0;
  if (log.entry_type === 'regular_and_overtime') {
    return (Number(log.hours_regular) || 0) + (Number(log.hours_overtime) || 0);
  }
  return 0;
}

function isTripExpense(expense: ExpenseLike): boolean {
  const description = String(expense.description ?? '').trim();
  return expense.expense_type === 'km' || /^Ajomatkat\s*\(/i.test(description);
}

/** Luokittelee päiväkirjan kulurivin yhteen neljästä tarjouskategoriasta. */
export function classifyExpenseLineCategory(expense: ExpenseLike): QuoteCategoryKey {
  if (isTripExpense(expense)) return 'expenses';
  if (expenseCountsAsWorkReportPurchase(expense as NonNullable<WorkReportDailyLog['expense_lines']>[number])) {
    return 'supplies';
  }
  return 'expenses';
}

export function quoteCategoryLabel(category: QuoteCategoryKey): string {
  return QUOTE_CATEGORY_LABELS[category];
}

function billableLineCategory(line: BillableLine): QuoteCategoryKey | null {
  if (
    line.kind === 'hours_regular'
    || line.kind === 'hours_overtime'
    || line.kind === 'hours_overtime_50'
    || line.kind === 'hours_overtime_100'
    || line.kind === 'hours_on_call'
  ) {
    return 'labor';
  }
  if (line.kind === 'expense') return 'expenses';
  return null;
}

/** Kerää työraportin merkinnät kategorioittain vertailua ja näyttöä varten. */
export function collectWorkReportCategoryEntries(
  logs: WorkReportDailyLog[],
  partnerCalculation?: BillableCalculation | null,
): WorkReportCategoryEntry[] {
  const entries: WorkReportCategoryEntry[] = [];
  const laborByLog = new Map<string, { hours: number; net: number; logDate: string }>();

  if (partnerCalculation?.byUser) {
    for (const user of partnerCalculation.byUser) {
      for (const line of user.lines) {
        if (!line.included) continue;
        const category = billableLineCategory(line);
        if (!category) continue;
        const amount = billableLineDisplayTotal(line);
        if (category === 'labor') {
          const prev = laborByLog.get(line.logId) ?? {
            hours: 0,
            net: 0,
            logDate: line.logDate.slice(0, 10),
          };
          laborByLog.set(line.logId, {
            hours: roundMoney(prev.hours + (Number(line.qty) || 0)),
            net: roundMoney(prev.net + amount),
            logDate: line.logDate.slice(0, 10),
          });
          continue;
        }
        entries.push({
          id: `billable:${line.logId}:${line.kind}:${line.description}`,
          logId: line.logId,
          logDate: line.logDate.slice(0, 10),
          category,
          description: line.description,
          qty: Number(line.qty) || null,
          qtyLabel: /^Ajomatkat/i.test(line.description) ? 'km' : null,
          actualNet: amount,
        });
      }
    }
  }

  for (const [logId, labor] of laborByLog) {
    const log = logs.find((row) => row.id === logId);
    entries.push({
      id: `labor:${logId}`,
      logId,
      logDate: labor.logDate,
      category: 'labor',
      description: log?.work_done?.trim() || 'Työtunnit',
      qty: labor.hours,
      qtyLabel: 'h',
      actualNet: labor.net,
    });
  }

  for (const log of logs) {
    const logDate = log.log_date.slice(0, 10);
    const hours = logBillableHours(log);
    if (hours > 0 && !laborByLog.has(log.id) && log.entry_type !== 'fixed_price') {
      entries.push({
        id: `labor:${log.id}`,
        logId: log.id,
        logDate,
        category: 'labor',
        description: log.work_done?.trim() || 'Työtunnit',
        qty: hours,
        qtyLabel: 'h',
        actualNet: 0,
      });
    }

    const supplyLineFlags = parseDailyLogCustomerExtraBilling(log.customer_extra_billing).supply_line_flags;
    const expenseLines = log.expense_lines ?? [];

    for (let index = 0; index < expenseLines.length; index++) {
      const expense = expenseLines[index];
      const extraBilling = resolveLogExpenseExtraBillingFlags(expense, index, expenseLines, supplyLineFlags);
      if (!expenseCountsAsWorkReportPurchase(expense, extraBilling)) continue;
      const total = expensePurchaseLineTotal(expense);
      if (total <= 0.005) continue;
      entries.push({
        id: `expense:${log.id}:${expense.id ?? expense.description}`,
        logId: log.id,
        logDate,
        category: 'supplies',
        description: String(expense.description ?? '').trim() || 'Tarvike',
        qty: Number(expense.qty) || null,
        qtyLabel: 'kpl',
        actualNet: total,
      });
    }

    for (const purchase of log.partner_purchase_lines ?? []) {
      const qty = Number(purchase.qty) || 0;
      const unit = Number(purchase.unit_price) || 0;
      if (!(qty > 0) || !(unit > 0)) continue;
      entries.push({
        id: `partner:${log.id}:${purchase.id}`,
        logId: log.id,
        logDate,
        category: 'supplies',
        description: String(purchase.description ?? '').trim() || 'Piikkiosto',
        qty,
        qtyLabel: 'kpl',
        actualNet: roundMoney(qty * unit),
      });
    }
  }

  return entries.sort((a, b) => {
    const dateCmp = a.logDate.localeCompare(b.logDate);
    if (dateCmp !== 0) return dateCmp;
    const order: QuoteCategoryKey[] = ['labor', 'expenses', 'supplies', 'device'];
    return order.indexOf(a.category) - order.indexOf(b.category);
  });
}

export function classifyExpenseDraftCategory(row: ExpenseLike): QuoteCategoryKey {
  return classifyExpenseLineCategory(row);
}

export function expenseBillingModeCategoryHint(mode: ReturnType<typeof resolveExpenseBillingMode>): string {
  if (mode === 'customer_only') return 'Tarvikkeet';
  if (mode === 'included_in_contract') return 'Kulut';
  return 'Kulut';
}
