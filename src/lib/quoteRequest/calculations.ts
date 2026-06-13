import type { BrandDeliveryFeeByCategoryMap } from '../../data/devicePricingShared';
import type { QuoteMaterial, QuoteRegion, QuoteRequestData, QuoteWorkItem } from './types';
import { isRepairQuoteType, quoteShowsKotitalousDeduction, quoteUsesTravelCost } from './constants';
import {
  calculateDevicePurchaseNet,
  calculateDeviceSellNet,
  findDeviceById,
  resolveQuoteMainDeviceForTotals,
  selectedDevices,
} from './deviceCatalog';
import { isPumpQuoteType } from './constants';

export type IilpBaseInstallParts = ReturnType<typeof getIilpBaseInstallParts>;

export function resolveIilpLaborPricingMode(data: QuoteRequestData): 'urakka' | 'tuntityo' {
  if (data.iilpLaborPricingMode === 'urakka' || data.iilpLaborPricingMode === 'tuntityo') {
    return data.iilpLaborPricingMode;
  }
  return data.iilpBaseInstallEnabled === false ? 'tuntityo' : 'urakka';
}

export function getIilpBaseInstallParts(data: QuoteRequestData) {
  const empty = {
    enabled: false,
    mode: 'urakka' as const,
    laborGross: 0,
    materialsGross: 0,
    totalGross: 0,
    laborNet: 0,
    materialsNet: 0,
    totalNet: 0,
  };
  if (data.type !== 'ilma-ilma') return empty;

  const mode = resolveIilpLaborPricingMode(data);
  const vatMult = 1 + (Number(data.vatRate) || 0) / 100;
  const laborGross =
    mode === 'urakka' ? Number(data.iilpBaseInstallLaborGross ?? 890) || 0 : 0;
  const materialsGross = Number(data.iilpBaseInstallMaterialsGross ?? 500) || 0;
  const laborNet = vatMult > 0 ? laborGross / vatMult : 0;
  const materialsNet = vatMult > 0 ? materialsGross / vatMult : 0;

  return {
    enabled: laborGross > 0 || materialsGross > 0,
    mode,
    laborGross,
    materialsGross,
    totalGross: laborGross + materialsGross,
    laborNet,
    materialsNet,
    totalNet: laborNet + materialsNet,
  };
}

export type QuoteTotals = ReturnType<typeof computeQuoteTotals>;
const regionHeatingFactors: Record<QuoteRegion, number> = {
  pohjois: 1.28,
  keski: 1.12,
  etela: 1.0,
};

function getEffectiveSupplyTemp(quote: QuoteRequestData): number {
  return Number(quote.heatingSystemTemp) || 0;
}

