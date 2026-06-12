import type { CompanySettings } from '../management';
import {
  computePurchaseNetAlv0,
  getDefaultDiscountFromListPercent,
  parseBrandDeliveryFeesFromMeta,
  round2,
  type BrandDeliveryFeeByCategoryMap,
} from '../../data/devicePricingShared';
import {
  ALL_PUMP_DEVICES,
  ilmaLampopumput,
  type HeatPumpDevice,
  vesiIlmaLampopumput,
} from '../../data/pumpDeviceCatalog';
import type { QuoteRequestData, QuoteType } from './types';
import { filterCompatibleDevicesForQuote } from './vilpCompatibility';
import { listCustomRegistryDevices, resolveRegistryDevice } from './deviceRegistryState';

export type DeviceOptionKey = 'A' | 'B' | 'C';

export function deliveryFeesFromCompanySettings(
  settings?: CompanySettings | null,
): BrandDeliveryFeeByCategoryMap {
  const reg = settings?.device_registry;
  return parseBrandDeliveryFeesFromMeta(
    reg
      ? {
          brandDeliveryFeesByCategory: reg.brand_delivery_fees_by_category,
          brandDeliveryFeePerUnit: reg.brand_delivery_fee_per_unit,
        }
      : null,
  );
}

export function findDeviceById(id?: string | null): HeatPumpDevice | null {
  if (!id) return null;
  return resolveRegistryDevice(id);
}

