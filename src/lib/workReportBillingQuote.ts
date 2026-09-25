import type { SupabaseClient } from '@supabase/supabase-js';
import { computeQuoteInternalTotals, computeQuoteTotals } from './quoteRequest/calculations';
import { normalizeQuoteRequestData } from './quoteRequest/defaults';
import type { BillableRatesSource } from './management';
import {
  breakdownPartnerBillingForQuoteMargin,
  type BillableCalculation,
} from './workReportBilling';
import {
  analyzeMarginEatingExpenses,
  effectiveQuoteMaterialCostNet,
  sumPartnerPurchaseCostNet,
} from './workReportQuoteMargin';
import { formatEuro } from './workReportBilling';
import { deviceEntryCostSplit, effectiveQuoteDeviceActualNet } from './workReportDeviceEntries';
import {
  calculateWorkReportCustomerQuoteExtras,
} from './workReportCustomerBilling';
import {
  computeQuoteExtrasMarginFromLogs,
  extraCustomerWorkFromDailyLogs,
  shouldCalculateCustomerQuoteExtrasFromLogs,
} from './dailyLogCustomerExtraBilling';
import type { PartnerBillingRates } from './management';
import { sumDailyCommission, type WorkReportDailyLog } from '../types';
import {
  extraCustomerWorkHasBillableData,
  normalizeExtraCustomerWork,
  parseExtraCustomerWork,
  resolveExtraCustomerWork,
  type BillingQuoteExtraCustomerLine,
  type BillingQuoteExtraCustomerWork,
} from './billingQuoteExtraWork';
import {
  extractQuotePurchaseLines,
  mergeQuotePurchaseLines,
  parseBillingQuotePurchaseLines,
  reconcileQuotePurchaseLines,
  sumQuotePurchaseLines,
  type BillingQuotePurchaseLine,
} from './quotePurchaseLines';

export type { BillingQuotePurchaseLine } from './quotePurchaseLines';

export type { BillingQuoteExtraCustomerLine, BillingQuoteExtraCustomerWork, BillingQuoteExtraExpenseLine } from './billingQuoteExtraWork';

export type CustomerBillingMode = 'daily_log' | 'quote_fixed' | 'quote_plus_extras';

/** Oletusprovisio % puhtaasta katteesta (ennen provisiota). */
export const DEFAULT_PARTNER_COMMISSION_PERCENT = 50;

export type BillingQuoteSettings = {
  quote_request_id?: string | null;
  quote_title?: string | null;
  /** Tarjoushinta alv 0 % — kate-laskenta. */
  quote_sale_net?: number | null;
  /** Tarjouksen hankinta alv 0 %. */
  quote_purchase_net?: number | null;
  /** Todellinen hankinta alv 0 %. */
  actual_purchase_net?: number | null;
  /** Asiakkaalta laskutettava summa (sis. alv jos kuluttaja). */
  customer_invoice_total?: number | null;
  customer_mode?: CustomerBillingMode;
  /** Lisätyöt asiakkaalle tarjouksen päälle (tunnit + selitys + kulut). */
  extra_customer_work?: BillingQuoteExtraCustomerWork[];
  /** @deprecated Siirretty extra_customer_work */
  extra_customer_lines?: BillingQuoteExtraCustomerLine[];
  quote_vat_rate?: number | null;
  notes?: string | null;
  /** Tarjouksen hankintarivit — korjattavissa vain työraportilla. */
  purchase_lines?: BillingQuotePurchaseLine[];
  /**
   * Kumppanin provisio % puhtaasta katteesta (ennen provisiota).
   * null/undefined → DEFAULT_PARTNER_COMMISSION_PERCENT (50). Explicit 0 sallittu.
   * Ei vaikuta asiakaslaskutukseen.
   */
  partner_commission_percent?: number | null;
  /**
   * Kumppanin provisio summana € alv 0 %. Kun asetettu (ei null), provisio = tämä summa
   * ja % lasketaan siitä (summa / kate ennen provisiota). null → prosenttitila.
   */
  partner_commission_amount?: number | null;
};

export type BillingQuoteOption = {
  id: string;
  title: string;
  status: string;
  updated_at: string;
  quote_sale_net: number;
  quote_purchase_net: number;
  customer_invoice_total: number;
  quote_vat_rate: number;
};

/** Kate-taulukon vähennysrivi. amount > 0 vähennetään, < 0 lisätään (korjaus). */
export type PartnerMarginDeductionRow = {
  key:
    | 'labor_expenses'
    | 'device'
    | 'supplies'
    | 'material_overlap'
    | 'margin_eating'
    | 'partner_piikki'
    | 'piikki_material';
  label: string;
  amount: number;
  /** Erittely (esim. katetta syövät kulut kuvauksineen). */
  details?: Array<{ description: string; total: number }>;
};

/** Päiväkirjan tarvikkeiden hankintarivin id (quoteRequestActualPurchaseSync). */
export const DIARY_SUPPLIES_PURCHASE_LINE_ID = 'group:diary-supplies';

