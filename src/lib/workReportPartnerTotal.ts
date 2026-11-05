import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkReportDailyLog } from '../types';
import {
  mergeAutoPartnerCommission,
  moveContractorCostLines,
  restoreContractorCostLines,
  stripAutoPartnerCommission,
  includeUrakkaExpenseLines,
  type BillableCalculation,
} from './workReportBilling';
import { compareQuoteCategories } from './quoteCategoryComparison';
import { summarizeReportUrakka } from './workReportUrakkaReport';
import {
  mergeUrakkaMaterialDeduction,
  stripUrakkaMaterialDeduction,
  urakkaMaterialBillDelta,
} from './workReportUrakkaMaterials';
import { expenseTypeCategory } from './workReportEntryCategories';
import {
  billingQuoteHasData,
  computePartnerNetMargin,
  formatCommissionPercent,
  normalizeBillingQuoteSettings,
  parseBillingQuoteSettings,
  type PartnerMarginComputed,
} from './workReportBillingQuote';
import { mergeActualPurchaseFromWorkReportLogs } from './quoteRequestActualPurchaseSync';
import {
  CONTRACTOR_INVOICE_DESCRIPTION,
  deviceSellerContractorInvoiceNet,
  resolveContractorChain,
  resolveDeviceSellerSaleNet,
} from './workReportDeviceSeller';

/** Laitemyyjä-ketjun tasausrivin teksti kumppanilaskulla. */
export const DEVICE_SELLER_BALANCE_DESCRIPTION = 'Urakkaosuus (tarjous − laite − kulut)';

/** Automaattisen provisiorivin teksti kumppanilaskulla. */
export function autoPartnerCommissionDescription(margin: PartnerMarginComputed): string {
  const pct = formatCommissionPercent(margin.commissionPercent);
  if (margin.commissionSource === 'amount') {
    return `Provisio (sovittu summa, ${pct} % puhtaasta katteesta)`;
  }
  return `Provisio ${pct} % puhtaasta katteesta`;
}

function latestLogDate(logs: WorkReportDailyLog[]): string | undefined {
  const dates = logs
    .map((log) => String(log.log_date ?? '').slice(0, 10))
    .filter(Boolean)
    .sort();
  return dates[dates.length - 1];
}

/**
 * Lisää kumppanilaskelmaan automaattisen provisiorivin (kind 'commission'), kun
 * työraporttiin on liitetty laskutustarjous. partner_total = calculation.grandTotal
 * (kustannukset + provisio) — yksi mekanismi, ei erillistä summakorjausta.
 *
 * - Päiväkirjan Myyntiprovisio € (commission_amount > 0) on provisio: automaattista
 *   riviä ei lisätä (mergeAutoPartnerCommission poistaa sen).
 * - Ei vaikuta asiakaslaskutukseen.
 */
