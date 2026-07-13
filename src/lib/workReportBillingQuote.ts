import type { SupabaseClient } from '@supabase/supabase-js';
import { computeQuoteInternalTotals, computeQuoteTotals } from './quoteRequest/calculations';
import { normalizeQuoteRequestData } from './quoteRequest/defaults';
import type { BillableRatesSource } from './management';
import type { BillableCalculation } from './workReportBilling';
import { formatEuro } from './workReportBilling';

export type CustomerBillingMode = 'daily_log' | 'quote_fixed';

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
  quote_vat_rate?: number | null;
  notes?: string | null;
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

export type PartnerMarginComputed = {
  quoteSaleNet: number;
  quotePurchaseNet: number;
  actualPurchaseNet: number;
  installationCostNet: number;
  netMarginNet: number;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function quoteHasVat(vatRate: number | null | undefined): boolean {
  return Number(vatRate) > 0;
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
  const mode = record.customer_mode === 'quote_fixed' ? 'quote_fixed' : 'daily_log';
  return {
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
    quote_vat_rate: num('quote_vat_rate'),
    notes: typeof record.notes === 'string' ? record.notes : null,
  };
}

export function billingQuoteHasData(settings: BillingQuoteSettings): boolean {
  return (
    !!settings.quote_request_id
    || settings.quote_sale_net != null
    || settings.customer_invoice_total != null
    || !!settings.notes?.trim()
  );
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

export function computePartnerNetMargin(
  settings: BillingQuoteSettings,
  installationCostNet: number,
): PartnerMarginComputed | null {
  const quoteSaleNet = settings.quote_sale_net;
  if (quoteSaleNet == null || quoteSaleNet <= 0) return null;

  const actualPurchaseNet = settings.actual_purchase_net ?? settings.quote_purchase_net ?? 0;
  const quotePurchaseNet = settings.quote_purchase_net ?? actualPurchaseNet;
  const installation = roundMoney(Math.max(0, installationCostNet));

  return {
    quoteSaleNet: roundMoney(quoteSaleNet),
    quotePurchaseNet: roundMoney(quotePurchaseNet),
    actualPurchaseNet: roundMoney(actualPurchaseNet),
    installationCostNet: installation,
    netMarginNet: roundMoney(quoteSaleNet - installation - actualPurchaseNet),
  };
}

export function billingQuoteFromQuoteRow(
  quoteId: string,
  quoteTitle: string,
  data: unknown,
  options?: { fixedCustomerBilling?: boolean },
): BillingQuoteSettings {
  const normalized = normalizeQuoteRequestData(data);
  const internal = computeQuoteInternalTotals(normalized, null);
  const totals = computeQuoteTotals(normalized, null);
  const customerTotal = quoteHasVat(internal.vatRate)
    ? totals.grossTotal
    : internal.discountedSellNet;

  return {
    quote_request_id: quoteId,
    quote_title: quoteTitle,
    quote_sale_net: roundMoney(internal.discountedSellNet),
    quote_purchase_net: roundMoney(internal.purchaseNet),
    actual_purchase_net: roundMoney(internal.purchaseNet),
    customer_invoice_total: roundMoney(customerTotal),
    customer_mode: options?.fixedCustomerBilling === false ? 'daily_log' : 'quote_fixed',
    quote_vat_rate: roundMoney(internal.vatRate),
  };
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
  const payload = parseBillingQuoteSettings(settings);
  const { error } = await supabase
    .from('work_report_billable')
    .update({ billing_quote: payload })
    .eq('work_report_id', workReportId);

  if (error) {
    const { error: upsertError } = await supabase.from('work_report_billable').upsert({
      work_report_id: workReportId,
      billing_quote: payload,
      partner_total: 0,
      calculation: {},
    });
    if (upsertError) throw new Error(upsertError.message);
  }
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

export function formatPartnerMarginLines(
  settings: BillingQuoteSettings,
  installationCostNet: number,
): string[] {
  const computed = computePartnerNetMargin(settings, installationCostNet);
  if (!computed) return [];

  const lines = [
    'Kate tarjouksesta',
    `Tarjoushinta (alv 0 %): ${formatEuro(computed.quoteSaleNet)}`,
    `Asennuskulut (työ + ajot + kulut): ${formatEuro(computed.installationCostNet)}`,
    `Tarjouksen hankinta (alv 0 %): ${formatEuro(computed.quotePurchaseNet)}`,
    `Todellinen hankinta (alv 0 %): ${formatEuro(computed.actualPurchaseNet)}`,
    `Puhdas kate: ${formatEuro(computed.netMarginNet)}`,
  ];
  if (settings.quote_title?.trim()) {
    lines.splice(1, 0, `Tarjous: ${settings.quote_title.trim()}`);
  }
  if (settings.notes?.trim()) {
    lines.push(`Huom: ${settings.notes.trim()}`);
  }
  return lines;
}
