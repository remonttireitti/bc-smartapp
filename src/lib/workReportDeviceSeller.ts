/**
 * Laitemyyjä-laskutusketju kiinteällä tarjouksella (billing_quote.device_sale_net asetettu):
 *
 * - Asiakas maksaa tilaajalle (raportin omistaja): tarjoushinta + hyväksytyt lisät.
 * - Tilaaja myy vain laitteen: sille jää laitekate (myyntihinta − hankinta) + lisätyöt
 *   (lisien asiakastulo − kumppanin lisäkulut).
 * - Urakoitsija laskuttaa tilaajalta: tarjoushinta − laitteen myyntihinta (+ kumppanin lisäkulut).
 * - Asentaja (raportin laatija) laskuttaa urakoitsijalta: työt + kulut (+ laskutetut lisätunnit).
 * - Urakoitsijalle jää: laskutus − asentaja − tarvikkeet − muut kulut.
 *
 * Ilman erillistä urakoitsijaa raportin laatija on urakoitsija (ei asentajariviä).
 * Summat: asiakas = tilaajalle jää + laitteen hankinta + urakoitsijan laskutus.
 */
import { normalizeQuoteRequestData } from './quoteRequest/defaults';
import { computeQuoteInternalTotals } from './quoteRequest/calculations';
import type { BillingQuoteSettings, PartnerMarginComputed } from './workReportBillingQuote';

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100 || 0;
}

/** Tarjouspyynnön laitteen myyntihinta alv 0 % (alennus huomioiden); null jos ei laitetta. */
export function quoteDeviceSaleNet(quoteData: unknown): number | null {
  if (!quoteData || typeof quoteData !== 'object') return null;
  try {
    const totals = computeQuoteInternalTotals(normalizeQuoteRequestData(quoteData), null);
    const discount = Math.max(0, Math.min(100, Number(totals.discountPercent) || 0));
    const net = roundMoney((Number(totals.deviceSellNet) || 0) * (1 - discount / 100));
    return net > 0.005 ? net : null;
  } catch {
    return null;
  }
}

/** Laitemyyjä-ketju käytössä: laitteen myyntihinta asetettu kiinteälle tarjoukselle. */
export function resolveDeviceSellerSaleNet(
  settings: BillingQuoteSettings | null | undefined,
): number | null {
  if (!settings) return null;
  const mode = settings.customer_mode;
  if (mode !== 'quote_fixed' && mode !== 'quote_plus_extras') return null;
  const sale = Number(settings.quote_sale_net) || 0;
  const device = Number(settings.device_sale_net) || 0;
  if (!(sale > 0) || !(device > 0)) return null;
  return roundMoney(device);
}

function deductionAmount(margin: PartnerMarginComputed, key: string): number {
  return roundMoney(
    margin.deductionRows.filter((row) => row.key === key).reduce((sum, row) => sum + row.amount, 0),
  );
}

/** Hyväksytyn lisälaskutuksen kumppanikulut (lisätunnit + kumppanin hankinnat). */
export function deviceSellerExtrasCostNet(margin: PartnerMarginComputed): number {
  return roundMoney(deductionAmount(margin, 'extras_partner') + deductionAmount(margin, 'piikki_material'));
}

/** Urakoitsijan lasku tilaajalle: tarjoushinta − laite + kumppanin lisäkulut. */
export function deviceSellerContractorInvoiceNet(
  margin: PartnerMarginComputed,
  deviceSaleNet: number,
): number {
  return roundMoney(margin.quoteSaleNet - deviceSaleNet + deviceSellerExtrasCostNet(margin));
}

export type DeviceSellerCosts = {
  labor: { estimate: number | null; actual: number };
  expenses: { estimate: number | null; actual: number };
  supplies: { estimate: number | null; actual: number };
  device: { estimate: number | null; actual: number };
  other: { estimate: number | null; actual: number };
};

export type DeviceSellerAmount = { estimate: number | null; actual: number };

export type DeviceSellerChain = {
  customer: DeviceSellerAmount;
  ownerKeeps: DeviceSellerAmount;
  contractorInvoice: DeviceSellerAmount;
  installerInvoice: DeviceSellerAmount;
  contractorKeeps: DeviceSellerAmount;
};