export function applyQuoteCommissionToPartnerCalculation(input: {
  billingQuote: unknown;
  logs: WorkReportDailyLog[];
  calculation: BillableCalculation;
  /**
   * Linkitetyn tarjouspyynnön data (quote_requests.data). Tarvitaan, jotta
   * hankintariveille saadaan tarjotut laitteet samalla tavalla kuin
   * laskutustarjous-paneelissa. Ilman tätä vanha tallennettu rakenne
   * (pelkkä "Tarvikkeet (päiväkirja)" -rivi) pudottaa laitteen katteesta pois
   * ja provisio paisuu (Wärtsilä: laite 22 896 € puuttui → provisio 15 022,57 €).
   */
  quoteData?: unknown | null;
}): { calculation: BillableCalculation; partnerMargin: PartnerMarginComputed | null } {
  // Aiempi urakoitsijaketju palautetaan ensin: kulupohja täydeksi ja laskun saaja tilaajaksi.
  const previousContractorInvoice = input.calculation.contractorInvoice ?? null;
  const restored = restoreContractorCostLines(
    stripUrakkaMaterialDeduction(stripAutoPartnerCommission(input.calculation)),
  );
  const base: BillableCalculation = previousContractorInvoice
    ? {
        ...restored,
        billToCompanyId: previousContractorInvoice.toCompanyId,
        billToCompanyName: previousContractorInvoice.toCompanyName,
        contractorInvoice: null,
      }
    : restored.contractorInvoice !== undefined
      ? { ...restored, contractorInvoice: null }
      : restored;
  const parsed = normalizeBillingQuoteSettings(parseBillingQuoteSettings(input.billingQuote));
  if (!billingQuoteHasData(parsed)) {
    return { calculation: base, partnerMargin: null };
  }
  const effectiveSettings = mergeActualPurchaseFromWorkReportLogs(
    parsed,
    input.logs,
    input.quoteData ?? null,
  );
  const partnerMargin = computePartnerNetMargin(effectiveSettings, base.grandTotal, {
    logs: input.logs,
    partnerRates: base.ratesUsed,
    customerRates: undefined,
    partnerCalculation: base,
    quoteData: input.quoteData ?? null,
  });
  if (!partnerMargin) {
    return { calculation: base, partnerMargin: null };
  }
  // Laitemyyjä-ketju: kumppanilasku tilaajalle = tarjoushinta − laitteen myyntihinta
  // (+ kumppanin lisäkulut). Tasausrivi = lasku − kirjatut kulut; ei provisiota.
  // Urakoitsijaketju: asentajan lasku urakoitsijalle = työt + kulut (tarvikkeet ovat
  // urakoitsijan omia, ellei asentaja laskuta niitä); urakoitsijan lasku tilaajalle
  // = tarjous − laite (+ kumppanin lisäkulut) tallennetaan toisena laskuluonnoksena.
  const chain = resolveContractorChain(effectiveSettings);
  if (chain) {
    const installerBillsSupplies = effectiveSettings.installer_bills_supplies === true;
    const installer = installerBillsSupplies
      ? base
      : moveContractorCostLines(base, (line) => expenseTypeCategory(line.expenseType) === 'supplies');
    const calculation: BillableCalculation = {
      ...installer,
      billToCompanyId: chain.contractorCompanyId,
      billToCompanyName: chain.contractorCompanyName,
      contractorInvoice: {
        fromCompanyId: chain.contractorCompanyId,
        fromCompanyName: chain.contractorCompanyName,
        toCompanyId: base.billToCompanyId,
        toCompanyName: base.billToCompanyName,
        amount: deviceSellerContractorInvoiceNet(partnerMargin, chain.deviceSaleNet),
        description: CONTRACTOR_INVOICE_DESCRIPTION,
      },
    };
    return { calculation, partnerMargin };
  }
  const deviceSaleNet = resolveDeviceSellerSaleNet(effectiveSettings);
  if (deviceSaleNet != null) {
    const invoiceNet = deviceSellerContractorInvoiceNet(partnerMargin, deviceSaleNet);
    const calculation = mergeAutoPartnerCommission(base, {
      amount: Math.round((invoiceNet - base.grandTotal) * 100) / 100,
      note: DEVICE_SELLER_BALANCE_DESCRIPTION,
      logs: input.logs,
      logDate: latestLogDate(input.logs),
      balancing: true,
    });
    return { calculation, partnerMargin };
  }
  const withCommission = mergeAutoPartnerCommission(base, {
    amount: partnerMargin.commissionNet,
    percent: partnerMargin.commissionPercent,
    note: autoPartnerCommissionDescription(partnerMargin),
    logs: input.logs,
    logDate: latestLogDate(input.logs),
  });
  const calculation = applyUrakkaMaterialDeduction(withCommission, base, effectiveSettings, input.logs, input.quoteData ?? null);
  return { calculation, partnerMargin };
}

/**
 * Urakka asiakashinnasta: toteutuneet tarvikekulut vähennetään asiakashinnasta ENNEN kumppanijakoa
 * (kumppanilasku = osuus % × (asiakashinta − tarvikkeet)). Lisätään kumppanilaskulle negatiivinen
 * urakkarivi. Tarvikkeet eivät ole tämän lisäksi urakoitsijan omia kuluja (yhteenveto jättää ne pois).
 */
