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
  const lines = collectMaterialLines(normalized);

  if (internal.devicePurchaseNet > 0.005 || internal.deviceSellNet > 0.005) {
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
    } else if (Number(normalized.devicePurchaseOverrideNet) > 0.005) {
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
    lines.every((line) => line.source !== 'material')
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
    materialTotal > 0.005
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
