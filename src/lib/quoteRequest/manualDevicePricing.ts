import type { QuoteRequestData } from './types';
import { computeInstallationSupplyMarginPercent } from './installationSupplies';

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

export function computeManualDeviceMarginPercent(
  purchase: number | null | undefined,
  sell: number | null | undefined,
): number {
  const purchaseNet = Number(purchase) || 0;
  const sellNet = Number(sell) || 0;
  if (purchaseNet <= 0 || sellNet <= 0) return 0;
  return computeInstallationSupplyMarginPercent(purchaseNet, sellNet);
}

export function syncManualDeviceSalePatch(
  data: QuoteRequestData,
  patch: Partial<Pick<QuoteRequestData, 'devicePurchaseOverrideNet' | 'deviceMarginPercent' | 'deviceSaleOverrideNet'>>,
): Partial<QuoteRequestData> {
  const next = { ...data, ...patch };

  if (
    'deviceSaleOverrideNet' in patch
    && !('devicePurchaseOverrideNet' in patch)
    && !('deviceMarginPercent' in patch)
  ) {
    const purchase = next.devicePurchaseOverrideNet;
    const sell = next.deviceSaleOverrideNet;
    if (purchase != null && Number(purchase) > 0 && sell != null && Number(sell) > 0) {
      return {
        ...patch,
        deviceMarginPercent: computeManualDeviceMarginPercent(purchase, sell),
      };
    }
    return patch;
  }

  if ('deviceMarginPercent' in patch && !('devicePurchaseOverrideNet' in patch)) {
    const purchase = next.devicePurchaseOverrideNet;
    if (purchase != null && Number(purchase) >= 0) {
      return {
        ...patch,
        deviceSaleOverrideNet: computeManualDeviceSellNet(purchase, next.deviceMarginPercent),
      };
    }
    return patch;
  }

  if ('devicePurchaseOverrideNet' in patch) {
    const purchase = next.devicePurchaseOverrideNet;
    if (purchase == null || Number(purchase) < 0) return patch;
    const previousSell = resolveNonPumpDeviceSellNet(data);
    if (previousSell > 0.005) {
      const lockedSell = data.deviceSaleOverrideNet ?? previousSell;
      return {
        ...patch,
        deviceSaleOverrideNet: lockedSell,
        deviceMarginPercent: computeManualDeviceMarginPercent(purchase, lockedSell),
      };
    }
    return {
      ...patch,
      deviceSaleOverrideNet: computeManualDeviceSellNet(purchase, next.deviceMarginPercent),
    };
  }

  return patch;
}
