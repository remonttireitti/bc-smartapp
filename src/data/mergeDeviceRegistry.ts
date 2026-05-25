import type { HeatPumpDevice } from './pumpDeviceCatalog';
import { effectiveListAfterBrandBump, round2 } from './devicePricingShared';
import { IILP_FEATURE_OPTIONS, VILP_FEATURE_OPTIONS } from './deviceFeatureOptions';
import type { DeviceRegistryOverride } from './deviceRegistryTypes';

/** Yhdistää katalogilaitteen ja yrityskohtaiset yliajot. */
export function mergeHeatPumpWithRegistry(
  base: HeatPumpDevice,
  brandBumps: Record<string, number>,
  override?: DeviceRegistryOverride | null,
): HeatPumpDevice {
  const bump = Number(brandBumps[base.brand] ?? 0) || 0;

  let listPrice: number;
  if (override?.listPriceOverride != null && Number(override.listPriceOverride) > 0) {
    listPrice = round2(Number(override.listPriceOverride));
  } else {
    listPrice = effectiveListAfterBrandBump(base.listPrice, bump);
  }

  let defaultDiscountPercent: number | undefined = base.defaultDiscountPercent;
  if (
    override?.discountFromListPercentOverride != null &&
    !Number.isNaN(Number(override.discountFromListPercentOverride))
  ) {
    defaultDiscountPercent = Number(override.discountFromListPercentOverride);
  }

  const vilpOutdoorSupplyPhases =
    override?.vilpOutdoorSupplyPhases != null
      ? (override.vilpOutdoorSupplyPhases as 1 | 3)
      : base.vilpOutdoorSupplyPhases;

  const iilpProductMode =
    override?.iilpProductModeOverride != null ? override.iilpProductModeOverride : base.iilpProductMode;

  let printFeatures: string[] | undefined = base.printFeatures;
  const ids = override?.selectedFeatureIds;
  if (override && Array.isArray(ids) && ids.length > 0) {
    const opts = base.category === 'ilmalampopumppu' ? IILP_FEATURE_OPTIONS : VILP_FEATURE_OPTIONS;
    const map = new Map(opts.map((o) => [o.id, o.label] as const));
    printFeatures = ids
      .map((id) => map.get(id as (typeof opts)[number]['id']))
      .filter(Boolean) as string[];
  }

  if (override?.extraPrintFeatures?.trim()) {
    const extra = override.extraPrintFeatures
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (extra.length) {
      printFeatures = [...(printFeatures || []), ...extra];
    }
  }

  const registryImageUrlIndoor = override?.imageUrlIndoor ?? override?.imageUrl ?? undefined;
  const registryImageUrlOutdoor = override?.imageUrlOutdoor ?? undefined;

  return {
    ...base,
    listPrice,
    defaultDiscountPercent,
    vilpOutdoorSupplyPhases,
    iilpProductMode,
    printFeatures: printFeatures && printFeatures.length ? printFeatures : base.printFeatures,
    registryImageUrlIndoor: registryImageUrlIndoor || undefined,
    registryImageUrlOutdoor: registryImageUrlOutdoor || undefined,
  };
}