export function computeDeviceSellerChain(input: {
  margin: PartnerMarginComputed;
  deviceSaleNet: number;
  costs: DeviceSellerCosts;
}): DeviceSellerChain {
  const { margin, deviceSaleNet, costs } = input;
  const quoteSale = margin.quoteSaleNet;
  const extrasCost = deviceSellerExtrasCostNet(margin);
  const extrasPartner = deductionAmount(margin, 'extras_partner');
  const hasEstimate = [costs.labor, costs.expenses, costs.supplies, costs.device, costs.other].every(
    (row) => row.estimate != null,
  );
  const est = (fn: () => number) => (hasEstimate ? roundMoney(fn()) : null);
  const e = (row: { estimate: number | null }) => row.estimate ?? 0;

  const contractorInvoiceActual = roundMoney(quoteSale - deviceSaleNet + extrasCost);
  const installerActual = roundMoney(costs.labor.actual + costs.expenses.actual + extrasPartner);
  return {
    customer: {
      estimate: est(() => quoteSale),
      actual: roundMoney(quoteSale + margin.customerExtrasNet),
    },
    ownerKeeps: {
      estimate: est(() => deviceSaleNet - e(costs.device)),
      actual: roundMoney(deviceSaleNet - costs.device.actual + margin.customerExtrasNet - extrasCost),
    },
    contractorInvoice: {
      estimate: est(() => quoteSale - deviceSaleNet),
      actual: contractorInvoiceActual,
    },
    installerInvoice: {
      estimate: est(() => e(costs.labor) + e(costs.expenses)),
      actual: installerActual,
    },
    contractorKeeps: {
      estimate: est(
        () => quoteSale - deviceSaleNet - e(costs.labor) - e(costs.expenses) - e(costs.supplies) - e(costs.other),
      ),
      actual: roundMoney(
        contractorInvoiceActual
        - installerActual
        - costs.supplies.actual
        - costs.other.actual
        - (extrasCost - extrasPartner),
      ),
    },
  };
}

const ABBREVIATION_FRONT = /\b(oy|oyj|ky|ay|tmi)$/i;
const ABBREVIATION_BACK = /\b(ab|abp)$/i;

/** "Termatek Oy" → "Termatek Oy:ltä"; muut nimet ilman taivutusta. */
export function companyAblative(name: string): string | null {
  const trimmed = name.trim();
  if (ABBREVIATION_FRONT.test(trimmed)) return `${trimmed}:ltä`;
  if (ABBREVIATION_BACK.test(trimmed)) return `${trimmed}:lta`;
  return null;
}

/** "Termatek Oy" → "Termatek Oy:lle"; muut nimet ilman taivutusta. */
export function companyAllative(name: string): string | null {
  const trimmed = name.trim();
  if (ABBREVIATION_FRONT.test(trimmed) || ABBREVIATION_BACK.test(trimmed)) return `${trimmed}:lle`;
  return null;
}

export function deviceSellerLabels(names: {
  ownerName: string;
  contractorName?: string | null;
  installerName: string;
}): Record<keyof DeviceSellerChain, string> {
  const owner = names.ownerName.trim() || 'Tilaaja';
  const contractor = names.contractorName?.trim() || names.installerName.trim() || 'Urakoitsija';
  const installer = names.installerName.trim() || 'Asentaja';
  const bills = (biller: string, payer: string) => {
    const ablative = companyAblative(payer);
    return ablative ? `${biller} laskuttaa ${ablative}` : `${biller} → ${payer}`;
  };
  const keeps = (name: string) => {
    const allative = companyAllative(name);
    return allative ? `${allative} jää` : `${name}: jää`;
  };
  const pays = (name: string) => {
    const allative = companyAllative(name);
    return allative ? `Asiakas maksaa ${allative}` : `Asiakas maksaa → ${name}`;
  };
  const hasContractor = !!names.contractorName?.trim();
  return {
    customer: pays(owner),
    ownerKeeps: keeps(owner),
    contractorInvoice: bills(contractor, owner),
    installerInvoice: hasContractor ? bills(installer, contractor) : 'Työt ja kulut',
    contractorKeeps: keeps(contractor),
  };
}