export function computeHeatingNeedWatts(quote: QuoteRequestData): number {
  const designTemps: Record<QuoteRegion, number> = {
    pohjois: -38,
    keski: -30,
    etela: -20,
  };

  const designOutdoorTemp = designTemps[quote.region];
  const indoorTemp = quote.desiredTemperature;
  const tempDiff = indoorTemp - designOutdoorTemp;
  let heatingNeedPerSqm = 47 * (tempDiff / 60);
  heatingNeedPerSqm *= regionHeatingFactors[quote.region];

  const getYearFactor = (year: number) => {
    const y = Number(year) || new Date().getFullYear();
    if (y < 1960) return 1.6;
    if (y < 1980) return 1.4;
    if (y < 2000) return 1.2;
    if (y < 2010) return 1.0;
    if (y < 2020) return 0.8;
    return 0.7;
  };

  heatingNeedPerSqm *= getYearFactor(quote.buildingYear);

  const buildingTypeFactors: Record<string, number> = {
    omakotitalo: 1.0,
    paritalo: 0.85,
    rivitalo: 0.8,
    kerrostalo: 0.6,
    liike: 0.9,
    maatalous: 1.2,
  };
  heatingNeedPerSqm *= buildingTypeFactors[quote.buildingType] || 1.0;

  const effectiveSupplyTemp = getEffectiveSupplyTemp(quote);
  let tempFactor = 1.0;
  if (effectiveSupplyTemp >= 65) tempFactor = 1.18;
  else if (effectiveSupplyTemp >= 55) tempFactor = 1.1;
  else if (effectiveSupplyTemp >= 45) tempFactor = 1.03;
  else if (effectiveSupplyTemp >= 35) tempFactor = 0.93;
  else tempFactor = 0.88;
  heatingNeedPerSqm *= tempFactor;

  const dhwWPerPerson = 550;
  const dhwAdd = quote.domesticHotWater ? quote.householdSize * dhwWPerPerson : 0;
  let totalHeatingNeed = Math.round(quote.heatedArea * heatingNeedPerSqm + dhwAdd);

  if (quote.previousConsumption > 0 && quote.heatedArea > 0) {
    const expectedConsumption =
      quote.previousConsumptionUnit === 'litraa'
        ? quote.heatedArea * 10
        : quote.heatedArea * 150;
    if (expectedConsumption > 0) {
      const ratio = quote.previousConsumption / expectedConsumption;
      if (ratio > 1.0) {
        totalHeatingNeed = Math.round(totalHeatingNeed * (1 + Math.min(0.35, (ratio - 1.0) * 0.45)));
      } else if (ratio < 1.0) {
        totalHeatingNeed = Math.round(totalHeatingNeed * (1 - Math.min(0.25, (1.0 - ratio) * 0.45)));
      }
    }
  }

  return Math.max(2500, Math.min(30000, totalHeatingNeed));
}

export function computeHeatingNeedKw(quote: QuoteRequestData): number {
  return Math.round((computeHeatingNeedWatts(quote) / 1000) * 10) / 10;
}

const iilpRegionFactors: Record<QuoteRegion, number> = {
  etela: 1.0,
  keski: 1.1,
  pohjois: 1.2,
};

/** Lämmitystarve W/m³ (ennen aluekerrointa). */
export const IILP_HEATING_W_PER_M3 = 20;
/** Jäähdytystarve W/m³ (375 m³ × ~23 W/m³ ≈ 8,6 kW @ 150 m² / 2,5 m). */
export const IILP_COOLING_W_PER_M3 = 1000 / 17.5 / 2.5;

export function iilpHeatingWPerM3ForRegion(region: QuoteRegion): number {
  return IILP_HEATING_W_PER_M3 * (iilpRegionFactors[region] || 1.0);
}

export function computeIilpVolumeM3(quote: QuoteRequestData): number {
  const area = Math.max(0, Number(quote.heatedArea) || 0);
  const height = Math.max(2.0, Number(quote.roomHeight) || 2.5);
  return Math.round(area * height * 10) / 10;
}

export function computeIilpHeatingNeedKw(quote: QuoteRequestData): number {
  const volume = computeIilpVolumeM3(quote);
  if (volume <= 0) return 0;
  const regionFactor = iilpRegionFactors[quote.region] || 1.0;
  const kw = (volume * IILP_HEATING_W_PER_M3 * regionFactor) / 1000;
  return Math.round(Math.max(2.0, kw) * 10) / 10;
}

export function computeIilpCoolingNeedKw(quote: QuoteRequestData): number {
  const volume = computeIilpVolumeM3(quote);
  if (volume <= 0) return 0;
  const kw = (volume * IILP_COOLING_W_PER_M3) / 1000;
  return Math.round(Math.max(2.0, kw) * 10) / 10;
}

export function effectiveIilpPurpose(quote: QuoteRequestData): QuoteRequestData['iilpPurpose'] {
  if (quote.buildingType === 'kerrostalo') {
    return quote.iilpPurpose === 'cooling_heating' ? 'cooling_heating' : 'cooling';
  }
  return quote.iilpPurpose || 'cooling_heating';
}

export function computeIilpNeedKw(quote: QuoteRequestData): number {
  const purpose = effectiveIilpPurpose(quote);
  const heating = computeIilpHeatingNeedKw(quote);
  const cooling = computeIilpCoolingNeedKw(quote);
  if (purpose === 'cooling') return cooling;
  return Math.max(heating, cooling);
}

