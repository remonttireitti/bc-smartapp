import type { WorkReportDailyLog } from '../types';
import { parseDailyLogCustomerExtraBilling } from './dailyLogCustomerExtraBilling';
import {
  expensePurchaseLineTotal,
  expensePurchasePriceMissing,
  resolveExpenseBillingMode,
  resolveExpensePurchaseUnitPrice,
  resolveLogExpenseExtraBillingFlags,
} from './workReportExpenseBilling';

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function lineTotal(qty: number, unitPrice: number): number {
  return roundMoney(qty * unitPrice);
}

export type WorkReportPurchaseCostLine = {
  key: string;
  logId: string;
  logDate: string;
  description: string;
  qty: number;
  purchaseUnit: number;
  total: number;
  source: 'expense' | 'partner_purchase';
};

export type WorkReportPurchaseCostAnalysis = {
  total: number;
  suppliesNet: number;
  lines: WorkReportPurchaseCostLine[];
  purchasePricesMissing: boolean;
};

function resolveExpenseLinePurchase(
  expense: NonNullable<WorkReportDailyLog['expense_lines']>[number],
): { unit: number | null; missing: boolean } {
  const mode = resolveExpenseBillingMode(expense);
  if (mode === 'partner_and_customer') {
    const unit = Number(expense.unit_price) || 0;
    return unit > 0 ? { unit, missing: false } : { unit: null, missing: true };
  }

  if (expensePurchasePriceMissing(expense)) {
    return { unit: null, missing: true };
  }

  const purchase = resolveExpensePurchaseUnitPrice(expense);
  if (purchase != null && purchase > 0) return { unit: purchase, missing: false };

  const unit = Number(expense.unit_price) || 0;
  if (unit > 0 && mode === 'included_in_contract') {
    return { unit, missing: false };
  }

  return { unit: null, missing: mode === 'customer_only' };
}

/** Kulurivi, joka on jo mukana päiväkirjan hankintasummassa — ei toisteta katetta syövissä kuluissa. */
export function expenseCountsAsWorkReportPurchase(
  expense: NonNullable<WorkReportDailyLog['expense_lines']>[number],
  extraBilling?: { extra_billable: boolean; extra_billing_allowed: boolean },
): boolean {
  if (
    expense.expense_type === 'km'
    && /^Ajomatkat\s*\(/i.test(String(expense.description ?? '').trim())
  ) {
    return false;
  }

  const qty = Number(expense.qty) || 0;
  if (!(qty > 0)) return false;

  const mode = resolveExpenseBillingMode(expense);
  if (mode === 'partner_and_customer') return false;

  if (mode === 'customer_only') {
    if (extraBilling?.extra_billing_allowed) return false;
    if (expensePurchasePriceMissing(expense)) return false;
    return expensePurchaseLineTotal(expense) > 0.005;
  }

  const purchaseUnit = resolveExpensePurchaseUnitPrice(expense);
  const unit = purchaseUnit ?? (Number(expense.unit_price) || 0);
  return unit > 0;
}

function isTripKmExpense(expense: NonNullable<WorkReportDailyLog['expense_lines']>[number]): boolean {
  return (
    expense.expense_type === 'km'
    && /^Ajomatkat\s*\(/i.test(String(expense.description ?? '').trim())
  );
}

/**
 * Summa, jolla kulurivi on mukana päiväkirjan tarvikehankinnassa
 * (analyzeWorkReportPurchaseCosts → työraportin "Tarvikkeet"-hankintarivi).
 * 0 = riviä ei lasketa tarvikkeisiin. Samaa sääntöä käytetään kate-laskennassa,
 * ettei sama tarvike vähenny kahdesti (tarvikkeet + katetta syövät kulut).
 */
export function expenseDiarySuppliesTotal(
  expense: NonNullable<WorkReportDailyLog['expense_lines']>[number],
  extraBilling?: { extra_billable: boolean; extra_billing_allowed: boolean },
): { total: number; qty: number; unit: number; missing: boolean } {
  const none = { total: 0, qty: 0, unit: 0, missing: false };
  if (isTripKmExpense(expense)) return none;
  if (!expenseCountsAsWorkReportPurchase(expense, extraBilling)) return none;
  const qty = Number(expense.qty) || 0;
  if (!(qty > 0)) return none;
  const { unit, missing } = resolveExpenseLinePurchase(expense);
  if (missing) return { ...none, missing: true };
  if (unit == null || !(unit > 0)) return none;
  const total = lineTotal(qty, unit);
  if (total <= 0.005) return none;
  return { total, qty, unit, missing: false };
}

/** Työraportin päiväkirjasta kirjatut hankintakulut (tarvikkeet + piikki). */
export function analyzeWorkReportPurchaseCosts(
  logs: WorkReportDailyLog[],
): WorkReportPurchaseCostAnalysis {
  const lines: WorkReportPurchaseCostLine[] = [];
  let purchasePricesMissing = false;

  for (const log of logs) {
    const logDate = log.log_date.slice(0, 10);
    const supplyLineFlags = parseDailyLogCustomerExtraBilling(log.customer_extra_billing).supply_line_flags;
    const expenseLines = log.expense_lines ?? [];

    for (let index = 0; index < expenseLines.length; index++) {
      const expense = expenseLines[index];
      const extraBilling = resolveLogExpenseExtraBillingFlags(expense, index, expenseLines, supplyLineFlags);
      const supply = expenseDiarySuppliesTotal(expense, extraBilling);
      if (supply.missing) {
        purchasePricesMissing = true;
        continue;
      }
      if (supply.total <= 0.005) continue;

      lines.push({
        key: `expense:${log.id}:${expense.id ?? expense.description}`,
        logId: log.id,
        logDate,
        description: String(expense.description ?? '').trim() || 'Tarvike',
        qty: supply.qty,
        purchaseUnit: supply.unit,
        total: supply.total,
        source: 'expense',
      });
    }

    for (const purchase of log.partner_purchase_lines ?? []) {
      const qty = Number(purchase.qty) || 0;
      const unit = Number(purchase.unit_price) || 0;
      if (!(qty > 0) || !(unit > 0)) continue;
      const total = lineTotal(qty, unit);
      lines.push({
        key: `partner:${log.id}:${purchase.id}`,
        logId: log.id,
        logDate,
        description: String(purchase.description ?? '').trim() || 'Hankinta',
        qty,
        purchaseUnit: unit,
        total,
        source: 'partner_purchase',
      });
    }
  }

  const suppliesNet = roundMoney(lines.reduce((sum, line) => sum + line.total, 0));
  return {
    total: suppliesNet,
    suppliesNet,
    lines,
    purchasePricesMissing,
  };
}
