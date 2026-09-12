import type { WorkReportDailyLog } from '../types';
import {
  expensePurchaseLineTotal,
  expensePurchasePriceMissing,
  resolveExpenseBillingMode,
  resolveExpensePurchaseUnitPrice,
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
    if (expensePurchasePriceMissing(expense)) return false;
    return expensePurchaseLineTotal(expense) > 0.005;
  }

  const purchaseUnit = resolveExpensePurchaseUnitPrice(expense);
  const unit = purchaseUnit ?? (Number(expense.unit_price) || 0);
  return unit > 0;
}

/** Työraportin päiväkirjasta kirjatut hankintakulut (tarvikkeet + piikki). */
export function analyzeWorkReportPurchaseCosts(
  logs: WorkReportDailyLog[],
): WorkReportPurchaseCostAnalysis {
  const lines: WorkReportPurchaseCostLine[] = [];
  let purchasePricesMissing = false;

  for (const log of logs) {
    const logDate = log.log_date.slice(0, 10);

    for (const expense of log.expense_lines ?? []) {
      if (
        expense.expense_type === 'km'
        && /^Ajomatkat\s*\(/i.test(String(expense.description ?? '').trim())
      ) {
        continue;
      }

      if (!expenseCountsAsWorkReportPurchase(expense)) continue;

      const qty = Number(expense.qty) || 0;
      if (!(qty > 0)) continue;

      const { unit, missing } = resolveExpenseLinePurchase(expense);
      if (missing) {
        purchasePricesMissing = true;
        continue;
      }
      if (unit == null || !(unit > 0)) continue;

      const total = lineTotal(qty, unit);
      if (total <= 0.005) continue;

      lines.push({
        key: `expense:${log.id}:${expense.id ?? expense.description}`,
        logId: log.id,
        logDate,
        description: String(expense.description ?? '').trim() || 'Tarvike',
        qty,
        purchaseUnit: unit,
        total,
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
        description: String(purchase.description ?? '').trim() || 'Piikkiosto',
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
