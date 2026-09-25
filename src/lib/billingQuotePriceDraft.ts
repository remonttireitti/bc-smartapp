import type { BillingQuoteSettings } from './workReportBillingQuote';

/**
 * Tarjous ja kate -paneelin hintakentät, kun tarjousta ei ole kohdistettu:
 * Tarjoushinta (alv 0 %) → billing_quote.quote_sale_net ja
 * asiakashinta → billing_quote.customer_invoice_total (samat kentät, joista laskenta lukee).
 */
export type BillingQuotePriceDraft = { saleNet: string; customerTotal: string };

export type BillingQuotePrices = {
  quote_sale_net: number;
  customer_invoice_total: number | null;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseMoney(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, '').replace(/€/g, '').replace(',', '.');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function formatMoneyInput(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '';
  return String(roundMoney(Number(value))).replace('.', ',');
}

export function billingQuotePriceDraftFromSettings(
  settings: BillingQuoteSettings | null | undefined,
): BillingQuotePriceDraft {
  return {
    saleNet: formatMoneyInput(settings?.quote_sale_net),
    customerTotal: formatMoneyInput(settings?.customer_invoice_total),
  };
}

/**
 * Luonnos → tallennettavat arvot. Ilman erillistä asiakashintaa asiakkaalta laskutetaan sama
 * kiinteä summa kuin tarjoushinta (kuten paneeli aina näytti).
 */
export function billingQuotePricesFromDraft(
  draft: BillingQuotePriceDraft,
  options: { separateCustomerTotal: boolean },
): { value: BillingQuotePrices } | { error: string } {
  const sale = parseMoney(draft.saleNet);
  if (!draft.saleNet.trim()) return { error: 'Anna tarjoushinta.' };
  if (sale == null || sale < 0) return { error: 'Tarkista tarjoushinta.' };
  if (!options.separateCustomerTotal) {
    return { value: { quote_sale_net: roundMoney(sale), customer_invoice_total: roundMoney(sale) } };
  }
  if (!draft.customerTotal.trim()) {
    return { value: { quote_sale_net: roundMoney(sale), customer_invoice_total: null } };
  }
  const customer = parseMoney(draft.customerTotal);
  if (customer == null || customer < 0) return { error: 'Tarkista asiakkaalta laskutettava summa.' };
  return { value: { quote_sale_net: roundMoney(sale), customer_invoice_total: roundMoney(customer) } };
}

function sameMoney(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null || b == null) return a == null && b == null;
  return Math.abs(Number(a) - Number(b)) < 0.005;
}

export function billingQuotePricesChanged(
  value: BillingQuotePrices,
  settings: BillingQuoteSettings | null | undefined,
): boolean {
  return (
    !sameMoney(value.quote_sale_net, settings?.quote_sale_net)
    || !sameMoney(value.customer_invoice_total, settings?.customer_invoice_total)
  );
}

/** Päivittää vain hintakentät; muut billing_quote-asetukset säilyvät. */
export function applyBillingQuotePrices(
  current: BillingQuoteSettings,
  value: BillingQuotePrices,
): BillingQuoteSettings {
  return {
    ...current,
    quote_sale_net: value.quote_sale_net,
    customer_invoice_total: value.customer_invoice_total,
  };
}
