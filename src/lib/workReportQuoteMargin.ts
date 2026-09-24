import type { WorkReportDailyLog } from '../types';
import {
  dailyLogCustomerExtraBillingHasData,
  parseDailyLogCustomerExtraBilling,
} from './dailyLogCustomerExtraBilling';
import { expenseCountsAsWorkReportPurchase } from './workReportActualPurchase';
import {
  expensePurchaseLineTotal,
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

export type MarginEatingExpenseLine = {
  logId: string;
  description: string;
  total: number;
  reason: 'included_in_contract' | 'customer_only_unapproved';
};

const COMMISSION_KEYWORDS = ['provisio', 'myyntiprovisio', 'kumppaniprovisio', 'palkkio', 'myyntikomissio'];

function isCommissionLine(description: string): boolean {
  const d = description.trim().toLowerCase();
  return COMMISSION_KEYWORDS.some((kw) => d.includes(kw));
}

/** Kulut jotka syövät katetta kun tarjous on kiinteä — ei lisälaskutuslupaa.
 * Kun provisio-% on käytössä, ohitetaan manuaaliset provisio-rivit (ettei tuplavähenny).
 */
export function analyzeMarginEatingExpenses(
  logs: WorkReportDailyLog[],
  opts?: { readonly commissionPercent?: number },
): { total: number; lines: MarginEatingExpenseLine[] } {
  const lines: MarginEatingExpenseLine[] = [];
  let total = 0;

  for (const log of logs) {
    const extra = parseDailyLogCustomerExtraBilling(log.customer_extra_billing);
    const hasApprovedExtraExpense =
      dailyLogCustomerExtraBillingHasData(extra)
      && !!extra.expense_description
      && Number(extra.expense_qty) > 0
      && Number(extra.expense_customer_unit_price) > 0;

    const supplyLineFlags = parseDailyLogCustomerExtraBilling(log.customer_extra_billing).supply_line_flags;
    const expenseLines = log.expense_lines ?? [];

    for (let index = 0; index < expenseLines.length; index++) {
      const expense = expenseLines[index];
      const mode = resolveExpenseBillingMode(expense);
      if (mode === 'partner_and_customer') continue;
      const extraBilling = resolveLogExpenseExtraBillingFlags(expense, index, expenseLines, supplyLineFlags);

      let cost = 0;
      let reason: MarginEatingExpenseLine['reason'] | null = null;

      if (mode === 'included_in_contract') {
        const purchaseUnit = resolveExpensePurchaseUnitPrice(expense);
        const unit = purchaseUnit ?? (Number(expense.unit_price) || 0);
        const qty = Number(expense.qty) || 0;
        cost = unit > 0 && qty > 0 ? lineTotal(qty, unit) : expensePurchaseLineTotal(expense);
        reason = 'included_in_contract';
      } else if (mode === 'customer_only') {
        if (extraBilling.extra_billing_allowed) continue;
        if (hasApprovedExtraExpense) continue;
        if (expenseCountsAsWorkReportPurchase(expense, extraBilling)) continue;
        cost = expensePurchaseLineTotal(expense);
        reason = 'customer_only_unapproved';
      }

      if (cost > 0.005 && reason) {
        // Kun provisio-% on käytössä, automaattinen provisio käsitellään erikseen.
        // Ohitetaan manuaaliset provisio-rivit, jotta ei tuplavähennystä.
        if ((opts?.commissionPercent ?? 0) > 0 && isCommissionLine(expense.description ?? '')) {
          continue;
        }
        total += cost;
        lines.push({
          logId: log.id,
          description: String(expense.description ?? '').trim() || 'Kulu',
          total: roundMoney(cost),
          reason,
        });
      }
    }
  }

  return { total: roundMoney(total), lines };
}

/** Kumppanin piikkiostojen raaka hankintahinta (ei kateprosenttia). */
export function sumPartnerPurchaseCostNet(logs: WorkReportDailyLog[]): number {
  let total = 0;
  for (const log of logs) {
    for (const line of log.partner_purchase_lines ?? []) {
      const qty = Number(line.qty) || 0;
      const unit = Number(line.unit_price) || 0;
      if (qty > 0 && unit > 0) total += lineTotal(qty, unit);
    }
  }
  return roundMoney(total);
}

/**
 * Yhdistä tarjouksen hankinta (koneet) ja kumppanilaskutetut tarvikkeet.
 * Pienet tarvikkeet lasketaan päälle; jos kumppanilaskutus sisältää selvästi saman
 * suuren hankinnan kuin tarjousrivit, käytetään suurempaa (ei kahteen kertaan).
 */
export function effectiveQuoteMaterialCostNet(
  actualPurchaseNet: number,
  partnerBilledMaterialsNet: number,
): number {
  const purchase = Math.max(0, actualPurchaseNet);
  const partnerMaterials = Math.max(0, partnerBilledMaterialsNet);
  if (purchase <= 0) return roundMoney(partnerMaterials);
  if (partnerMaterials <= 0) return roundMoney(purchase);
  if (partnerMaterials >= purchase * 0.9) {
    return roundMoney(Math.max(purchase, partnerMaterials));
  }
  return roundMoney(purchase + partnerMaterials);
}
