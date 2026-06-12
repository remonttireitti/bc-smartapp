import type { CustomHeatPumpDeviceEntry } from './deviceRegistryTypes';
import type { HeatPumpDevice } from './pumpDeviceCatalog';

export function isCustomPumpDeviceId(id: string | null | undefined): boolean {
  return !!id && id.startsWith('custom-');
}

export function generateCustomPumpDeviceId(): string {
  return `custom-${crypto.randomUUID().slice(0, 8)}`;
}

export function customDeviceToHeatPump(entry: CustomHeatPumpDeviceEntry): HeatPumpDevice {
  const heatingPowerMax = Number(entry.heatingPowerMax) || 0;
  const heatingPowerMin = Number(entry.heatingPowerMin) || 0;
  return {
    id: entry.id,
    brand: entry.brand.trim() || 'Muu',
    name: entry.name.trim(),
    model: entry.model.trim() || entry.name.trim(),
    heatingPowerMin,
    heatingPowerMax,
    coolingPowerMin:
      entry.coolingPowerMax != null && Number(entry.coolingPowerMax) > 0
        ? Number(entry.coolingPowerMin) || 0
        : undefined,
    coolingPowerMax:
      entry.coolingPowerMax != null && Number(entry.coolingPowerMax) > 0
        ? Number(entry.coolingPowerMax)
        : undefined,
    listPrice: Math.max(0, Number(entry.listPrice) || 0),
    defaultDiscountPercent:
      entry.defaultDiscountPercent != null && !Number.isNaN(Number(entry.defaultDiscountPercent))
        ? Number(entry.defaultDiscountPercent)
        : undefined,
    category: entry.category,
    vilpHasIndoorUnit: entry.category === 'vesi-ilmalampopumppu' ? true : undefined,
  };
}

export function createEmptyCustomPumpDeviceDraft(
  category: CustomHeatPumpDeviceEntry['category'] = 'ilmalampopumppu',
): CustomHeatPumpDeviceEntry {
  return {
    id: generateCustomPumpDeviceId(),
    brand: '',
    name: '',
    model: '',
    category,
    listPrice: 0,
    heatingPowerMin: 0,
    heatingPowerMax: 0,
    defaultDiscountPercent: 0,
  };
}
