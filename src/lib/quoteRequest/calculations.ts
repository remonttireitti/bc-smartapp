import type { BrandDeliveryFeeByCategoryMap } from '../../data/devicePricingShared';
import type { QuoteMaterial, QuoteRegion, QuoteRequestData, QuoteWorkItem } from './types';
import { isRepairQuoteType } from './constants';
import {
  calculateDeviceSellNet,
  findDeviceById,
  selectedDevices,
} from './deviceCatalog';
import { isPumpQuoteType } from './constants';

export type IilpBaseInstallParts = ReturnType<typeof getIilpBaseInstallParts>;

export function getIilpBaseInstallParts(data: QuoteRequestData) {
  const enabled = data.type === 'ilma-ilma' && (data.iilpBaseInstallEnabled ?? false);
  if (!enabled) {
    return {
      enabled: false,
      laborGross: 0,
      materialsGross: 0,
      totalGross: 0,
      laborNet: 0,
      materialsNet: 0,
      totalNet: 0,
    };
  }

  const vatMult = 1 + (Number(data.vatRate) || 0) / 100;
  const laborGross = Number(data.iilpBaseInstallLaborGross ?? 890) || 0;
  const materialsGross = Number(data.iilpBaseInstallMaterialsGross ?? 500) || 0;
  const laborNet = vatMult > 0 ? laborGross / vatMult : 0;
  const materialsNet = vatMult > 0 ? materialsGross / vatMult : 0;

  return {
    enabled: true,
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

export function computeIilpHeatingNeedKw(quote: QuoteRequestData): number {
  const area = Math.max(0, Number(quote.heatedArea) || 0);
  if (area <= 0) return 0;
  const height = Math.max(2.0, Number(quote.roomHeight) || 2.5);
  const heatingWPerSqm = 25 * height;
  const regionFactor = iilpRegionFactors[quote.region] || 1.0;
  const kw = (area * heatingWPerSqm * regionFactor) / 1000;
  return Math.round(Math.max(2.0, Math.min(10.0, kw)) * 10) / 10;
}

export function computeIilpCoolingNeedKw(quote: QuoteRequestData): number {
  const area = Math.max(0, Number(quote.heatedArea) || 0);
  if (area <= 0) return 0;
  const height = Math.max(2.0, Number(quote.roomHeight) || 2.5);
  const coolingWPerSqm = (1000 / 17.5) * (height / 2.5);
  const kw = (area * coolingWPerSqm) / 1000;
  return Math.round(Math.max(2.0, Math.min(10.0, kw)) * 10) / 10;
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

export function computePumpSizingNeedKw(quote: QuoteRequestData): number | null {
  if (quote.type === 'ilma-ilma') return computeIilpNeedKw(quote);
  if (quote.type === 'vesi-ilma') return computeHeatingNeedKw(quote);
  return null;
}

export function workItemsTotal(items: QuoteWorkItem[]): number {
  return items.reduce((sum, item) => sum + Number(item.hours || 0) * Number(item.pricePerHour || 0), 0);
}

export function materialSellTotal(materials: QuoteMaterial[]): number {
  return materials.reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.sellPrice || 0),
    0,
  );
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
  const workFromItems = workItemsTotal(data.workItems);
  const workFromHours = Number(data.laborHours || 0) * Number(data.laborRate || 0);
  let workNet = workFromItems > 0 ? workFromItems : workFromHours;
  let materialsNet = quoteMaterialsNet(data);
  const iilpBase = getIilpBaseInstallParts(data);
  if (iilpBase.enabled) {
    workNet += iilpBase.laborNet;
    materialsNet += iilpBase.materialsNet;
  }
  const travelNet = Number(data.travelCost || 0);

  let deviceNet = 0;
  if (isPumpQuoteType(data.type)) {
    const mainDevice = findDeviceById(data.selectedDeviceId);
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