function normalizeModelHint(hint: string): string {
  return hint.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Match legacy Firestore deviceModel / deviceName text to catalog entries. */
export function findDeviceByModelHint(
  modelHint: string,
  type: QuoteType,
): HeatPumpDevice | null {
  const hint = normalizeModelHint(modelHint);
  if (!hint) return null;

  const pool =
    type === 'ilma-ilma'
      ? ilmaLampopumput
      : type === 'vesi-ilma'
        ? vesiIlmaLampopumput
        : ALL_PUMP_DEVICES;

  const byId = pool.find((device) => device.id.toLowerCase() === hint);
  if (byId) return byId;

  const exact = pool.find((device) => normalizeModelHint(device.model) === hint);
  if (exact) return exact;

  const contains = pool.filter((device) => {
    const model = normalizeModelHint(device.model);
    return hint.includes(model) || model.includes(hint);
  });
  if (contains.length === 1) return contains[0];

  const primary = hint.split('+')[0]?.trim() ?? hint;
  const primaryMatches = pool.filter((device) => {
    const model = normalizeModelHint(device.model);
    const devicePrimary = model.split('+')[0]?.trim() ?? model;
    return devicePrimary === primary || primary.includes(devicePrimary) || devicePrimary.includes(primary);
  });
  if (primaryMatches.length === 1) return primaryMatches[0];

  const tokens = hint.split(/\s+|\+/).map((token) => token.trim()).filter((token) => token.length >= 4);
  const tokenMatches = pool.filter((device) => {
    const model = normalizeModelHint(device.model);
    return tokens.some((token) => model.includes(token));
  });
  if (tokenMatches.length === 1) return tokenMatches[0];

  if (tokenMatches.length > 1) {
    const scored = tokenMatches
      .map((device) => {
        const model = normalizeModelHint(device.model);
        const score = tokens.reduce((sum, token) => (model.includes(token) ? sum + token.length : sum), 0);
        return { device, score };
      })
      .sort((a, b) => b.score - a.score);
    if (scored[0] && scored[0].score > 0 && scored[0].score !== scored[1]?.score) {
      return scored[0].device;
    }
  }

  return null;
}

function resolveLegacyDeviceId(
  currentId: string,
  modelHint: string | undefined,
  type: QuoteType,
): string {
  if (currentId && findDeviceById(currentId)) return currentId;
  if (typeof modelHint === 'string' && modelHint.trim()) {
    const match = findDeviceByModelHint(modelHint, type);
    if (match) return match.id;
  }
  return currentId && findDeviceById(currentId) ? currentId : '';
}

export function resolveLegacyDeviceIds(
  record: Record<string, unknown>,
  type: QuoteType,
): { selectedDeviceId: string; altDevice1Id: string; altDevice2Id: string } {
  const modelHint = typeof record.deviceModel === 'string' ? record.deviceModel : undefined;
  return {
    selectedDeviceId: resolveLegacyDeviceId(
      typeof record.selectedDeviceId === 'string' ? record.selectedDeviceId : '',
      modelHint,
      type,
    ),
    altDevice1Id: resolveLegacyDeviceId(
      typeof record.altDevice1Id === 'string' ? record.altDevice1Id : '',
      undefined,
      type,
    ),
    altDevice2Id: resolveLegacyDeviceId(
      typeof record.altDevice2Id === 'string' ? record.altDevice2Id : '',
      undefined,
      type,
    ),
  };
}

function customDevicesForQuoteType(type: QuoteType): HeatPumpDevice[] {
  const category = type === 'ilma-ilma' ? 'ilmalampopumppu' : type === 'vesi-ilma' ? 'vesi-ilmalampopumppu' : null;
  if (!category) return [];
  return listCustomRegistryDevices().filter((device) => device.category === category);
}

export function devicesForQuoteType(
  type: QuoteType,
  form?: QuoteRequestData,
  heatingNeedKw?: number | null,
): HeatPumpDevice[] {
  const catalog = type === 'ilma-ilma' ? ilmaLampopumput : type === 'vesi-ilma' ? vesiIlmaLampopumput : [];
  const custom = customDevicesForQuoteType(type);
  const base = [...catalog, ...custom];
  if (!form) return base;
  const filtered = filterCompatibleDevicesForQuote(base, form, heatingNeedKw ?? null);
  const filteredIds = new Set(filtered.map((device) => device.id));
  for (const device of custom) {
    if (!filteredIds.has(device.id)) filtered.push(device);
  }
  return filtered.sort((a, b) => (a.heatingPowerMax || 0) - (b.heatingPowerMax || 0));
}

export function calcSellFromPurchase(purchase: number, marginPercent: number): number {
  return round2((purchase || 0) * (1 + (marginPercent || 0) / 100));
}

export function getDevicePricingParams(
  data: QuoteRequestData,
  device: HeatPumpDevice | null,
): { discountPct: number; marginPct: number } {
  const baseDiscount = Number(data.deviceDiscountPercent) || 0;
  const baseMargin = Number(data.deviceMarginPercent) || 0;
  if (!device) return { discountPct: baseDiscount, marginPct: baseMargin };

  if (data.altDevice1Id && device.id === data.altDevice1Id) {
    return {
      discountPct: Number(data.altDevice1DiscountPercent) || 0,
      marginPct: Number(data.altDevice1MarginPercent) || 0,
    };
  }
  if (data.altDevice2Id && device.id === data.altDevice2Id) {
    return {
      discountPct: Number(data.altDevice2DiscountPercent) || 0,
      marginPct: Number(data.altDevice2MarginPercent) || 0,
    };
  }
  return { discountPct: baseDiscount, marginPct: baseMargin };
}

export function calculateDevicePurchaseNet(
  data: QuoteRequestData,
  device: HeatPumpDevice | null,
  feeMap?: BrandDeliveryFeeByCategoryMap | null,
): number {
  if (!device) return 0;
  const { discountPct } = getDevicePricingParams(data, device);
  if (data.selectedDeviceId && device.id === data.selectedDeviceId && data.devicePurchaseOverrideNet != null) {
    const override = Number(data.devicePurchaseOverrideNet) || 0;
    if (override > 0) return round2(override);
  }
  return computePurchaseNetAlv0(device, Number(device.listPrice) || 0, discountPct, feeMap);
}

export function calculateDeviceSellNet(
  data: QuoteRequestData,
  device: HeatPumpDevice | null,
  feeMap?: BrandDeliveryFeeByCategoryMap | null,
): number {
  if (!device) return 0;
  if (data.selectedDeviceId && device.id === data.selectedDeviceId && data.deviceSaleOverrideNet != null) {
    const override = Number(data.deviceSaleOverrideNet) || 0;
    if (override > 0) return round2(override);
  }
  const { marginPct } = getDevicePricingParams(data, device);
  return calcSellFromPurchase(calculateDevicePurchaseNet(data, device, feeMap), marginPct);
}

export function applyDeviceBrandDefaults(data: QuoteRequestData, device: HeatPumpDevice | null): QuoteRequestData {
  if (!device) return data;
  const discount = getDefaultDiscountFromListPercent(device);
  const patch: Partial<QuoteRequestData> = {
    deviceDiscountPercent: discount,
    deviceMarginPercent: device.brand.toLowerCase() === 'inventor' ? 100 : 25,
    devicePurchaseOverrideNet: null,
    deviceSaleOverrideNet: null,
  };
  return { ...data, ...patch };
}

export function selectedDevices(data: QuoteRequestData): Array<{ key: DeviceOptionKey; device: HeatPumpDevice }> {
  const rows: Array<{ key: DeviceOptionKey; device: HeatPumpDevice }> = [];
  const main = findDeviceById(data.selectedDeviceId);
  if (main) rows.push({ key: 'A', device: main });
  const alt1 = findDeviceById(data.altDevice1Id);
  if (alt1) rows.push({ key: 'B', device: alt1 });
  const alt2 = findDeviceById(data.altDevice2Id);
  if (alt2) rows.push({ key: 'C', device: alt2 });
  return rows;
}

export function formatDeviceLabel(device: HeatPumpDevice): string {
  return `${device.brand} – ${device.name} (${device.heatingPowerMax} kW)`;
}

export function computeDevicePowerFitPercent(
  heatingNeedKw: number | null,
  device: HeatPumpDevice | null,
): number | null {
  if (!device || !heatingNeedKw || heatingNeedKw <= 0) return null;
  return Math.min(100, Math.round((device.heatingPowerMax / heatingNeedKw) * 100));
}

export function powerFitLabel(pct: number | null): string {
  if (pct == null) return '';
  if (pct >= 95) return 'Hyvin mitoitettu';
  if (pct >= 80) return 'Riittävä';
  if (pct >= 65) return 'Rajatapaus';
  return 'Liian pieni teholtaan';
}