export type PartnerMarginComputed = {
  quoteSaleNet: number;
  quotePurchaseNet: number;
  actualPurchaseNet: number;
  /** Työ + ajot (ei tarvikkeita). */
  installationLaborTravelNet: number;
  /** Kumppanille laskutetut tarvikkeet päiväkirjasta. */
  partnerBilledMaterialsNet: number;
  /** max(todellinen hankinta, kumppanilaskutetut tarvikkeet). */
  effectiveMaterialCostNet: number;
  /** Urakkaan kuuluvat / piikki-kulut ilman lisälaskutuslupaa. */
  marginEatingExpenseNet: number;
  /** Kumppanin piikkiostot (raaka hankinta). */
  partnerPiikkiPurchaseNet: number;
  /** @deprecated käytä installationLaborTravelNet */
  installationCostNet: number;
  customerExtrasNet: number;
  piikkiMaterialCostNet: number;
  extrasMarginNet: number;
  /** Laitteiden toteutunut hankinta (purchase_lines source=device). */
  deviceActualNet: number;
  /** Muu toteutunut hankinta (tarvikkeet; päiväkirja tai tarjousarvio). */
  suppliesActualNet: number;
  /**
   * Näkyvät vähennysrivit. Invariantti:
   * quoteSaleNet + customerExtrasNet − Σ amount === grossMarginNet.
   */
  deductionRows: PartnerMarginDeductionRow[];
  /** Kumppanin laskemat kustannukset ilman provisiota (työ + kulut + tarvikkeet). */
  partnerCostsNet: number;
  /** Kate ennen kumppaniprovisiota. */
  grossMarginNet: number;
  /** Käytetty (efektiivinen) provisio-% — summatilassa laskettu summasta. */
  commissionPercent: number;
  /** Asetuksissa oleva provisio-% (oletus 50). */
  configuredCommissionPercent: number;
  /**
   * Mistä provisio tulee: päiväkirjan Myyntiprovisio € (voittaa), sovittu summa
   * (partner_commission_amount) tai prosentti.
   */
  commissionSource: 'daily_log' | 'amount' | 'percent';
  /** Provisio on suurempi kuin (positiivinen) kate ennen provisiota. */
  commissionExceedsGross: boolean;
  /** Provisio € alv 0 % (max(0, gross) * %). */
  commissionNet: number;
  /** Puhdas kate provision jälkeen (= gross − commission). */
  netMarginNet: number;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Provisio-%: finite 0–100 → arvo; muuten DEFAULT 50. Explicit 0 säilyy. */
export function resolvePartnerCommissionPercent(
  settings: BillingQuoteSettings | null | undefined,
): number {
  const raw = settings?.partner_commission_percent;
  if (raw == null) return DEFAULT_PARTNER_COMMISSION_PERCENT;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_PARTNER_COMMISSION_PERCENT;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

/** Provisio €: finite → max(0, arvo) pyöristettynä; muuten null (prosenttitila). */
function normalizePartnerCommissionAmount(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return roundMoney(Math.max(0, n));
}

/** Sovittu provisiosumma € tai null (prosenttitila). */
export function resolvePartnerCommissionAmount(
  settings: BillingQuoteSettings | null | undefined,
): number | null {
  return normalizePartnerCommissionAmount(settings?.partner_commission_amount);
}

/** Provisio-% suomalaisittain: 49.09 → "49,09". */
export function formatCommissionPercent(value: number): string {
  return String(roundMoney(value)).replace('.', ',');
}

function normalizePartnerCommissionPercent(
  value: number | null | undefined,
): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return roundMoney(n);
}

/** Lyhyt suomenkielinen yhteenveto: tarjous vs toteutuneet kulut. */
export function formatUrakkaOutcomeSummary(input: {
  varianceNet: number;
  quoteTotalNet: number;
  actualTotalNet: number;
  formatMoney?: (value: number) => string;
}): string {
  const format = input.formatMoney ?? formatEuro;
  const absVar = Math.abs(input.varianceNet);
  let outcome: string;
  if (absVar < 0.005) {
    outcome = 'Toteutuneet kulut pysyivät tarjouksen budjetissa.';
  } else if (input.varianceNet < 0) {
    outcome = `Toteutuneet kulut alittivat tarjouksen budjetin ${format(absVar)}.`;
  } else {
    outcome = `Toteutuneet kulut ylittivät tarjouksen budjetin ${format(absVar)}.`;
  }
  return (
    `${outcome} Tarjous ${format(input.quoteTotalNet)} → toteutunut ${format(input.actualTotalNet)}.`
  );
}

export function quoteHasVat(vatRate: number | null | undefined): boolean {
  return Number(vatRate) > 0;
}

export function getBillingQuoteExtraCustomerWork(
  settings: BillingQuoteSettings | null | undefined,
): BillingQuoteExtraCustomerWork[] {
  return resolveExtraCustomerWork({
    extra_customer_work: settings?.extra_customer_work,
    extra_customer_lines: settings?.extra_customer_lines,
  });
}

export function parseBillingQuoteSettings(raw: unknown): BillingQuoteSettings {
  if (!raw || typeof raw !== 'object') return { customer_mode: 'daily_log' };
  const record = raw as Record<string, unknown>;
  const num = (key: string) => {
    const value = record[key];
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? roundMoney(parsed) : null;
  };
  const mode: CustomerBillingMode =
    record.customer_mode === 'quote_fixed'
      ? 'quote_fixed'
      : record.customer_mode === 'quote_plus_extras'
        ? 'quote_plus_extras'
        : 'daily_log';
  const purchaseLines = parseBillingQuotePurchaseLines(record.purchase_lines);
  const extraCustomerWork = normalizeExtraCustomerWork(parseExtraCustomerWork(record.extra_customer_work));
  const settings: BillingQuoteSettings = {
    quote_request_id:
      typeof record.quote_request_id === 'string' && record.quote_request_id.trim()
        ? record.quote_request_id.trim()
        : null,
    quote_title:
      typeof record.quote_title === 'string' && record.quote_title.trim()
        ? record.quote_title.trim()
        : null,
    quote_sale_net: num('quote_sale_net'),
    quote_purchase_net: num('quote_purchase_net'),
    actual_purchase_net: num('actual_purchase_net'),
    customer_invoice_total: num('customer_invoice_total'),
    customer_mode: mode,
    extra_customer_work: extraCustomerWork.length > 0 ? extraCustomerWork : undefined,
    extra_customer_lines:
      record.extra_customer_lines != null ? (record.extra_customer_lines as BillingQuoteExtraCustomerLine[]) : undefined,
    quote_vat_rate: num('quote_vat_rate'),
    notes: typeof record.notes === 'string' ? record.notes : null,
    purchase_lines: purchaseLines.length > 0 ? purchaseLines : undefined,
    partner_commission_percent: normalizePartnerCommissionPercent(
      record.partner_commission_percent as number | null | undefined,
    ),
    partner_commission_amount: normalizePartnerCommissionAmount(record.partner_commission_amount),
  };
  return normalizeBillingQuoteSettings(settings);
}

export function normalizeBillingQuoteSettings(settings: BillingQuoteSettings): BillingQuoteSettings {
  const lines = settings.purchase_lines ?? [];
  const extraCustomerWork = normalizeExtraCustomerWork(
    resolveExtraCustomerWork({
      extra_customer_work: settings.extra_customer_work,
      extra_customer_lines: settings.extra_customer_lines,
    }),
  );

  const withExtras: BillingQuoteSettings = {
    ...settings,
    extra_customer_work: extraCustomerWork.length > 0 ? extraCustomerWork : undefined,
    extra_customer_lines: undefined,
    partner_commission_percent: normalizePartnerCommissionPercent(
      settings.partner_commission_percent,
    ),
    partner_commission_amount: normalizePartnerCommissionAmount(settings.partner_commission_amount),
  };

  if (lines.length > 0) {
    const normalizedLines = lines.map((line) => ({
      ...line,
      quote_purchase_net: roundMoney(line.quote_purchase_net),
      actual_purchase_net: roundMoney(line.actual_purchase_net ?? line.quote_purchase_net),
    }));
    return {
      ...withExtras,
      purchase_lines: normalizedLines,
      quote_purchase_net: sumQuotePurchaseLines(normalizedLines, 'quote_purchase_net'),
      actual_purchase_net: sumQuotePurchaseLines(normalizedLines, 'actual_purchase_net'),
    };
  }
  return withExtras;
}

export function resolveQuotePurchaseTotal(settings: BillingQuoteSettings): number {
  const normalized = normalizeBillingQuoteSettings(parseBillingQuoteSettings(settings));
  if (normalized.purchase_lines?.length) {
    return sumQuotePurchaseLines(normalized.purchase_lines, 'quote_purchase_net');
  }
  return roundMoney(normalized.quote_purchase_net ?? 0);
}

export type QuotePurchaseMarginAdjustment = {
  quoteSaleNet: number;
  quotePurchaseNet: number;
  actualPurchaseNet: number;
  purchaseDeltaNet: number;
  marginNetAtQuote: number;
  marginNetAfterActual: number;
  marginPercentAtQuote: number;
  marginPercentAfterActual: number;
};

/** Kate-% muutos kun hankinta korjataan mutta tarjoushinta pysyy kiinteenä. */
export function computeQuotePurchaseMarginAdjustment(
  settings: BillingQuoteSettings,
): QuotePurchaseMarginAdjustment | null {
  const quoteSaleNet = settings.quote_sale_net;
  if (quoteSaleNet == null || quoteSaleNet <= 0) return null;

  const quotePurchaseNet = resolveQuotePurchaseTotal(settings);
  const actualPurchaseNet = resolveActualPurchaseTotal(settings);
  const purchaseDeltaNet = roundMoney(actualPurchaseNet - quotePurchaseNet);
  const marginNetAtQuote = roundMoney(quoteSaleNet - quotePurchaseNet);
  const marginNetAfterActual = roundMoney(quoteSaleNet - actualPurchaseNet);
  const marginPercentAtQuote =
    quoteSaleNet > 0 ? roundMoney((marginNetAtQuote / quoteSaleNet) * 100) : 0;
  const marginPercentAfterActual =
    quoteSaleNet > 0 ? roundMoney((marginNetAfterActual / quoteSaleNet) * 100) : 0;

  return {
    quoteSaleNet: roundMoney(quoteSaleNet),
    quotePurchaseNet: roundMoney(quotePurchaseNet),
    actualPurchaseNet: roundMoney(actualPurchaseNet),
    purchaseDeltaNet,
    marginNetAtQuote,
    marginNetAfterActual,
    marginPercentAtQuote,
    marginPercentAfterActual,
  };
}

export function resolveActualPurchaseTotal(settings: BillingQuoteSettings): number {
  const normalized = normalizeBillingQuoteSettings(parseBillingQuoteSettings(settings));
  if (normalized.purchase_lines?.length) {
    return sumQuotePurchaseLines(normalized.purchase_lines, 'actual_purchase_net');
  }
  return roundMoney(normalized.actual_purchase_net ?? normalized.quote_purchase_net ?? 0);
}

export function billingQuoteHasData(settings: BillingQuoteSettings): boolean {
  return (
    !!settings.quote_request_id
    || settings.quote_sale_net != null
    || settings.customer_invoice_total != null
    || (settings.purchase_lines?.length ?? 0) > 0
    || extraCustomerWorkHasBillableData(getBillingQuoteExtraCustomerWork(settings))
    || !!settings.notes?.trim()
  );
}

export function customerUsesQuotePlusExtras(settings: BillingQuoteSettings | null | undefined): boolean {
  const parsed = parseBillingQuoteSettings(settings ?? {});
  return parsed.customer_mode === 'quote_plus_extras' && resolveCustomerInvoiceTotal(parsed) != null;
}

/** Lisälaskutus kun päiväkirjassa tai asetuksissa on lisärivejä (ei erillistä käyttöönottoa). */
export function shouldUseQuoteExtrasBilling(
  settings: BillingQuoteSettings | null | undefined,
  logs: WorkReportDailyLog[],
): boolean {
  const parsed = parseBillingQuoteSettings(settings ?? {});
  if (resolveCustomerInvoiceTotal(parsed) == null) return false;
  if (!workReportHasLinkedQuoteRequest(parsed)) return false;
  if (!customerUsesQuoteBasedBilling(parsed)) return false;
  return (
    shouldCalculateCustomerQuoteExtrasFromLogs(logs)
    || getBillingQuoteExtraCustomerWork(parsed).length > 0
  );
}

export function customerUsesQuoteBasedBilling(settings: BillingQuoteSettings | null | undefined): boolean {
  return customerUsesFixedQuote(settings) || customerUsesQuotePlusExtras(settings);
}

/** Työraporttiin on linkitetty tarjouspyyntö (esim. tilauksesta luotu työraportti). */
export function workReportHasLinkedQuoteRequest(
  settings: BillingQuoteSettings | null | undefined,
): boolean {
  const parsed = parseBillingQuoteSettings(settings ?? {});
  return !!parsed.quote_request_id?.trim();
}

/** Lisälaskutus ja tarjouskategoriat vain linkitetylle tarjouspyynnölle. */
export function workReportSupportsQuoteLinkedExtraBilling(
  settings: BillingQuoteSettings | null | undefined,
): boolean {
  return workReportHasLinkedQuoteRequest(settings) && customerUsesQuoteBasedBilling(settings);
}

export function customerUsesFixedQuote(settings: BillingQuoteSettings | null | undefined): boolean {
  const parsed = parseBillingQuoteSettings(settings ?? {});
  return parsed.customer_mode === 'quote_fixed' && resolveCustomerInvoiceTotal(parsed) != null;
}

export function resolveCustomerInvoiceTotal(settings: BillingQuoteSettings): number | null {
  if (settings.customer_invoice_total != null && settings.customer_invoice_total > 0) {
    return roundMoney(settings.customer_invoice_total);
  }
  if (settings.quote_sale_net != null && settings.quote_sale_net > 0) {
    const vatRate = Number(settings.quote_vat_rate) || 0;
    if (quoteHasVat(vatRate)) {
      return roundMoney(settings.quote_sale_net * (1 + vatRate / 100));
    }
    return roundMoney(settings.quote_sale_net);
  }
  return null;
}

export type CustomerBillableGrandTotal = {
  quoteTotal: number;
  extrasTotal: number;
  grandTotal: number;
};

export function resolveCustomerBillableGrandTotal(input: {
  settings: BillingQuoteSettings;
  logs: WorkReportDailyLog[];
  customerCalculation?: BillableCalculation | null;
  rates?: PartnerBillingRates;
  ratesSource?: BillableRatesSource;
  customerName?: string | null;
}): CustomerBillableGrandTotal | null {
  const quoteTotal = resolveCustomerInvoiceTotal(input.settings);
  if (quoteTotal == null) return null;

  if (input.customerCalculation?.grandTotal != null && input.customerCalculation.grandTotal > 0) {
    const extrasTotal = roundMoney(input.customerCalculation.quoteExtrasTotal ?? 0);
    return {
      quoteTotal: roundMoney(quoteTotal),
      extrasTotal,
      grandTotal: roundMoney(input.customerCalculation.grandTotal),
    };
  }

  const works = extraCustomerWorkFromDailyLogs(input.logs);
  if (works.length === 0) {
    return {
      quoteTotal: roundMoney(quoteTotal),
      extrasTotal: 0,
      grandTotal: roundMoney(quoteTotal),
    };
  }

  const extrasCalc = calculateWorkReportCustomerQuoteExtras({
    works,
    rates: input.rates ?? { hourly_regular: 0, hourly_overtime: 0, hourly_on_call: 0 },
    ratesSource: input.ratesSource ?? 'company_default',
    customerName: input.customerName ?? null,
  });
  const extrasTotal = roundMoney(extrasCalc.grandTotal);
  return {
    quoteTotal: roundMoney(quoteTotal),
    extrasTotal,
    grandTotal: roundMoney(quoteTotal + extrasTotal),
  };
}

export function computePartnerNetMargin(
  settings: BillingQuoteSettings,
  installationCostNet: number,
  options?: {
    logs?: WorkReportDailyLog[];
    partnerRates?: PartnerBillingRates;
    customerRates?: PartnerBillingRates;
    customerExtrasNet?: number | null;
    partnerCalculation?: BillableCalculation | null;
  },
): PartnerMarginComputed | null {
  const quoteSaleNet = settings.quote_sale_net;
  if (quoteSaleNet == null || quoteSaleNet <= 0) return null;

  const quotePurchaseNet = resolveQuotePurchaseTotal(settings);
  const purchaseLines =
    normalizeBillingQuoteSettings(parseBillingQuoteSettings(settings)).purchase_lines ?? [];
  const storedDeviceActualNet = roundMoney(
    purchaseLines
      .filter((line) => line.source === 'device')
      .reduce((sum, line) => sum + (Number(line.actual_purchase_net) || 0), 0),
  );
  // Työraportin laitekirjaus (tyyppi Laite) korvaa tarjouspyynnön laitehinnan / oikaisun.
  const quoteDeviceActualNet = effectiveQuoteDeviceActualNet(purchaseLines, options?.logs);
  const actualPurchaseNet = roundMoney(
    resolveActualPurchaseTotal(settings) - (storedDeviceActualNet - quoteDeviceActualNet),
  );
  // Kun päiväkirjan tarvikkeet on jo yhdistetty hankintariveihin
  // (mergeActualPurchaseFromWorkReportLogs), niitä ei saa vähentää uudelleen
  // katetta syövinä kuluina tai kumppanin piikkiostoina.
  const diarySuppliesInPurchase = purchaseLines.some(
    (line) => line.id === DIARY_SUPPLIES_PURCHASE_LINE_ID,
  );

  const partnerBreakdown = options?.partnerCalculation
    ? breakdownPartnerBillingForQuoteMargin(options.partnerCalculation)
    : null;
  const installationLaborTravelNet = partnerBreakdown
    ? partnerBreakdown.laborTravel
    : roundMoney(Math.max(0, installationCostNet));
  // Laitekirjaukset ovat jo katteen vähennyksissä (päiväkirjan hankinta tai kumppanin lasku):
  // näytetään ne Laite-rivillä, ei tarvikkeissa / töissä ja kuluissa. Summa ei muutu.
  const deviceSplit = deviceEntryCostSplit(options?.logs, options?.partnerCalculation);
  const partnerDeviceNet = partnerBreakdown
    ? roundMoney(Math.min(deviceSplit.partnerNet, Math.max(0, partnerBreakdown.billedMaterials)))
    : 0;
  const diaryGroupActualNet = Number(
    purchaseLines.find((line) => line.id === DIARY_SUPPLIES_PURCHASE_LINE_ID)?.actual_purchase_net ?? 0,
  );
  // Päiväkirjan laitehankinta: hankintariveillä (group:diary-supplies) → siirretään tarvikkeista;
  // muuten (hankintarivejä ei yhdistetty) lisätään Laite-riville — katetta syövistä se on jätetty pois.
  const diaryDeviceInPurchaseNet = diarySuppliesInPurchase
    ? roundMoney(Math.min(deviceSplit.diaryNet, Math.max(0, diaryGroupActualNet)))
    : 0;
  const diaryDeviceNet = diarySuppliesInPurchase ? diaryDeviceInPurchaseNet : deviceSplit.diaryNet;
  const deviceActualNet = roundMoney(quoteDeviceActualNet + diaryDeviceNet + partnerDeviceNet);
  const suppliesActualNet = roundMoney(actualPurchaseNet - quoteDeviceActualNet - diaryDeviceInPurchaseNet);
  const partnerBilledMaterialsNet = roundMoney((partnerBreakdown?.billedMaterials ?? 0) - partnerDeviceNet);
  const effectiveMaterialCostNet = effectiveQuoteMaterialCostNet(
    actualPurchaseNet,
    partnerBilledMaterialsNet,
  );

  const commissionPercent = resolvePartnerCommissionPercent(settings);

  const marginEating = options?.logs?.length
    ? analyzeMarginEatingExpenses(options.logs, {
        excludeDiarySupplies: diarySuppliesInPurchase,
        excludeDeviceDiaryPurchases: true,
      })
    : { total: 0, lines: [] };
  const partnerPiikkiPurchaseNet = options?.logs?.length && !diarySuppliesInPurchase
    ? sumPartnerPurchaseCostNet(options.logs)
    : 0;

  let customerExtrasNet = 0;
  let piikkiMaterialCostNet = 0;
  let extrasMarginNet = 0;

  if (options?.logs?.length && options.partnerRates) {
    const extras = computeQuoteExtrasMarginFromLogs(
      options.logs,
      options.partnerRates,
      options.customerRates,
    );
    customerExtrasNet = extras.customerExtrasNet;
    piikkiMaterialCostNet = extras.piikkiMaterialCostNet;
    extrasMarginNet = extras.extrasMarginNet;
  } else if (options?.customerExtrasNet != null && options.customerExtrasNet > 0) {
    customerExtrasNet = roundMoney(options.customerExtrasNet);
  }

  const partnerCostsNet = roundMoney(installationLaborTravelNet + partnerBilledMaterialsNet);
  // effectiveQuoteMaterialCostNet voi jättää kumppanin laskuttamat tarvikkeet pois,
  // jos ne ovat selvästi sama iso hankinta kuin tarjousrivit → näytä korjausrivinä.
  const materialOverlapNet = roundMoney(
    effectiveMaterialCostNet - actualPurchaseNet - partnerBilledMaterialsNet,
  );

  const rows: PartnerMarginDeductionRow[] = [
    { key: 'labor_expenses', label: 'Työ ja kulut', amount: partnerCostsNet },
    { key: 'device', label: 'Laite', amount: deviceActualNet },
    {
      key: 'supplies',
      label: purchaseLines.length > 0 ? 'Tarvikkeet' : 'Hankinta',
      amount: suppliesActualNet,
    },
    {
      key: 'material_overlap',
      label: 'Kumppanin laskuttamat tarvikkeet sisältyvät hankintaan',
      amount: materialOverlapNet,
    },
    {
      key: 'margin_eating',
      label: 'Katetta syövät kulut (ei lisälaskutuslupaa)',
      amount: marginEating.total,
      details: marginEating.lines.map((line) => ({
        description: line.description,
        total: line.total,
      })),
    },
    { key: 'partner_piikki', label: 'Kumppanin tililtä hankitut', amount: partnerPiikkiPurchaseNet },
    { key: 'piikki_material', label: 'Lisätilauksen hankintakulut', amount: piikkiMaterialCostNet },
  ];
  const deductionRows = rows
    .map((row) => ({ ...row, amount: roundMoney(row.amount) }))
    .filter((row) => Math.abs(row.amount) > 0.005);

  // Kate lasketaan suoraan näkyvistä riveistä → taulukko summautuu aina.
  const grossMarginNet = roundMoney(
    quoteSaleNet
    + customerExtrasNet
    - deductionRows.reduce((sum, row) => sum + row.amount, 0),
  );

  const manualCommissionTotal = options?.logs?.length
    ? sumDailyCommission(options.logs)
    : 0;
  const hasManualCommission = manualCommissionTotal > 0.005;
  const configuredAmount = resolvePartnerCommissionAmount(settings);
  const commissionSource: PartnerMarginComputed['commissionSource'] = hasManualCommission
    ? 'daily_log'
    : configuredAmount != null
      ? 'amount'
      : 'percent';
  const commissionNet =
    commissionSource === 'daily_log'
      ? roundMoney(manualCommissionTotal)
      : commissionSource === 'amount'
        ? roundMoney(configuredAmount ?? 0)
        : roundMoney(Math.max(0, grossMarginNet) * (commissionPercent / 100));
  const netMarginNet = roundMoney(grossMarginNet - commissionNet);

  // Päiväkirja- ja summatilassa näytetään efektiivinen % (provisio / kate ennen provisiota).
  const displayCommissionPercent =
    commissionSource === 'percent'
      ? commissionPercent
      : grossMarginNet > 0.005
        ? roundMoney((commissionNet / grossMarginNet) * 100)
        : commissionSource === 'daily_log'
          ? commissionPercent
          : 0;
  const commissionExceedsGross = commissionNet > Math.max(0, grossMarginNet) + 0.005;

  return {
    quoteSaleNet: roundMoney(quoteSaleNet),
    quotePurchaseNet: roundMoney(quotePurchaseNet),
    actualPurchaseNet: roundMoney(actualPurchaseNet),
    installationLaborTravelNet,
    partnerBilledMaterialsNet,
    effectiveMaterialCostNet,
    marginEatingExpenseNet: marginEating.total,
    partnerPiikkiPurchaseNet,
    installationCostNet: installationLaborTravelNet,
    customerExtrasNet,
    piikkiMaterialCostNet,
    extrasMarginNet,
    deviceActualNet,
    suppliesActualNet,
    deductionRows,
    partnerCostsNet,
    grossMarginNet,
    commissionPercent: displayCommissionPercent,
    configuredCommissionPercent: commissionPercent,
    commissionSource,
    commissionExceedsGross,
    commissionNet,
    netMarginNet,
  };
}

export function reconcileBillingQuotePurchaseLines(
  settings: BillingQuoteSettings,
  quoteData: unknown,
): BillingQuoteSettings {
  const purchaseLines = reconcileQuotePurchaseLines(quoteData, settings.purchase_lines);
  if (purchaseLines.length === 0) return settings;
  return normalizeBillingQuoteSettings({
    ...settings,
    purchase_lines: purchaseLines,
  });
}

export function billingQuoteFromQuoteRow(
  quoteId: string,
  quoteTitle: string,
  data: unknown,
  options?: { fixedCustomerBilling?: boolean; previous?: BillingQuoteSettings | null },
): BillingQuoteSettings {
  const normalized = normalizeQuoteRequestData(data);
  const internal = computeQuoteInternalTotals(normalized, null);
  const totals = computeQuoteTotals(normalized, null);
  const customerTotal = quoteHasVat(internal.vatRate)
    ? totals.grossTotal
    : internal.discountedSellNet;
  const purchaseLines = mergeQuotePurchaseLines(
    extractQuotePurchaseLines(data, null),
    options?.previous?.purchase_lines,
  );

  const previousCommission = options?.previous?.partner_commission_percent;
  const previousCommissionAmount = normalizePartnerCommissionAmount(
    options?.previous?.partner_commission_amount,
  );
  const base: BillingQuoteSettings = {
    quote_request_id: quoteId,
    quote_title: quoteTitle,
    quote_sale_net: roundMoney(internal.discountedSellNet),
    quote_purchase_net: roundMoney(internal.purchaseNet),
    actual_purchase_net: roundMoney(internal.purchaseNet),
    customer_invoice_total: roundMoney(customerTotal),
    customer_mode:
      options?.fixedCustomerBilling === false
        ? 'daily_log'
        : options?.previous?.customer_mode === 'daily_log'
          ? 'quote_fixed'
          : options?.previous?.customer_mode === 'quote_plus_extras'
            ? 'quote_fixed'
            : (options?.previous?.customer_mode ?? 'quote_fixed'),
    quote_vat_rate: roundMoney(internal.vatRate),
    purchase_lines: purchaseLines.length > 0 ? purchaseLines : undefined,
    notes: options?.previous?.notes ?? null,
    partner_commission_percent:
      previousCommission != null && Number.isFinite(Number(previousCommission))
        ? normalizePartnerCommissionPercent(previousCommission)
        : DEFAULT_PARTNER_COMMISSION_PERCENT,
    partner_commission_amount: previousCommissionAmount,
  };
  return normalizeBillingQuoteSettings(base);
}

export async function loadBillingQuoteOptions(
  supabase: SupabaseClient,
  customerId: string | null | undefined,
  ownerCompanyId: string | null | undefined,
): Promise<BillingQuoteOption[]> {
  if (!customerId) return [];

  let query = supabase
    .from('quote_requests')
    .select('id, title, status, updated_at, data, owner_company_id')
    .eq('customer_id', customerId)
    .order('updated_at', { ascending: false })
    .limit(40);

  if (ownerCompanyId) {
    query = query.eq('owner_company_id', ownerCompanyId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return ((data ?? []) as Array<{
    id: string;
    title: string;
    status: string;
    updated_at: string;
    data: unknown;
  }>).map((row) => {
    const normalized = normalizeQuoteRequestData(row.data);
    const internal = computeQuoteInternalTotals(normalized, null);
    const totals = computeQuoteTotals(normalized, null);
    const customerTotal = quoteHasVat(internal.vatRate)
      ? totals.grossTotal
      : internal.discountedSellNet;
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      updated_at: row.updated_at,
      quote_sale_net: roundMoney(internal.discountedSellNet),
      quote_purchase_net: roundMoney(internal.purchaseNet),
      customer_invoice_total: roundMoney(customerTotal),
      quote_vat_rate: roundMoney(internal.vatRate),
    };
  });
}

export async function saveBillingQuoteSettings(
  supabase: SupabaseClient,
  workReportId: string,
  settings: BillingQuoteSettings,
): Promise<void> {
  const payload = normalizeBillingQuoteSettings(parseBillingQuoteSettings(settings));
  const { data: updatedRows, error } = await supabase
    .from('work_report_billable')
    .update({ billing_quote: payload })
    .eq('work_report_id', workReportId)
    .select('work_report_id');

  if (error) throw new Error(error.message);
  if ((updatedRows?.length ?? 0) > 0) return;

  const { error: upsertError } = await supabase.from('work_report_billable').upsert({
    work_report_id: workReportId,
    billing_quote: payload,
    partner_total: 0,
    calculation: {},
  });
  if (upsertError) throw new Error(upsertError.message);
}

/**
 * Tallentaa vain provisioasetukset (% tai €) työraportin billing_quote-JSONiin.
 * Muut tarjousasetukset luetaan kannasta, jotta niitä ei ylikirjoiteta.
 * amount != null → summatila; amount == null → prosenttitila.
 */
export async function saveBillingQuoteCommission(
  supabase: SupabaseClient,
  workReportId: string,
  commission: { percent: number | null; amount: number | null },
): Promise<BillingQuoteSettings> {
  const { data, error } = await supabase
    .from('work_report_billable')
    .select('billing_quote')
    .eq('work_report_id', workReportId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const current = parseBillingQuoteSettings(
    (data as { billing_quote?: unknown } | null)?.billing_quote ?? {},
  );
  const next = normalizeBillingQuoteSettings({
    ...current,
    partner_commission_percent: commission.percent,
    partner_commission_amount: commission.amount,
  });
  await saveBillingQuoteSettings(supabase, workReportId, next);
  return next;
}

export type DeviceActualCorrection = {
  /** Laiterivi (source 'device') sellaisena kuin paneeli sen näyttää. */
  line: BillingQuotePurchaseLine;
  /** Oikaistu toteutunut hankinta alv 0 %; null = palauta tarjouspyynnön hinta. */
  actualNet: number | null;
};

/**
 * Laitteen toteutuneen hankinnan oikaisu billing_quote.purchase_lines-riveille.
 * Oikaistu rivi merkitään actual_corrected, jotta päivitys/uudelleenkohdistus ei korvaa sitä.
 * Tarjouspyynnön arvio (quote_purchase_net) ei muutu.
 */
export function applyDeviceActualCorrections(
  settings: BillingQuoteSettings,
  corrections: DeviceActualCorrection[],
): BillingQuoteSettings {
  const lines = [...(settings.purchase_lines ?? [])];
  for (const { line, actualNet } of corrections) {
    if (line.source !== 'device') continue;
    const index = lines.findIndex((row) => row.id === line.id);
    const base = index >= 0 ? lines[index] : { ...line };
    const next: BillingQuotePurchaseLine =
      actualNet == null || !Number.isFinite(actualNet) || actualNet < 0
        ? (() => {
            const { actual_corrected: _drop, corrected_actual_net: _dropNet, ...rest } = base;
            return { ...rest, actual_purchase_net: roundMoney(base.quote_purchase_net) };
          })()
        : {
            ...base,
            actual_purchase_net: roundMoney(actualNet),
            actual_corrected: true,
            corrected_actual_net: roundMoney(actualNet),
          };
    if (index >= 0) lines[index] = next;
    else lines.push(next);
  }
  return normalizeBillingQuoteSettings({ ...settings, purchase_lines: lines });
}

/** Tallentaa laitteen oikaisut; muut tarjousasetukset luetaan kannasta (ei ylikirjoiteta). */
export async function saveBillingQuoteDeviceActuals(
  supabase: SupabaseClient,
  workReportId: string,
  corrections: DeviceActualCorrection[],
  /** Paneelin näyttämät hankintarivit, jos kannassa ei vielä ole rivejä (ettei tarvikearvio katoa). */
  fallbackLines?: BillingQuotePurchaseLine[],
): Promise<BillingQuoteSettings> {
  const { data, error } = await supabase
    .from('work_report_billable')
    .select('billing_quote')
    .eq('work_report_id', workReportId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const current = parseBillingQuoteSettings(
    (data as { billing_quote?: unknown } | null)?.billing_quote ?? {},
  );
  const base =
    (current.purchase_lines?.length ?? 0) === 0 && fallbackLines?.length
      ? normalizeBillingQuoteSettings({ ...current, purchase_lines: fallbackLines })
      : current;
  const next = applyDeviceActualCorrections(base, corrections);
  await saveBillingQuoteSettings(supabase, workReportId, next);
  return next;
}

/** Täydentää billing_quote quote_requests.work_report_id -linkistä, jos rivi puuttuu. */
export async function hydrateBillingQuoteFromLinkedQuoteRequest(
  supabase: SupabaseClient,
  workReportId: string,
  current: BillingQuoteSettings | null | undefined,
): Promise<BillingQuoteSettings> {
  const parsed = parseBillingQuoteSettings(current ?? {});
  if (workReportHasLinkedQuoteRequest(parsed)) return parsed;

  const { data, error } = await supabase
    .from('quote_requests')
    .select('id, title, data')
    .eq('work_report_id', workReportId)
    .maybeSingle();

  if (error || !data) return parsed;

  const hydrated = billingQuoteFromQuoteRow(
    data.id,
    data.title,
    data.data,
    { fixedCustomerBilling: true, previous: parsed },
  );
  await saveBillingQuoteSettings(supabase, workReportId, hydrated);
  return hydrated;
}

export function calculateWorkReportCustomerBillableFromQuote(input: {
  settings: BillingQuoteSettings;
  customerName: string | null;
  ratesSource: BillableRatesSource;
}): BillableCalculation | null {
  const total = resolveCustomerInvoiceTotal(input.settings);
  if (total == null || total <= 0) return null;

  const title = input.settings.quote_title?.trim() || 'Tarjous';
  const vatRate = Number(input.settings.quote_vat_rate) || 0;
  const vatLabel = quoteHasVat(vatRate) ? ` (sis. ALV ${vatRate} %)` : ' (alv 0 %)';

  return {
    version: 3,
    billingMode: 'quote_fixed',
    quoteRequestId: input.settings.quote_request_id ?? null,
    quoteTitle: title,
    billToCompanyId: null,
    billToCompanyName: input.customerName,
    ratesUsed: { hourly_regular: 0, hourly_overtime: 0, hourly_on_call: 0 },
    ratesSource: input.ratesSource,
    byUser: [
      {
        userId: 'quote',
        userName: title,
        billHoursEnabled: true,
        billExpensesEnabled: true,
        effectiveBillHoursEnabled: true,
        effectiveBillExpensesEnabled: true,
        hoursQty: 0,
        hoursTotal: 0,
        expensesTotal: 0,
        fixedTotal: total,
        commissionTotal: 0,
        subtotal: total,
        excludedSubtotal: 0,
        lines: [
          {
            logId: 'quote',
            logDate: new Date().toISOString().slice(0, 10),
            kind: 'fixed_price',
            description: `Kiinteä tarjoushinta${vatLabel}`,
            qty: 1,
            unitPrice: total,
            total,
            included: true,
          },
        ],
      },
    ],
    grandTotal: total,
    excludedTotal: 0,
  };
}

export function calculateWorkReportCustomerBillableQuotePlusExtras(input: {
  settings: BillingQuoteSettings;
  logs: WorkReportDailyLog[];
  rates: PartnerBillingRates;
  ratesSource: BillableRatesSource;
  customerName: string | null;
}): BillableCalculation | null {
  const quoteCalc = calculateWorkReportCustomerBillableFromQuote({
    settings: input.settings,
    customerName: input.customerName,
    ratesSource: input.ratesSource,
  });
  if (!quoteCalc) return null;

  const worksFromLogs = extraCustomerWorkFromDailyLogs(input.logs);
  const worksFromQuote = getBillingQuoteExtraCustomerWork(input.settings);
  const works = worksFromLogs.length > 0 ? worksFromLogs : worksFromQuote;

  const extrasCalc = calculateWorkReportCustomerQuoteExtras({
    works,
    rates: input.rates,
    ratesSource: input.ratesSource,
    customerName: input.customerName,
  });

  const quoteExtrasTotal = extrasCalc.grandTotal;
  const mergedByUser = [...quoteCalc.byUser, ...extrasCalc.byUser];

  return {
    ...quoteCalc,
    billingMode: 'quote_plus_extras',
    byUser: mergedByUser,
    quoteExtrasTotal,
    grandTotal: roundMoney(quoteCalc.grandTotal + quoteExtrasTotal),
  };
}

/** Vähennysrivin summa merkkeineen: "− 245,00 €" tai korjausrivinä "+ 10,00 €". */
export function formatPartnerMarginDeductionAmount(
  amount: number,
  formatMoney: (value: number) => string = formatEuro,
): string {
  return amount < 0 ? `+ ${formatMoney(-amount)}` : `− ${formatMoney(amount)}`;
}

function formatPartnerMarginDeductionRowText(row: PartnerMarginDeductionRow): string {
  const detail = row.details?.length
    ? ` (${row.details.map((d) => `${d.description} ${formatEuro(d.total)}`).join(', ')})`
    : '';
  return `${row.label}${detail}: ${formatPartnerMarginDeductionAmount(row.amount)}`;
}

export function formatPartnerMarginLines(
  settings: BillingQuoteSettings,
  installationCostNet: number,
  options?: Parameters<typeof computePartnerNetMargin>[2],
): string[] {
  const computed = computePartnerNetMargin(settings, installationCostNet, options);
  if (!computed) return [];

  const lines = [
    'Kate tarjouksesta',
    `Tarjoushinta (alv 0 %): ${formatEuro(computed.quoteSaleNet)}`,
  ];
  if (computed.customerExtrasNet > 0.005) {
    lines.push(`Lisälaskutus asiakkaalta: + ${formatEuro(computed.customerExtrasNet)}`);
    if (computed.extrasMarginNet > 0.005) {
      lines.push(`Lisien kate: + ${formatEuro(computed.extrasMarginNet)}`);
    }
  }
  for (const row of computed.deductionRows) {
    lines.push(formatPartnerMarginDeductionRowText(row));
  }
  lines.push(
    `Kate ennen provisiota: ${formatEuro(computed.grossMarginNet)}`,
  );
  if (computed.commissionNet > 0.005 || computed.commissionPercent > 0) {
    lines.push(
      `Provisio (${formatCommissionPercent(computed.commissionPercent)} %): − ${formatEuro(computed.commissionNet)}`,
    );
  }
  lines.push(`Puhdas kate (provision jälkeen): ${formatEuro(computed.netMarginNet)}`);
  for (const line of settings.purchase_lines ?? []) {
    if (line.actual_purchase_net !== line.quote_purchase_net) {
      lines.push(
        `${line.label}: tarjous ${formatEuro(line.quote_purchase_net)} → todellinen ${formatEuro(line.actual_purchase_net)}`,
      );
    }
  }
  if (settings.quote_title?.trim()) {
    lines.splice(1, 0, `Tarjous: ${settings.quote_title.trim()}`);
  }
  if (settings.notes?.trim()) {
    lines.push(`Huom: ${settings.notes.trim()}`);
  }
  return lines;
}

export function renderBillingQuotePurchaseLinesHtml(
  lines: BillingQuotePurchaseLine[],
  options?: { escapeHtml?: (value: string) => string },
): string {
  if (lines.length === 0) return '';
  const esc = options?.escapeHtml ?? ((value: string) => value);
  const rows = lines
    .map((line) => {
      const qtyLabel =
        line.quantity != null && line.unit
          ? `<div class="line-sub">${esc(String(line.quantity))} ${esc(line.unit)}</div>`
          : '';
      const changed = line.actual_purchase_net !== line.quote_purchase_net;
      return `<tr${changed ? ' class="changed-row"' : ''}>
        <td>${esc(line.label)}${qtyLabel}</td>
        <td class="num">${formatEuro(line.quote_purchase_net)}</td>
        <td class="num">${formatEuro(line.actual_purchase_net)}</td>
      </tr>`;
    })
    .join('');
  return `<h3 class="billing-subheading">Hankintakorjaukset</h3>
  <table>
    <thead>
      <tr><th>Rivi</th><th class="num">Tarjous hankinta</th><th class="num">Todellinen hankinta</th></tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td><strong>Yhteensä</strong></td>
        <td class="num"><strong>${formatEuro(sumQuotePurchaseLines(lines, 'quote_purchase_net'))}</strong></td>
        <td class="num"><strong>${formatEuro(sumQuotePurchaseLines(lines, 'actual_purchase_net'))}</strong></td>
      </tr>
    </tfoot>
  </table>`;
}
