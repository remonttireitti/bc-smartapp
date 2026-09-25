import type { WorkReportDailyLog } from '../types';
import { parseDailyLogCustomerExtraBilling } from './dailyLogCustomerExtraBilling';
import type { BillingQuotePurchaseLine } from './quotePurchaseLines';
import { expenseDiarySuppliesTotal } from './workReportActualPurchase';
import { billableLineDisplayTotal, type BillableCalculation } from './workReportBilling';
import {
  resolveExpenseBillingMode,
  resolveLogExpenseExtraBillingFlags,
  type ExpenseBillingMode,
} from './workReportExpenseBilling';

/** Kulurivin tyyppi "Laite" (expense_lines.expense_type on vapaa teksti — ei migraatiota). */
export const DEVICE_EXPENSE_TYPE = 'device';

type ExpenseLine = NonNullable<WorkReportDailyLog['expense_lines']>[number];

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function isDeviceExpense(expense: { expense_type?: string | null } | null | undefined): boolean {
  return String(expense?.expense_type ?? '').trim() === DEVICE_EXPENSE_TYPE;
}

export type WorkReportDeviceEntry = {
  id: string;
  logId: string;
  logDate: string;
  description: string;
  qty: number;
  /** Hankintahinta yhteensä (alv 0 %), jos annettu. */
  purchaseNet: number | null;
  /** Asiakkaalle laskutettava yhteensä (alv 0 %), jos rivi laskutetaan asiakkaalta. */
  customerNet: number | null;
  billingMode: ExpenseBillingMode;
  /** Hyväksytty lisälaskutus (lisälaite) — ei korvaa tarjouspyynnön laitetta. */
  extraBilled: boolean;
  /** Rivi on toteutunut laitehankinta, joka korvaa tarjouspyynnön laitehinnan. */
  replacesQuoteDevice: boolean;
};

function lineQty(expense: ExpenseLine): number {
  return Number(expense.qty) || 0;
}

/**
 * Onko laiterivi toteutunut hankinta (kustannus kirjautuu katteeseen joko päiväkirjan hankintana
 * tai kumppanin laskulla). Hyväksytty lisälaskutus on lisälaite, ei tarjouspyynnön laite.
 */
function deviceEntryReplacesQuote(
  expense: ExpenseLine,
  extraBilling: { extra_billable: boolean; extra_billing_allowed: boolean },
): boolean {
  if (!isDeviceExpense(expense) || !(lineQty(expense) > 0)) return false;
  const mode = resolveExpenseBillingMode(expense);
  if (mode === 'customer_only' && extraBilling.extra_billing_allowed) return false;
  if (expenseDiarySuppliesTotal(expense, extraBilling).total > 0.005) return true;
  return mode === 'partner_and_customer' && lineQty(expense) * (Number(expense.unit_price) || 0) > 0.005;
}

export function collectDeviceEntries(logs: WorkReportDailyLog[]): WorkReportDeviceEntry[] {
  const entries: WorkReportDeviceEntry[] = [];
  for (const log of logs) {
    const flags = parseDailyLogCustomerExtraBilling(log.customer_extra_billing).supply_line_flags;
    const lines = log.expense_lines ?? [];
    lines.forEach((expense, index) => {
      if (!isDeviceExpense(expense)) return;
      const extraBilling = resolveLogExpenseExtraBillingFlags(expense, index, lines, flags);
      const qty = lineQty(expense);
      const mode = resolveExpenseBillingMode(expense);
      const diary = expenseDiarySuppliesTotal(expense, extraBilling).total;
      const unit = Number(expense.unit_price) || 0;
      const purchaseNet = diary > 0.005 ? diary : unit > 0 && qty > 0 ? roundMoney(unit * qty) : null;
      const customerUnit = Number(expense.customer_unit_price) || 0;
      const customerBilled =
        expense.bill_to_customer !== false
        && (mode !== 'customer_only' || extraBilling.extra_billing_allowed || !extraBilling.extra_billable);
      entries.push({
        id: String(expense.id ?? `${log.id}:${index}`),
        logId: log.id,
        logDate: String(log.log_date ?? '').slice(0, 10),
        description: String(expense.description ?? '').trim() || 'Laite',
        qty,
        purchaseNet,
        customerNet: customerBilled && customerUnit > 0 && qty > 0 ? roundMoney(customerUnit * qty) : null,
        billingMode: mode,
        extraBilled: mode === 'customer_only' && extraBilling.extra_billing_allowed,
        replacesQuoteDevice: deviceEntryReplacesQuote(expense, extraBilling),
      });
    });
  }
  return entries;
}

/**
 * Kun laite on kirjattu työraporttiin toteutuneena hankintana, se korvaa tarjouspyynnön laitehinnan
 * (ja mahdollisen oikaisun) — laite vähennetään katteesta vain kerran.
 */
export function deviceEntriesReplaceQuoteDevice(logs: WorkReportDailyLog[] | null | undefined): boolean {
  if (!logs?.length) return false;
  return collectDeviceEntries(logs).some((entry) => entry.replacesQuoteDevice);
}

/**
 * Laiterivien summat, jotka sisältyvät jo katteen muihin vähennyksiin:
 * - diaryNet: päiväkirjan hankinnat (tarvikehankinta-rivillä group:diary-supplies)
 * - partnerNet: kumppanin laskuttamat laiterivit (kumppanin laskelmassa)
 * Näillä siirretään summa Laite-riville — kokonaissumma ei muutu.
 */
export function deviceEntryCostSplit(
  logs: WorkReportDailyLog[] | null | undefined,
  partnerCalculation?: BillableCalculation | null,
): { diaryNet: number; partnerNet: number } {
  let diaryNet = 0;
  for (const log of logs ?? []) {
    const flags = parseDailyLogCustomerExtraBilling(log.customer_extra_billing).supply_line_flags;
    const lines = log.expense_lines ?? [];
    lines.forEach((expense, index) => {
      if (!isDeviceExpense(expense)) return;
      const extraBilling = resolveLogExpenseExtraBillingFlags(expense, index, lines, flags);
      diaryNet += expenseDiarySuppliesTotal(expense, extraBilling).total;
    });
  }
  let partnerNet = 0;
  for (const user of partnerCalculation?.byUser ?? []) {
    for (const line of user.lines) {
      if (!line.included || line.kind !== 'expense') continue;
      if (!isDeviceExpense({ expense_type: line.expenseType })) continue;
      partnerNet += billableLineDisplayTotal(line);
    }
  }
  return { diaryNet: roundMoney(diaryNet), partnerNet: roundMoney(partnerNet) };
}

/** Tarjouspyynnön laiterivien toteutunut, kun työraportin laitekirjaukset korvaavat sen (0). */
export function effectiveQuoteDeviceActualNet(
  lines: BillingQuotePurchaseLine[] | null | undefined,
  logs: WorkReportDailyLog[] | null | undefined,
): number {
  const deviceLines = (lines ?? []).filter((line) => line.source === 'device');
  if (deviceEntriesReplaceQuoteDevice(logs)) return 0;
  return roundMoney(deviceLines.reduce((sum, line) => sum + (Number(line.actual_purchase_net) || 0), 0));
}
