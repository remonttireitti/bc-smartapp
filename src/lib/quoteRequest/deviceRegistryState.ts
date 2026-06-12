import { customDeviceToHeatPump } from '../../data/customPumpDevices';
import type { CustomHeatPumpDeviceEntry, DeviceRegistryOverride } from '../../data/deviceRegistryTypes';
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
  customDevices: Record<string, CustomHeatPumpDeviceEntry>;
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
    customDevices: { ...(reg?.custom_devices ?? {}) },
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
  const customEntry = snapshot?.customDevices[id];
  const base =
    customEntry != null
      ? customDeviceToHeatPump(customEntry)
      : ALL_PUMP_DEVICES.find((device) => device.id === id) ?? null;
  if (!base) return null;
  if (!snapshot) return base;
  return mergeHeatPumpWithRegistry(base, snapshot.brandBumps, snapshot.overrides[id]);
}

export function listCustomRegistryDevices(
  snapshot: DeviceRegistrySnapshot | null = activeSnapshot,
): HeatPumpDevice[] {
  if (!snapshot) return [];
  return Object.values(snapshot.customDevices).map((entry) =>
    mergeHeatPumpWithRegistry(
      customDeviceToHeatPump(entry),
      snapshot.brandBumps,
      snapshot.overrides[entry.id],
    ),
  );
}

export function applyDeviceRegistryToSettings(
  settings: CompanySettings,
  patch: {
    brandBumps?: Record<string, number>;
    overrides?: Record<string, DeviceRegistryOverride>;
    customDevices?: Record<string, CustomHeatPumpDeviceEntry>;
  },
): CompanySettings {
  const reg = settings.device_registry ?? {};
  return {
    ...settings,
    device_registry: {
      ...reg,
      ...(patch.brandBumps !== undefined ? { brand_price_bumps: patch.brandBumps } : {}),
      ...(patch.overrides !== undefined ? { overrides: patch.overrides } : {}),
      ...(patch.customDevices !== undefined ? { custom_devices: patch.customDevices } : {}),
    },
  };
}
