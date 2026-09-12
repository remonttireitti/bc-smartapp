import type { BrandDeliveryFeeByCategoryMap } from '../data/devicePricingShared';
import {
  formatDeviceLabel,
  resolveQuoteMainDeviceForTotals,
} from './quoteRequest/deviceCatalog';
import {
  computeQuoteInternalTotals,
  computePumpSizingNeedKw,
  resolveIilpLaborPricingMode,
} from './quoteRequest/calculations';
import { isPumpQuoteType } from './quoteRequest/constants';
import {
  installationSuppliesInternalCostsNet,
  isOfferedDeviceRow,
} from './quoteRequest/installationSupplies';
import { resolveNonPumpDeviceSellNet } from './quoteRequest/manualDevicePricing';
import { normalizeQuoteRequestData } from './quoteRequest/defaults';
import type { QuoteMaterial, QuoteRequestData } from './quoteRequest/types';

export type BillingQuotePurchaseLine = {
  id: string;
  label: string;
  quantity?: number | null;
  unit?: string | null;
  /** Tarjouksen hankinta (alv 0 %) — snapshot, ei muutu. */
  quote_purchase_net: number;
  /** Todellinen hankinta (alv 0 %) — korjattavissa raportilla. */
  actual_purchase_net: number;
  source?: 'material' | 'device' | 'group';
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function parsePurchaseLine(raw: unknown): BillingQuotePurchaseLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  const label = typeof record.label === 'string' ? record.label.trim() : '';
  if (!id || !label) return null;
  const quotePurchase = Number(record.quote_purchase_net);
  const actualPurchase = Number(record.actual_purchase_net ?? record.quote_purchase_net);
  if (!Number.isFinite(quotePurchase)) return null;
  return {
    id,
    label,
    quantity: record.quantity == null ? null : Number(record.quantity) || 0,
    unit: typeof record.unit === 'string' ? record.unit : null,
    quote_purchase_net: roundMoney(quotePurchase),
    actual_purchase_net: roundMoney(Number.isFinite(actualPurchase) ? actualPurchase : quotePurchase),
    source:
      record.source === 'material' || record.source === 'device' || record.source === 'group'
        ? record.source
        : undefined,
  };
}

export function parseBillingQuotePurchaseLines(raw: unknown): BillingQuotePurchaseLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parsePurchaseLine).filter((line): line is BillingQuotePurchaseLine => line != null);
}

function materialPurchaseLine(
  mat: QuoteMaterial,
  prefix = '',
): BillingQuotePurchaseLine | null {
  const name = mat.name.trim();
  if (!name) return null;
  const qty = Number(mat.quantity) || 0;
  const purchase = roundMoney(qty * (Number(mat.purchasePrice) || 0));
  if (purchase <= 0.005) return null;
  return {
    id: `material:${prefix}${mat.id}`,
    label: prefix ? `${prefix}${name}` : name,
    quantity: qty,
    unit: 'kpl',
    quote_purchase_net: purchase,
    actual_purchase_net: purchase,
    source: 'material',
  };
}

function collectInstallationSupplyLines(data: QuoteRequestData): BillingQuotePurchaseLine[] {
  const lines: BillingQuotePurchaseLine[] = [];
  for (const mat of data.installationSupplies ?? []) {
    const name = mat.name.trim();
    if (!name) continue;
    const qty = Number(mat.quantity) || 0;
    const purchase = roundMoney(qty * (Number(mat.purchasePrice) || 0));
    if (purchase <= 0.005) continue;
    const isDevice = isOfferedDeviceRow(mat);
    lines.push({
      id: isDevice ? `device:${mat.id}` : `material:${mat.id}`,
      label: name,
      quantity: qty,
      unit: 'kpl',
      quote_purchase_net: purchase,
      actual_purchase_net: purchase,
      source: isDevice ? 'device' : 'material',
    });
  }

  const internalCosts = installationSuppliesInternalCostsNet(data);
  if (internalCosts > 0.005) {
    lines.push({
      id: 'group:installation-internal',
      label: 'Asennustyö (sisäinen hankinta)',
      quantity: 1,
      unit: 'kpl',
      quote_purchase_net: roundMoney(internalCosts),
      actual_purchase_net: roundMoney(internalCosts),
      source: 'group',
    });
  }

  return lines;
}

function collectMaterialLines(data: QuoteRequestData): BillingQuotePurchaseLine[] {
  const lines: BillingQuotePurchaseLine[] = [];
  const nestedCount = data.workItems.reduce(
    (sum, item) => sum + (item.materials ?? []).filter((row) => row.name.trim()).length,
    0,
  );

  if (nestedCount > 0) {
    for (const item of data.workItems) {
      const prefix = item.description.trim() ? `${item.description.trim()} · ` : '';
      for (const mat of item.materials ?? []) {
        const line = materialPurchaseLine(mat, prefix);
        if (line) lines.push(line);
      }
    }
    return lines;
  }

  for (const mat of data.materials) {
    const line = materialPurchaseLine(mat);
    if (line) lines.push(line);
  }
  return lines;
}

