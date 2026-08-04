import type { QuoteRequestData } from './types';

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeManualDeviceSellNet(
  purchase: number | null | undefined,
  marginPercent: number | null | undefined,
): number {
  const purchaseNet = Number(purchase) || 0;
  if (purchaseNet <= 0) return 0;
  const margin = Number(marginPercent) || 0;
  return roundMoney(purchaseNet * (1 + margin / 100));
}

export function resolveNonPumpDeviceSellNet(data: QuoteRequestData): number {
  if (data.deviceSaleOverrideNet != null) {
    return Number(data.deviceSaleOverrideNet) || 0;
  }
  return computeManualDeviceSellNet(data.devicePurchaseOverrideNet, data.deviceMarginPercent);
}

export function manualDevicePrintLabel(data: QuoteRequestData): string {
  return [data.deviceBrand, data.deviceModel].map((v) => String(v ?? '').trim()).filter(Boolean).join(' ').trim()
    || 'Laite / urakka';
}

export function syncManualDeviceSalePatch(
  data: QuoteRequestData,
  patch: Partial<Pick<QuoteRequestData, 'devicePurchaseOverrideNet' | 'deviceMarginPercent' | 'deviceSaleOverrideNet'>>,
): Partial<QuoteRequestData> {
  const next = { ...data, ...patch };
  if ('devicePurchaseOverrideNet' in patch || 'deviceMarginPercent' in patch) {
    const purchase = next.devicePurchaseOverrideNet;
    if (purchase != null && Number(purchase) >= 0) {
      return {
        ...patch,
        deviceSaleOverrideNet: computeManualDeviceSellNet(purchase, next.deviceMarginPercent),
      };
    }
  }
  return patch;
}
