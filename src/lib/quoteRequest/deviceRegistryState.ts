import type { DeviceRegistryOverride } from '../../data/deviceRegistryTypes';
import { mergeHeatPumpWithRegistry } from '../../data/mergeDeviceRegistry';
import { ALL_PUMP_DEVICES, type HeatPumpDevice } from '../../data/pumpDeviceCatalog';
import {
  parseBrandDeliveryFeesFromMeta,
  type BrandDeliveryFeeByCategoryMap,
} from '../../data/devicePricingShared';
import type { CompanySettings } from '../management';

export type DeviceRegistrySnapshot = {
  brandBumps: Record<string, number>;
  feeMap: BrandDeliveryFeeByCategoryMap;
  overrides: Record<string, DeviceRegistryOverride>;
};

export function snapshotFromCompanySettings(settings: CompanySettings | null | undefined): DeviceRegistrySnapshot {
  const reg = settings?.device_registry;
  return {
    brandBumps: { ...(reg?.brand_price_bumps ?? {}) },
    feeMap: parseBrandDeliveryFeesFromMeta(
      reg
        ? {
            brandDeliveryFeesByCategory: reg.brand_delivery_fees_by_category,
            brandDeliveryFeePerUnit: reg.brand_delivery_fee_per_unit,
          }
        : null,
    ),
    overrides: { ...(reg?.overrides ?? {}) },
  };
}

let activeSnapshot: DeviceRegistrySnapshot | null = null;

export function setActiveDeviceRegistry(snapshot: DeviceRegistrySnapshot | null) {
  activeSnapshot = snapshot;
}

export function getActiveDeviceRegistry(): DeviceRegistrySnapshot | null {
  return activeSnapshot;
}

export function resolveRegistryDevice(
  id: string,
  snapshot: DeviceRegistrySnapshot | null = activeSnapshot,
): HeatPumpDevice | null {
  const base = ALL_PUMP_DEVICES.find((device) => device.id === id) ?? null;
  if (!base) return null;
  if (!snapshot) return base;
  return mergeHeatPumpWithRegistry(base, snapshot.brandBumps, snapshot.overrides[id]);
}

export function applyDeviceRegistryToSettings(
  settings: CompanySettings,
  patch: {
    brandBumps?: Record<string, number>;
    overrides?: Record<string, DeviceRegistryOverride>;
  },
): CompanySettings {
  const reg = settings.device_registry ?? {};
  return {
    ...settings,
    device_registry: {
      ...reg,
      ...(patch.brandBumps !== undefined ? { brand_price_bumps: patch.brandBumps } : {}),
      ...(patch.overrides !== undefined ? { overrides: patch.overrides } : {}),
    },
  };
}
