import type { WorkReportDailyLog } from '../types';
import type { BillableCalculation } from './workReportBilling';
import {
  analyzeDailyLogExpensePurchase,
  type DailyLogExpensePurchaseAnalysis,
} from './workReportExpenseBilling';

export type { DailyLogExpensePurchaseAnalysis };

export type BasicWorkReportNetMarginResult =
  | {
      ok: true;
      customerTotal: number;
      partnerTotal: number;
      purchaseNet: number;
      purchaseLines: DailyLogExpensePurchaseAnalysis['lines'];
      netMarginNet: number;
    }
  | {
      ok: false;
      reason: string;
    };

function billableCalculationHasMissingCustomerPrices(calculation: BillableCalculation): boolean {
  return calculation.byUser.some((user) =>
    user.lines.some((line) => line.included && line.priceMissing),
  );
}

/** Perustyöraportin puhdas kate: asiakas − hankinta − kumppani. */
export function computeBasicWorkReportNetMargin(input: {
  customerCalculation: BillableCalculation;
  partnerCalculation?: BillableCalculation | null;
  logs: WorkReportDailyLog[];
}): BasicWorkReportNetMarginResult {
  if (billableCalculationHasMissingCustomerPrices(input.customerCalculation)) {
    return {
      ok: false,
      reason: 'Asiakkaalta laskutettava summa sisältää puuttuvia hintoja — puhdasta katetta ei voi laskea.',
    };
  }

  const purchase = analyzeDailyLogExpensePurchase(input.logs);
  if (purchase.purchasePricesMissing) {
    return {
      ok: false,
      reason: 'Hankintahinta puuttuu yhdeltä tai useammalta ostokululta — puhdasta katetta ei voi laskea.',
    };
  }

  const customerTotal = input.customerCalculation.grandTotal;
  const partnerTotal = input.partnerCalculation?.grandTotal ?? 0;
  const netMarginNet = Math.round((customerTotal - purchase.purchaseNet - partnerTotal) * 100) / 100;

  return {
    ok: true,
    customerTotal,
    partnerTotal,
    purchaseNet: purchase.purchaseNet,
    purchaseLines: purchase.lines,
    netMarginNet,
  };
}