export function extractQuotePurchaseLines(
  data: unknown,
  feeMap?: BrandDeliveryFeeByCategoryMap | null,
): BillingQuotePurchaseLine[] {
  const normalized = normalizeQuoteRequestData(data);
  const internal = computeQuoteInternalTotals(normalized, feeMap);
  const installationLines = collectInstallationSupplyLines(normalized);
  const lines = installationLines.length > 0
    ? installationLines
    : collectMaterialLines(normalized);
  const hasDeviceRowsFromSupplies = installationLines.some((line) => line.source === 'device');

  if (
    !hasDeviceRowsFromSupplies
    && (internal.devicePurchaseNet > 0.005 || internal.deviceSellNet > 0.005)
  ) {
    if (isPumpQuoteType(normalized.type)) {
      const mainDevice = resolveQuoteMainDeviceForTotals(
        normalized,
        computePumpSizingNeedKw(normalized),
      );
      lines.push({
        id: 'device:main',
        label: mainDevice ? `Laite: ${formatDeviceLabel(mainDevice)}` : 'Laite',
        quantity: 1,
        unit: 'kpl',
        quote_purchase_net: roundMoney(internal.devicePurchaseNet),
        actual_purchase_net: roundMoney(internal.devicePurchaseNet),
        source: 'device',
      });
    } else if (
      !isPumpQuoteType(normalized.type)
      && (Number(normalized.devicePurchaseOverrideNet) > 0.005 || resolveNonPumpDeviceSellNet(normalized) > 0.005)
    ) {
      lines.push({
        id: 'device:override',
        label: 'Laite / urakka',
        quantity: 1,
        unit: 'kpl',
        quote_purchase_net: roundMoney(Number(normalized.devicePurchaseOverrideNet) || 0),
        actual_purchase_net: roundMoney(Number(normalized.devicePurchaseOverrideNet) || 0),
        source: 'device',
      });
    }
  }

  const materialTotal = roundMoney(
    lines.filter((line) => line.source === 'material').reduce((sum, line) => sum + line.quote_purchase_net, 0),
  );
  if (
    installationLines.length === 0
    && lines.every((line) => line.source !== 'material')
    && internal.materialsPurchaseNet > 0.005
  ) {
    const isUrakka =
      normalized.type === 'ilma-ilma' && resolveIilpLaborPricingMode(normalized) === 'urakka';
    lines.push({
      id: 'group:materials',
      label: isUrakka ? 'Asennustarvikkeet' : 'Tarvikkeet',
      quantity: 1,
      unit: 'kpl',
      quote_purchase_net: roundMoney(internal.materialsPurchaseNet),
      actual_purchase_net: roundMoney(internal.materialsPurchaseNet),
      source: 'group',
    });
  } else if (
    installationLines.length === 0
    && materialTotal > 0.005
    && Math.abs(materialTotal - internal.materialsPurchaseNet) > 0.05
    && internal.materialsPurchaseNet > materialTotal
  ) {
    lines.push({
      id: 'group:materials-adjustment',
      label: 'Muut tarvikkeet',
      quantity: 1,
      unit: 'kpl',
      quote_purchase_net: roundMoney(internal.materialsPurchaseNet - materialTotal),
      actual_purchase_net: roundMoney(internal.materialsPurchaseNet - materialTotal),
      source: 'group',
    });
  }

  return lines.sort((a, b) => a.label.localeCompare(b.label, 'fi'));
}

/** Päivitä hankintarivit tarjouspyynnön rakenteella, säilytä toteutuneet korjaukset. */
export function reconcileQuotePurchaseLines(
  quoteData: unknown,
  saved: BillingQuotePurchaseLine[] | undefined,
  feeMap?: BrandDeliveryFeeByCategoryMap | null,
): BillingQuotePurchaseLine[] {
  const fromQuote = extractQuotePurchaseLines(quoteData, feeMap);
  if (fromQuote.length === 0) return saved ?? [];
  return mergeQuotePurchaseLines(fromQuote, saved);
}

export function mergeQuotePurchaseLines(
  fromQuote: BillingQuotePurchaseLine[],
  saved: BillingQuotePurchaseLine[] | undefined,
): BillingQuotePurchaseLine[] {
  if (!saved?.length) return fromQuote;
  const savedById = new Map(saved.map((line) => [line.id, line]));
  const merged = fromQuote.map((line) => {
    const prev = savedById.get(line.id);
    if (!prev) return line;
    return {
      ...line,
      actual_purchase_net: prev.actual_purchase_net,
    };
  });
  for (const line of saved) {
    if (!fromQuote.some((quoteLine) => quoteLine.id === line.id)) {
      merged.push(line);
    }
  }
  return merged;
}

export function sumQuotePurchaseLines(
  lines: BillingQuotePurchaseLine[],
  field: 'quote_purchase_net' | 'actual_purchase_net',
): number {
  return roundMoney(lines.reduce((sum, line) => sum + Number(line[field] ?? 0), 0));
}