export type IilpCoolingEnergyEstimate = {
  peakCoolingKw: number;
  avgLoadKw: number;
  hoursPerDay: number;
  cop: number;
  kwhPerDay: number;
  eurPerDay: number;
  kwhPerDayMin: number;
  kwhPerDayMax: number;
  eurPerDayMin: number;
  eurPerDayMax: number;
};

/** Arvio jäähdytyksen sähkönkulutuksesta (ei säästövaikutusta). */
export function computeIilpCoolingEnergyEstimate(
  data: QuoteRequestData,
  device: import('../../data/pumpDeviceCatalog').HeatPumpDevice | null,
): IilpCoolingEnergyEstimate | null {
  let peakCoolingKw = computeIilpCoolingNeedKw(data);
  if (device?.coolingPowerMax && device.coolingPowerMax > 0) {
    peakCoolingKw = Math.min(peakCoolingKw, device.coolingPowerMax);
  }
  if (peakCoolingKw <= 0) return null;

  const avgLoadKw = Math.round(peakCoolingKw * 0.65 * 10) / 10;
  const hoursPerDay = data.buildingType === 'kerrostalo' ? 6 : 8;
  const cop = 3.5;
  const elecPrice = 0.2;

  const kwhPerDay = Math.round(((avgLoadKw / cop) * hoursPerDay) * 10) / 10;
  const eurPerDay = Math.round(kwhPerDay * elecPrice * 100) / 100;
  const kwhPerDayMin = Math.round(kwhPerDay * 0.75 * 10) / 10;
  const kwhPerDayMax = Math.round(kwhPerDay * 1.35 * 10) / 10;
  const eurPerDayMin = Math.round(kwhPerDayMin * elecPrice * 100) / 100;
  const eurPerDayMax = Math.round(kwhPerDayMax * elecPrice * 100) / 100;

  return {
    peakCoolingKw,
    avgLoadKw,
    hoursPerDay,
    cop,
    kwhPerDay,
    eurPerDay,
    kwhPerDayMin,
    kwhPerDayMax,
    eurPerDayMin,
    eurPerDayMax,
  };
}

export function computeTravelNet(data: QuoteRequestData): number {
  if (!quoteUsesTravelCost(data.type)) return 0;
  if (data.travelKmEnabled) {
    const km = Math.max(0, Number(data.travelKmDistance) || 0);
    const rate = Math.max(0, Number(data.travelKmRate) || 0);
    return Math.round(km * rate * 100) / 100;
  }
  return Math.max(0, Number(data.travelCost) || 0);
}

export function travelCostLabel(data: QuoteRequestData): string {
  if (data.travelKmEnabled && Number(data.travelKmDistance) > 0) {
    const rate = Number(data.travelKmRate) || 0;
    return `Km-korvaus (${data.travelKmDistance} km × ${rate.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/km)`;
  }
  return 'Matkakulut';
}

export function computePumpSizingNeedKw(quote: QuoteRequestData): number | null {
  if (quote.type === 'ilma-ilma') return computeIilpNeedKw(quote);
  if (quote.type === 'vesi-ilma') return computeHeatingNeedKw(quote);
  return null;
}

export function workItemsTotal(items: QuoteWorkItem[]): number {
  return items.reduce((sum, item) => sum + Number(item.hours || 0) * Number(item.pricePerHour || 0), 0);
}

export function quoteWorkNetFromItems(data: QuoteRequestData): number {
  const workFromItems = workItemsTotal(data.workItems);
  const workFromHours = Number(data.laborHours || 0) * Number(data.laborRate || 0);
  return workFromItems > 0 ? workFromItems : workFromHours;
}

/** Työn osuus (alv 0) ilman matkakuluja. IILP-urakassa vain urakkahinta, ei työrivejä. */
export function quoteWorkNet(data: QuoteRequestData): number {
  if (data.type === 'ilma-ilma' && resolveIilpLaborPricingMode(data) === 'urakka') {
    return getIilpBaseInstallParts(data).laborNet;
  }
  return quoteWorkNetFromItems(data);
}