function applyUrakkaMaterialDeduction(
  calculation: BillableCalculation,
  base: BillableCalculation,
  settings: ReturnType<typeof mergeActualPurchaseFromWorkReportLogs>,
  logs: WorkReportDailyLog[],
  quoteData: unknown | null,
): BillableCalculation {
  if (!quoteData) return calculation;
  const urakka = summarizeReportUrakka(logs);
  if (!urakka.hasUrakka || urakka.mode !== 'from_customer' || !(urakka.customerTotal && urakka.customerTotal > 0)) {
    return calculation;
  }
  // Takuu / ei laskulla → ei urakkariviä, ei vähennystä.
  const hasBilledUrakka = base.byUser.some((user) =>
    user.lines.some((line) => line.kind === 'fixed_price' && line.included && !line.warranty && line.total > 0),
  );
  if (!hasBilledUrakka) return calculation;
  const comparison = compareQuoteCategories({
    quoteData,
    partnerCalculation: includeUrakkaExpenseLines(base),
    logs,
    partnerRates: base.ratesUsed,
    billingSettings: settings,
  });
  const materials = comparison?.rows.find((row) => row.key === 'supplies')?.actualNet ?? 0;
  const delta = urakkaMaterialBillDelta(urakka.customerTotal, urakka.partnerPercent, materials);
  if (!(delta < -0.005)) return calculation;
  const pct = String(urakka.partnerPercent).replace('.', ',');
  const materialsText = `${(Math.round(materials * 100) / 100).toFixed(2).replace('.', ',')} €`;
  return mergeUrakkaMaterialDeduction(calculation, {
    amount: delta,
    description: `Tarvikekulut ${materialsText} vähennetty asiakashinnasta ennen jakoa (${pct} %)`,
    logDate: latestLogDate(logs) ?? new Date().toISOString().slice(0, 10),
  });
}

/**
 * Lataa laskutustarjoukseen linkitetyn tarjouspyynnön datan (laitteet + tarvikkeet),
 * jotta kumppanilaskelman provisio lasketaan samoista hankintariveistä kuin
 * laskutustarjous-paneelissa ja tulosteessa. Palauttaa null, jos linkkiä ei ole
 * tai rivi ei ole luettavissa.
 */
export async function loadLinkedQuoteDataForBillingQuote(
  supabase: SupabaseClient,
  billingQuote: unknown,
): Promise<unknown | null> {
  const parsed = parseBillingQuoteSettings(billingQuote);
  const quoteRequestId = parsed.quote_request_id?.trim();
  if (!quoteRequestId) return null;
  try {
    const { data, error } = await supabase
      .from('quote_requests')
      .select('data')
      .eq('id', quoteRequestId)
      .maybeSingle();
    if (error || !data) return null;
    return (data as { data?: unknown }).data ?? null;
  } catch {
    return null;
  }
}

/**
 * Tallennettu kumppanilaskelma on ristiriitainen, jos partner_total ≠ calculation.grandTotal
 * (ennen #83:a provisio lisättiin vain partner_total:iin → lista näytti "Avoinna"
 * provisiota, raportti ei).
 */
export function partnerBillableStoredTotalMismatch(
  partnerTotal: unknown,
  calculation: unknown,
): boolean {
  const calc = calculation as { grandTotal?: unknown; byUser?: unknown[] } | null | undefined;
  if (!calc?.byUser?.length) return false;
  const total = Number(partnerTotal);
  const grand = Number(calc.grandTotal);
  if (!Number.isFinite(total) || !Number.isFinite(grand)) return false;
  return Math.abs(total - grand) > 0.005;
}

/**
 * Ohitetaanko uudelleenlaskenta täysin laskutetulle raportille. Ei ohiteta, kun
 * käyttäjä painoi "Päivitä laskelma" (force), laskelma on merkitty päivitettäväksi
 * tai tallennettu summa on ristiriidassa laskelman kanssa (vanha, jäätynyt summa).
 * Laskutettu summa (partner_billed_amount) ei muutu uudelleenlaskennassa.
 */
export function shouldSkipPaidPartnerRecalc(input: {
  partnerInvoiceStatus: string | null | undefined;
  partnerBilledAmount: unknown;
  partnerRecalcNeeded?: boolean | null;
  partnerTotal?: unknown;
  calculation?: unknown;
  force?: boolean;
}): boolean {
  if (input.force) return false;
  const isFullyPaid =
    input.partnerInvoiceStatus === 'paid'
    && Number(input.partnerBilledAmount ?? 0) > 0.005
    && input.partnerRecalcNeeded !== true;
  if (!isFullyPaid) return false;
  if (partnerBillableStoredTotalMismatch(input.partnerTotal, input.calculation)) return false;
  return true;
}
