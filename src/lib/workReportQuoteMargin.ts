import type { WorkReportDailyLog } from '../types';
import {
  dailyLogCustomerExtraBillingHasData,
  parseDailyLogCustomerExtraBilling,
} from './dailyLogCustomerExtraBilling';
import {
  expenseCountsAsWorkReportPurchase,
  expenseDiarySuppliesTotal,
} from './workReportActualPurchase';
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

/**
 * Kulut jotka syövät katetta kun tarjous on kiinteä — ei lisälaskutuslupaa.
 *
 * Ohitetaan koko log:n expense_lines kun log.commission_amount > 0,
 * koska provisio käsitellään jo erikseen commissionNet:nä.
 * Näin vältytään tuplavähennykseltä.
 *
 * `excludeDiarySupplies`: kun työraportin hankintariveillä on jo päiväkirjan
 * "Tarvikkeet"-rivi (group:diary-supplies), ohitetaan kulurivit jotka sisältyvät
 * siihen (esim. "kuuluu urakkaan" -tarvikkeet). Muuten sama tarvike vähenisi
 * katteesta kahdesti: tarvikkeina JA katetta syövinä kuluina.
 */
export function analyzeMarginEatingExpenses(
  logs: WorkReportDailyLog[],
  options?: {
    excludeDiarySupplies?: boolean;
    /** Laiterivit (tyyppi Laite), jotka lasketaan katteen Laite-rivillä päiväkirjan hankintana. */
    excludeDeviceDiaryPurchases?: boolean;
  },
): { total: number; lines: MarginEatingExpenseLine[] } {
  const lines: MarginEatingExpenseLine[] = [];
  let total = 0;

  for (const log of logs) {
    // Jos manuaalinen provisio on syötetty, ohitetaan kaikki expense_lines
    // tästä log:ista — provisio vähennetään jo commissionNet:nä.
    if (Number(log.commission_amount || 0) > 0.005) {
      continue;
    }

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

      if (
        (options?.excludeDiarySupplies
          || (options?.excludeDeviceDiaryPurchases && String(expense.expense_type ?? '').trim() === 'device'))
        && expenseDiarySuppliesTotal(expense, extraBilling).total > 0.005
      ) {
        continue;
      }

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