export function quoteMaterialsNetForTotals(data: QuoteRequestData): number {
  let materialsNet = quoteMaterialsNet(data);
  if (data.type === 'ilma-ilma') {
    materialsNet += getIilpBaseInstallParts(data).materialsNet;
  }
  return materialsNet;
}

export function materialSellTotal(materials: QuoteMaterial[]): number {
  return materials.reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.sellPrice || 0),
    0,
  );
}

export function materialPurchaseTotal(materials: QuoteMaterial[]): number {
  return materials.reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.purchasePrice || 0),
    0,
  );
}

/** Sisäinen laskenta: hankinta, myynti ja kate (työ/matka = koko rivi kateena). */
export function computeQuoteInternalTotals(
  data: QuoteRequestData,
  feeMap?: BrandDeliveryFeeByCategoryMap | null,
) {
  const quoteTotals = computeQuoteTotals(data, feeMap);

  const workSellNet = quoteTotals.workNet;
  const travelSellNet = quoteTotals.travelNet;

  let materialsPurchaseNet = 0;
  let materialsSellNet = 0;
  const nestedMaterialCount = data.workItems.reduce(
    (sum, item) => sum + (item.materials ?? []).filter((row) => row.name.trim()).length,
    0,
  );
  if (nestedMaterialCount > 0) {
    for (const item of data.workItems) {
      materialsPurchaseNet += materialPurchaseTotal(item.materials ?? []);
      materialsSellNet += materialSellTotal(item.materials ?? []);
    }
  } else {
    materialsPurchaseNet = materialPurchaseTotal(data.materials);
    materialsSellNet = materialSellTotal(data.materials);
  }

  let devicePurchaseNet = 0;
  let deviceSellNet = quoteTotals.deviceNet;
  if (isPumpQuoteType(data.type)) {
    const mainDevice = resolveQuoteMainDeviceForTotals(data, computePumpSizingNeedKw(data));
    if (mainDevice) {
      devicePurchaseNet = calculateDevicePurchaseNet(data, mainDevice, feeMap);
    }
  } else if (data.devicePurchaseOverrideNet != null) {
    devicePurchaseNet = Number(data.devicePurchaseOverrideNet) || 0;
  }

  const purchaseNet = materialsPurchaseNet + devicePurchaseNet;
  const sellNet = quoteTotals.subtotalNet;
  const discountedSellNet = quoteTotals.discountedNet;
  const marginNet = discountedSellNet - purchaseNet;
  const marginPercent = discountedSellNet > 0 ? (marginNet / discountedSellNet) * 100 : 0;
  const materialsMarginNet = materialsSellNet - materialsPurchaseNet;
  const deviceMarginNet = deviceSellNet - devicePurchaseNet;

  return {
    workSellNet,
    travelSellNet,
    materialsPurchaseNet,
    materialsSellNet,
    materialsMarginNet,
    devicePurchaseNet,
    deviceSellNet,
    deviceMarginNet,
    purchaseNet,
    sellNet,
    discountedSellNet,
    marginNet,
    marginPercent,
    grossTotal: quoteTotals.grossTotal,
    vatAmount: quoteTotals.vatAmount,
    vatRate: Number(data.vatRate) || 0,
    discountPercent: Math.max(0, Math.min(100, Number(data.overallDiscountPercent || 0))),
  };
}

export function quoteMaterialsNet(data: QuoteRequestData): number {
  const fromWorkItems = data.workItems.reduce(
    (sum, item) => sum + materialSellTotal(item.materials ?? []),
    0,
  );
  const fromTopLevel = materialSellTotal(data.materials);
  if (isRepairQuoteType(data.type)) {
    return fromWorkItems > 0 ? fromWorkItems : fromTopLevel;
  }
  return fromTopLevel + fromWorkItems;
}

export function computeQuoteTotals(
  data: QuoteRequestData,
  feeMap?: BrandDeliveryFeeByCategoryMap | null,
) {
  const workNet = quoteWorkNet(data);
  const materialsNet = quoteMaterialsNetForTotals(data);
  const iilpBase = getIilpBaseInstallParts(data);
  const travelNet = computeTravelNet(data);

  let deviceNet = 0;
  if (isPumpQuoteType(data.type)) {
    const mainDevice = resolveQuoteMainDeviceForTotals(data, computePumpSizingNeedKw(data));
    deviceNet = mainDevice ? calculateDeviceSellNet(data, mainDevice, feeMap) : 0;
  } else {
    deviceNet = Number(data.deviceSaleOverrideNet || 0);
  }

  const subtotalNet = workNet + materialsNet + travelNet + deviceNet;
  const discount = Math.max(0, Math.min(100, Number(data.overallDiscountPercent || 0)));
  const discountedNet = subtotalNet * (1 - discount / 100);
  const vatRate = Number(data.vatRate || 0);
  const vatAmount = discountedNet * (vatRate / 100);
  const grossTotal = discountedNet + vatAmount;

  return {
    workNet,
    materialsNet,
    travelNet,
    deviceNet,
    subtotalNet,
    discountedNet,
    vatAmount,
    grossTotal,
    iilpBaseInstall: iilpBase,
  };
}

export function computeOptionQuoteTotals(
  data: QuoteRequestData,
  deviceId: string,
  feeMap?: BrandDeliveryFeeByCategoryMap | null,
): QuoteTotals | null {
  const device = findDeviceById(deviceId);
  if (!device) return null;
  const base = computeQuoteTotals(data, feeMap);
  const deviceNet = calculateDeviceSellNet(data, device, feeMap);
  const subtotalNet = base.workNet + base.materialsNet + base.travelNet + deviceNet;
  const discount = Math.max(0, Math.min(100, Number(data.overallDiscountPercent || 0)));
  const discountedNet = subtotalNet * (1 - discount / 100);
  const vatRate = Number(data.vatRate || 0);
  const vatAmount = discountedNet * (vatRate / 100);
  return {
    ...base,
    deviceNet,
    subtotalNet,
    discountedNet,
    vatAmount,
    grossTotal: discountedNet + vatAmount,
  };
}

export function computeAllOptionTotals(
  data: QuoteRequestData,
  feeMap?: BrandDeliveryFeeByCategoryMap | null,
) {
  return selectedDevices(data)
    .map(({ key, device }) => ({
      key,
      device,
      totals: computeOptionQuoteTotals(data, device.id, feeMap),
    }))
    .filter((row) => row.totals != null);
}
export function computeKotitalousDeduction(data: QuoteRequestData) {
  if (!quoteShowsKotitalousDeduction(data.type)) {
    return {
      laborOnlyGross: 0,
      percent: 0,
      maxPerPerson: 0,
      onePerson: 0,
      withSpouse: 0,
      isOilAbandonment: false,
      label: '',
    };
  }

  const totals = computeQuoteTotals(data);
  const vatRate = Number(data.vatRate || 0);
  const laborOnlyGross = totals.workNet * (1 + vatRate / 100);
  const isOilAbandonment =
    data.oilBoilerRemoval ||
    data.oilTankEmptying ||
    String(data.currentHeating || '').toLowerCase().includes('ölj');
  const percent = isOilAbandonment ? 0.6 : 0.35;
  const maxPerPerson = isOilAbandonment ? 3500 : 1600;
  const raw = laborOnlyGross * percent;
  const onePerson = Math.max(0, Math.min(maxPerPerson, raw));
  const withSpouse = Math.max(0, Math.min(maxPerPerson * 2, raw));
  return {
    laborOnlyGross,
    percent,
    maxPerPerson,
    onePerson,
    withSpouse,
    isOilAbandonment,
    label: isOilAbandonment
      ? 'Kotitalousvähennys (öljylämmityksen korvaus)'
      : 'Kotitalousvähennys (työn osuus)',
  };
}
