import type { Partnership } from '../../types';
import { partnershipPermsActingOnOwner } from '../management';
import { applyLegacyQuoteFields } from './legacyImport';
import { resolveLegacyDeviceIds, findDeviceById, resolveQuoteMainDeviceForTotals } from './deviceCatalog';
import { computePumpSizingNeedKw, resolveIilpLaborPricingMode } from './calculations';
import { DEFAULT_TERMATEK_IILP_QUOTE_TERMS, DEFAULT_QUOTE_TERMS_PRINT } from './termatekDefaultTerms';
import {
  DEFAULT_IILP_OPTIONAL_ITEMS,
  DEFAULT_IILP_PAYMENT_TERMS,
  DEFAULT_TRAVEL_KM_RATE,
  inferQuoteVatProfile,
  isPumpQuoteType,
  isRepairQuoteType,
  isHuoltoQuoteType,
  quoteTemplates,
  quoteUsesTravelCost,
  vatRateForQuoteProfile,
} from './constants';
import type {
  QuoteBrandMode,
  QuoteLine,
  QuoteMaterial,
  QuoteOptionalItem,
  QuoteRequestData,
  QuoteTermsPrintFlags,
  QuoteType,
  QuoteWorkItem,
} from './types';

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: 'Luonnos',
  sent: 'Lähetetty',
};

function newId() {
  return crypto.randomUUID();
}

export function createEmptyWorkItem(partial?: Partial<QuoteWorkItem>): QuoteWorkItem {
  return {
    id: newId(),
    description: 'Työ',
    hours: 0,
    pricePerHour: 65,
    materials: [],
    ...partial,
  };
}

export function createServiceWorkItem(partial?: Partial<QuoteWorkItem>): QuoteWorkItem {
  return createEmptyWorkItem({
    description: '',
    hours: 1,
    pricePerHour: 65,
    materials: [],
    ...partial,
  });
}

export function defaultWorkItemsForType(type: QuoteType): QuoteWorkItem[] {
  const template = quoteTemplates[type];
  const rate = template.laborRate ?? 65;

  if (type === 'huolto') {
    return [
      createEmptyWorkItem({ description: 'Öljyn vaihto', hours: 1, pricePerHour: rate }),
      createEmptyWorkItem({ description: 'Kenno pesu', hours: 1, pricePerHour: rate }),
    ];
  }

  return [createEmptyWorkItem({ pricePerHour: rate })];
}

function normalizeWorkItemMaterials(raw: unknown): QuoteMaterial[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry, index) => {
    const row = entry as Record<string, unknown>;
    return createEmptyMaterial({
      id: typeof row.id === 'string' ? row.id : `mat-${index}`,
      name: typeof row.name === 'string' ? row.name : '',
      quantity: Number(row.quantity) || 0,
      purchasePrice: Number(row.purchasePrice) || 0,
      marginPercent: Number(row.marginPercent) || 0,
      sellPrice: Number(row.sellPrice) || 0,
    });
  });
}

export function createEmptyMaterial(partial?: Partial<QuoteMaterial>): QuoteMaterial {
  return {
    id: newId(),
    name: '',
    quantity: 1,
    purchasePrice: 0,
    marginPercent: 25,
    sellPrice: 0,
    ...partial,
  };
}

export function createEmptyQuoteLine(partial?: Partial<QuoteLine>): QuoteLine {
  return {
    id: newId(),
    description: '',
    qty: 1,
    unitPrice: 0,
    unit: 'kpl',
    ...partial,
  };
}

export function createEmptyOptionalItem(partial?: Partial<QuoteOptionalItem>): QuoteOptionalItem {
  return {
    id: newId(),
    description: '',
    priceGross: 0,
    enabled: false,
    ...partial,
  };
}

export function defaultIilpOptionalItems(): QuoteOptionalItem[] {
  return DEFAULT_IILP_OPTIONAL_ITEMS.map((item) => createEmptyOptionalItem(item));
}

export function createEmptyQuoteRequestData(type: QuoteType = 'vesi-ilma'): QuoteRequestData {
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 30);
  const template = quoteTemplates[type];
  const quoteVatProfile = type === 'huolto' ? 'business' : 'consumer';

  return {
    type,
    quoteVatProfile,
    introText: 'Tarjoamme seuraavat työt ja tuotteet:',
    notes: '',
    validUntil: validUntil.toISOString().slice(0, 10),
    brandMode: 'auto',
    paymentTermsText: type === 'ilma-ilma' ? DEFAULT_IILP_PAYMENT_TERMS : '14 pv netto',
    deliveryTermsText: 'Työt sovitaan erikseen asiakkaan kanssa.',
    customerPhone: '',
    customerEmail: '',
    customerContactPerson: '',
    buildingType: 'omakotitalo',
    heatedArea: template.heatedArea ?? 150,
    roomHeight: 2.5,
    buildingYear: 1990,
    region: 'keski',
    projectType: 'korjaus',
    heatingSystemType: 'patteri_45',
    heatingSystemTemp: 45,
    domesticHotWater: true,
    householdSize: 4,
    desiredTemperature: 21,
    currentHeating: 'sähkö',
    previousConsumption: 0,
    previousConsumptionUnit: 'litraa',
    deviceBrand: '',
    deviceModel: '',
    faultDescription: '',
    situationReportEnabled: false,
    situationReportTitle: 'Tilanneraportti',
    situationReportText: '',
    workItems: defaultWorkItemsForType(type),
    materials: [],
    laborHours: template.laborHours ?? 0,
    laborRate: template.laborRate ?? 65,
    travelCost: 0,
    travelKmEnabled: false,
    travelKmDistance: 0,
    travelKmRate: DEFAULT_TRAVEL_KM_RATE,
    quoteTermsText: type === 'ilma-ilma' ? DEFAULT_TERMATEK_IILP_QUOTE_TERMS : '',
    quoteTermsPrint: { ...DEFAULT_QUOTE_TERMS_PRINT },
    vatRate: vatRateForQuoteProfile(quoteVatProfile),
    deviceDiscountPercent: 52.5,
    deviceMarginPercent: 25,
    devicePurchaseOverrideNet: null,
    deviceSaleOverrideNet: null,
    selectedDeviceId: '',
    altDevice1Id: '',
    altDevice2Id: '',
    altDevice1DiscountPercent: 0,
    altDevice1MarginPercent: 25,
    altDevice2DiscountPercent: 0,
    altDevice2MarginPercent: 25,
    optionAGood: '',
    optionABad: '',
    optionBGood: '',
    optionBBad: '',
    optionCGood: '',
    optionCBad: '',
    oilBoilerRemoval: false,
    oilTankEmptying: false,
    overallDiscountPercent: 0,
    lines: [],
    vilpBrandChoice: '',
    vilpOutdoorModel: '',
    vilpIndoorModel: '',
    vilpIndoorConfig: 'ilman-varaa',
    vilpSeries: '',
    vilpTankLiters: 0,
    vilpZones: 1,
    vilpCooling: true,
    iilpPurpose: 'cooling_heating',
    iilpLaborPricingMode: template.iilpLaborPricingMode ?? 'urakka',
    iilpBaseInstallLaborGross: template.iilpBaseInstallLaborGross ?? 890,
    iilpBaseInstallMaterialsGross: template.iilpBaseInstallMaterialsGross ?? 500,
    iilpDeviceSelectionNote: '',
    optionalItems: type === 'ilma-ilma' ? defaultIilpOptionalItems() : [],
    iilpIndoorPlacement: '',
    iilpOutdoorPlacement: '',
    iilpPipeLengthM: 0,
    iilpElectricalNotes: '',
    iilpCondensateNotes: '',
    iilpEnergySavingsText: '',
    siteConfigConfirmed: false,
    acceptedSiteDefaults: [],
  };
}

function quoteHasWorkContent(data: QuoteRequestData): boolean {
  return (
    data.workItems.some(
      (w) =>
        w.description.trim() ||
        Number(w.hours) > 0 ||
        (w.materials ?? []).some((m) => m.name.trim()),
    ) || data.materials.some((m) => m.name.trim())
  );
}

export function applyQuoteTypeChange(current: QuoteRequestData, nextType: QuoteType): QuoteRequestData {
  const template = quoteTemplates[nextType];
  const wasPump = isPumpQuoteType(current.type);
  const nextPump = isPumpQuoteType(nextType);
  const wasService = isHuoltoQuoteType(current.type);
  const nextService = isHuoltoQuoteType(nextType);
  const crossingFamily = wasPump !== nextPump || wasService !== nextService;
  const hasContent = quoteHasWorkContent(current);

  let workItems = current.workItems;
  let materials = current.materials;

  if (crossingFamily && !hasContent) {
    workItems = nextService
      ? defaultWorkItemsForType(nextType)
      : [createEmptyWorkItem({ pricePerHour: template.laborRate ?? 65 })];
    materials = [];
  } else if (nextService) {
    workItems = workItems.map((item) => ({ ...item, materials: item.materials ?? [] }));
    const nestedCount = workItems.reduce((sum, item) => sum + (item.materials?.length ?? 0), 0);
    if (materials.length > 0 && nestedCount === 0 && workItems.length > 0) {
      workItems = workItems.map((item, index) =>
        index === 0 ? { ...item, materials: [...materials] } : item,
      );
      materials = [];
    }
  }

  const quoteVatProfile = current.quoteVatProfile ?? inferQuoteVatProfile(current.vatRate);

  return {
    ...current,
    type: nextType,
    quoteVatProfile,
    laborHours: template.laborHours ?? current.laborHours,
    laborRate: template.laborRate ?? current.laborRate,
    travelCost: 0,
    travelKmEnabled: nextType === current.type ? current.travelKmEnabled : false,
    travelKmDistance: nextType === current.type ? current.travelKmDistance : 0,
    travelKmRate: current.travelKmRate || DEFAULT_TRAVEL_KM_RATE,
    quoteTermsText:
      nextType === 'ilma-ilma'
        ? current.quoteTermsText?.trim() || DEFAULT_TERMATEK_IILP_QUOTE_TERMS
        : nextType === current.type
          ? current.quoteTermsText
          : '',
    vatRate: vatRateForQuoteProfile(quoteVatProfile),
    workItems,
    materials,
    ...(nextPump
      ? {}
      : {
          devicePurchaseOverrideNet: null,
          deviceSaleOverrideNet: null,
          selectedDeviceId: '',
          altDevice1Id: '',
          altDevice2Id: '',
        }),
    vilpBrandChoice: nextType === 'vesi-ilma' ? current.vilpBrandChoice : '',
    vilpOutdoorModel: nextType === 'vesi-ilma' ? current.vilpOutdoorModel : '',
    iilpBaseInstallLaborGross:
      nextType === 'ilma-ilma'
        ? (template.iilpBaseInstallLaborGross ?? 890)
        : current.iilpBaseInstallLaborGross,
    iilpBaseInstallMaterialsGross:
      nextType === 'ilma-ilma'
        ? (template.iilpBaseInstallMaterialsGross ?? 500)
        : current.iilpBaseInstallMaterialsGross,
    iilpLaborPricingMode:
      nextType === 'ilma-ilma'
        ? (template.iilpLaborPricingMode ?? 'urakka')
        : current.iilpLaborPricingMode,
    heatedArea:
      nextType === 'ilma-ilma' && current.type !== 'ilma-ilma'
        ? (template.heatedArea ?? 70)
        : current.heatedArea,
  };
}

export function normalizeQuoteRequestData(raw: unknown): QuoteRequestData {
  const base = createEmptyQuoteRequestData();
  if (!raw || typeof raw !== 'object') return base;

  const record = applyLegacyQuoteFields(raw as Record<string, unknown>);
  const type = normalizeQuoteType(record.type) ?? base.type;
  const legacyDeviceIds = resolveLegacyDeviceIds(record, type);

  const workItemsRaw = Array.isArray(record.workItems) ? record.workItems : [];
  const materialsRaw = Array.isArray(record.materials) ? record.materials : [];
  const linesRaw = Array.isArray(record.lines) ? record.lines : [];

  let workItems: QuoteWorkItem[];
  if (Array.isArray(record.workItems)) {
    workItems =
      workItemsRaw.length > 0
        ? workItemsRaw.map((entry, index) => {
            const row = entry as Record<string, unknown>;
            return createEmptyWorkItem({
              id: typeof row.id === 'string' ? row.id : `work-${index}`,
              description: typeof row.description === 'string' ? row.description : 'Työ',
              hours: Number(row.hours) || 0,
              pricePerHour: Number(row.pricePerHour) || 65,
              equipmentId: typeof row.equipmentId === 'string' ? row.equipmentId : undefined,
              equipmentName: typeof row.equipmentName === 'string' ? row.equipmentName : undefined,
              materials: normalizeWorkItemMaterials(row.materials),
            });
          })
        : [];
  } else if (linesRaw.length > 0) {
    workItems = linesRaw.map((entry, index) => {
      const row = entry as Record<string, unknown>;
      return createEmptyWorkItem({
        id: typeof row.id === 'string' ? row.id : `work-${index}`,
        description: typeof row.description === 'string' ? row.description : '',
        hours: Number(row.qty) || 1,
        pricePerHour: Number(row.unitPrice) || 0,
        equipmentId: typeof row.equipmentId === 'string' ? row.equipmentId : undefined,
        equipmentName: typeof row.equipmentName === 'string' ? row.equipmentName : undefined,
      });
    });
  } else {
    workItems = defaultWorkItemsForType(type);
  }

  let materials: QuoteMaterial[] = materialsRaw.map((entry, index) => {
    const row = entry as Record<string, unknown>;
    return createEmptyMaterial({
      id: typeof row.id === 'string' ? row.id : `mat-${index}`,
      name: typeof row.name === 'string' ? row.name : '',
      quantity: Number(row.quantity) || 0,
      purchasePrice: Number(row.purchasePrice) || 0,
      marginPercent: Number(row.marginPercent) || 0,
      sellPrice: Number(row.sellPrice) || 0,
    });
  });

  if (isRepairQuoteType(type)) {
    const nestedMaterialCount = workItems.reduce((sum, item) => sum + item.materials.length, 0);
    if (materials.length > 0 && nestedMaterialCount === 0) {
      workItems = workItems.map((item, index) =>
        index === 0 ? { ...item, materials: [...materials] } : item,
      );
      materials = [];
    }
    workItems = workItems.map((item) => ({ ...item, materials: item.materials ?? [] }));
  }

  const lines: QuoteLine[] = linesRaw.map((entry, index) => {
    const line = entry as Record<string, unknown>;
    return createEmptyQuoteLine({
      id: typeof line.id === 'string' ? line.id : `line-${index}`,
      description: typeof line.description === 'string' ? line.description : '',
      qty: Number(line.qty) || 0,
      unitPrice: Number(line.unitPrice) || 0,
      unit: typeof line.unit === 'string' && line.unit.trim() ? line.unit : 'kpl',
      equipmentId: typeof line.equipmentId === 'string' ? line.equipmentId : undefined,
      equipmentName: typeof line.equipmentName === 'string' ? line.equipmentName : undefined,
    });
  });

  return normalizePumpDeviceSelection({
    ...base,
    type,
    introText: typeof record.introText === 'string' ? record.introText : base.introText,
    notes: typeof record.notes === 'string' ? record.notes : '',
    validUntil: typeof record.validUntil === 'string' ? record.validUntil : base.validUntil,
    brandMode: normalizeBrandMode(record.brandMode),
    paymentTermsText:
      typeof record.paymentTermsText === 'string' ? record.paymentTermsText : base.paymentTermsText,
    deliveryTermsText:
      typeof record.deliveryTermsText === 'string' ? record.deliveryTermsText : base.deliveryTermsText,
    customerPhone: typeof record.customerPhone === 'string' ? record.customerPhone : '',
    customerEmail: typeof record.customerEmail === 'string' ? record.customerEmail : '',
    customerContactPerson:
      typeof record.customerContactPerson === 'string' ? record.customerContactPerson : '',
    buildingType: typeof record.buildingType === 'string' ? record.buildingType : base.buildingType,
    heatedArea: readStoredNumber(record.heatedArea, base.heatedArea),
    roomHeight: readStoredNumber(record.roomHeight, base.roomHeight),
    buildingYear: readStoredNumber(record.buildingYear, base.buildingYear),
    region: normalizeRegion(record.region) ?? base.region,
    projectType: normalizeProjectType(record.projectType) ?? base.projectType,
    heatingSystemType:
      typeof record.heatingSystemType === 'string' ? record.heatingSystemType : base.heatingSystemType,
    heatingSystemTemp: Number(record.heatingSystemTemp) || base.heatingSystemTemp,
    domesticHotWater: record.domesticHotWater !== false,
    householdSize: Number(record.householdSize) || base.householdSize,
    desiredTemperature: Number(record.desiredTemperature) || base.desiredTemperature,
    currentHeating: typeof record.currentHeating === 'string' ? record.currentHeating : base.currentHeating,
    previousConsumption: Number(record.previousConsumption) || 0,
    previousConsumptionUnit:
      record.previousConsumptionUnit === 'kwh' ? 'kwh' : base.previousConsumptionUnit,
    deviceBrand: typeof record.deviceBrand === 'string' ? record.deviceBrand : '',
    deviceModel: typeof record.deviceModel === 'string' ? record.deviceModel : '',
    faultDescription: typeof record.faultDescription === 'string' ? record.faultDescription : '',
    situationReportEnabled: record.situationReportEnabled === true,
    situationReportTitle:
      typeof record.situationReportTitle === 'string'
        ? record.situationReportTitle
        : base.situationReportTitle,
    situationReportText:
      typeof record.situationReportText === 'string' ? record.situationReportText : '',
    workItems,
    materials,
    laborHours: Number(record.laborHours) || 0,
    laborRate: Number(record.laborRate) || 65,
    travelCost: 0,
    travelKmEnabled: normalizeTravelKmEnabled(record, type),
    travelKmDistance: normalizeTravelKmDistance(record, type),
    travelKmRate: normalizeTravelKmRate(record),
    quoteTermsText: normalizeQuoteTermsText(record, type),
    quoteTermsPrint: normalizeQuoteTermsPrint(record),
    quoteVatProfile:
      record.quoteVatProfile === 'consumer' || record.quoteVatProfile === 'business'
        ? record.quoteVatProfile
        : inferQuoteVatProfile(record.vatRate),
    vatRate: vatRateForQuoteProfile(
      record.quoteVatProfile === 'consumer' || record.quoteVatProfile === 'business'
        ? record.quoteVatProfile
        : inferQuoteVatProfile(record.vatRate),
    ),
    deviceDiscountPercent: Number(record.deviceDiscountPercent) || 0,
    deviceMarginPercent: Number(record.deviceMarginPercent) || 25,
    devicePurchaseOverrideNet:
      record.devicePurchaseOverrideNet == null ? null : Number(record.devicePurchaseOverrideNet) || 0,
    deviceSaleOverrideNet:
      record.deviceSaleOverrideNet == null ? null : Number(record.deviceSaleOverrideNet) || 0,
    selectedDeviceId: normalizeSelectedDeviceId(record, legacyDeviceIds),
    altDevice1Id: legacyDeviceIds.altDevice1Id,
    altDevice2Id: legacyDeviceIds.altDevice2Id,
    altDevice1DiscountPercent: Number(record.altDevice1DiscountPercent) || 0,
    altDevice1MarginPercent: Number(record.altDevice1MarginPercent) || 25,
    altDevice2DiscountPercent: Number(record.altDevice2DiscountPercent) || 0,
    altDevice2MarginPercent: Number(record.altDevice2MarginPercent) || 25,
    optionAGood: typeof record.optionAGood === 'string' ? record.optionAGood : '',
    optionABad: typeof record.optionABad === 'string' ? record.optionABad : '',
    optionBGood: typeof record.optionBGood === 'string' ? record.optionBGood : '',
    optionBBad: typeof record.optionBBad === 'string' ? record.optionBBad : '',
    optionCGood: typeof record.optionCGood === 'string' ? record.optionCGood : '',
    optionCBad: typeof record.optionCBad === 'string' ? record.optionCBad : '',
    oilBoilerRemoval: record.oilBoilerRemoval === true,
    oilTankEmptying: record.oilTankEmptying === true,
    overallDiscountPercent: Number(record.overallDiscountPercent) || 0,
    vilpBrandChoice: typeof record.vilpBrandChoice === 'string' ? record.vilpBrandChoice : '',
    vilpOutdoorModel: typeof record.vilpOutdoorModel === 'string' ? record.vilpOutdoorModel : '',
    vilpIndoorModel: typeof record.vilpIndoorModel === 'string' ? record.vilpIndoorModel : '',
    vilpIndoorConfig: normalizeVilpIndoorConfig(record.vilpIndoorConfig),
    vilpSeries: typeof record.vilpSeries === 'string' ? record.vilpSeries : '',
    vilpTankLiters: normalizeVilpTankLiters(record.vilpTankLiters),
    vilpZones: Number(record.vilpZones) === 2 ? 2 : 1,
    vilpCooling: record.vilpCooling !== false,
    iilpPurpose: record.iilpPurpose === 'cooling' ? 'cooling' : 'cooling_heating',
    iilpLaborPricingMode: normalizeIilpLaborPricingMode(record),
    iilpBaseInstallLaborGross: readStoredNumber(record.iilpBaseInstallLaborGross, base.iilpBaseInstallLaborGross),
    iilpBaseInstallMaterialsGross: readStoredNumber(
      record.iilpBaseInstallMaterialsGross,
      base.iilpBaseInstallMaterialsGross,
    ),
    iilpDeviceSelectionNote:
      typeof record.iilpDeviceSelectionNote === 'string' ? record.iilpDeviceSelectionNote : '',
    optionalItems: normalizeOptionalItems(record.optionalItems, type),
    iilpIndoorPlacement:
      typeof record.iilpIndoorPlacement === 'string' ? record.iilpIndoorPlacement : '',
    iilpOutdoorPlacement:
      typeof record.iilpOutdoorPlacement === 'string' ? record.iilpOutdoorPlacement : '',
    iilpPipeLengthM: Number(record.iilpPipeLengthM) || 0,
    iilpElectricalNotes:
      typeof record.iilpElectricalNotes === 'string' ? record.iilpElectricalNotes : '',
    iilpCondensateNotes:
      typeof record.iilpCondensateNotes === 'string' ? record.iilpCondensateNotes : '',
    iilpEnergySavingsText:
      typeof record.iilpEnergySavingsText === 'string' ? record.iilpEnergySavingsText : '',
    siteConfigConfirmed: record.siteConfigConfirmed === true,
    acceptedSiteDefaults: normalizeAcceptedSiteDefaults(record.acceptedSiteDefaults),
    lines,
    legacyCustomerName:
      typeof record.legacyCustomerName === 'string' ? record.legacyCustomerName : undefined,
  });
}

function readStoredNumber(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeAcceptedSiteDefaults(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function normalizeSelectedDeviceId(
  record: Record<string, unknown>,
  legacyIds: ReturnType<typeof resolveLegacyDeviceIds>,
): string {
  const raw = typeof record.selectedDeviceId === 'string' ? record.selectedDeviceId.trim() : '';
  if (raw) return raw;
  const legacy = legacyIds.selectedDeviceId?.trim() ?? '';
  return legacy || '';
}

export function normalizePumpDeviceSelection(data: QuoteRequestData): QuoteRequestData {
  if (!isPumpQuoteType(data.type)) return data;

  const existingId = data.selectedDeviceId?.trim() ?? '';
  if (existingId) {
    const existing = findDeviceById(existingId);
    if (existing) {
      return {
        ...data,
        selectedDeviceId: existing.id,
        deviceBrand: data.deviceBrand || existing.brand,
        deviceModel: data.deviceModel || existing.model,
        vilpBrandChoice:
          data.type === 'ilma-ilma' && !data.vilpBrandChoice ? existing.brand : data.vilpBrandChoice,
      };
    }
  }

  const needKw = computePumpSizingNeedKw(data);
  const resolved = resolveQuoteMainDeviceForTotals(data, needKw);
  if (!resolved) return data;

  return {
    ...data,
    selectedDeviceId: resolved.id,
    deviceBrand: data.deviceBrand || resolved.brand,
    deviceModel: data.deviceModel || resolved.model,
    vilpBrandChoice:
      data.type === 'ilma-ilma' && !data.vilpBrandChoice ? resolved.brand : data.vilpBrandChoice,
  };
}

/** Normalisoi laitteen valinta ja IILP-urakan työrivit ennen tallennusta. */
export function prepareQuoteRequestDataForSave(data: QuoteRequestData): QuoteRequestData {
  let next = normalizePumpDeviceSelection({ ...data });

  if (next.type === 'ilma-ilma' && resolveIilpLaborPricingMode(next) === 'urakka') {
    next = {
      ...next,
      laborHours: 0,
      workItems: next.workItems.map((item) =>
        Number(item.hours) > 0 ? { ...item, hours: 0 } : item,
      ),
    };
  }

  if (isPumpQuoteType(next.type)) {
    const device = findDeviceById(next.selectedDeviceId)
      ?? resolveQuoteMainDeviceForTotals(next, computePumpSizingNeedKw(next));
    if (device) {
      next = {
        ...next,
        selectedDeviceId: device.id,
        deviceBrand: device.brand,
        deviceModel: device.model,
        ...(next.type === 'ilma-ilma' ? { vilpBrandChoice: next.vilpBrandChoice || device.brand } : {}),
      };
    }
  }

  next = {
    ...next,
    travelCost: 0,
    ...(next.travelKmEnabled
      ? {}
      : {
          travelKmEnabled: false,
          travelKmDistance: 0,
        }),
  };

  return next;
}

function normalizeIilpLaborPricingMode(record: Record<string, unknown>): QuoteRequestData['iilpLaborPricingMode'] {
  if (record.iilpLaborPricingMode === 'tuntityo' || record.iilpLaborPricingMode === 'urakka') {
    return record.iilpLaborPricingMode;
  }
  return record.iilpBaseInstallEnabled === false ? 'tuntityo' : 'urakka';
}

function normalizeQuoteTermsPrint(record: Record<string, unknown>): QuoteTermsPrintFlags {
  const raw = record.quoteTermsPrint;
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_QUOTE_TERMS_PRINT };
  const row = raw as Record<string, unknown>;
  return {
    baseInstall: row.baseInstall !== false,
    warranty: row.warranty !== false,
    commissioning: row.commissioning !== false,
    operationMaintenance: row.operationMaintenance !== false,
    extraWork: row.extraWork !== false,
    general: row.general !== false,
  };
}

function normalizeTravelKmRate(record: Record<string, unknown>): number {
  const rate = Number(record.travelKmRate);
  return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_TRAVEL_KM_RATE;
}

function normalizeTravelKmEnabled(record: Record<string, unknown>, type: QuoteType): boolean {
  if (!quoteUsesTravelCost(type)) return false;
  if (record.travelKmEnabled === true) return true;
  if (record.travelKmEnabled === false) return false;
  if ('travelKmEnabled' in record) return false;
  const legacyTravel = Number(record.travelCost) || 0;
  return legacyTravel > 0;
}

function normalizeTravelKmDistance(record: Record<string, unknown>, type: QuoteType): number {
  if (!quoteUsesTravelCost(type)) return 0;
  if (!normalizeTravelKmEnabled(record, type)) return 0;
  const explicit = Number(record.travelKmDistance);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const legacyTravel = Number(record.travelCost) || 0;
  if (legacyTravel > 0) {
    const rate = normalizeTravelKmRate(record);
    return Math.round((legacyTravel / rate) * 10) / 10;
  }
  return 0;
}

function normalizeQuoteTermsText(record: Record<string, unknown>, type: QuoteType): string {
  if (typeof record.quoteTermsText === 'string' && record.quoteTermsText.trim()) {
    return record.quoteTermsText;
  }
  return type === 'ilma-ilma' ? DEFAULT_TERMATEK_IILP_QUOTE_TERMS : '';
}

function normalizeOptionalItems(raw: unknown, type: QuoteType): QuoteOptionalItem[] {
  if (Array.isArray(raw)) {
    return raw.map((entry, index) => {
      const row = entry as Record<string, unknown>;
      return createEmptyOptionalItem({
        id: typeof row.id === 'string' ? row.id : `opt-${index}`,
        description: typeof row.description === 'string' ? row.description : '',
        priceGross: Number(row.priceGross) || 0,
        enabled: row.enabled === true,
      });
    });
  }
  return type === 'ilma-ilma' ? defaultIilpOptionalItems() : [];
}

function normalizeVilpIndoorConfig(value: unknown): QuoteRequestData['vilpIndoorConfig'] {
  if (value === 'integroitu' || value === 'hydrobox' || value === 'ilman-varaa') return value;
  return 'ilman-varaa';
}

function normalizeVilpTankLiters(value: unknown): 0 | 180 | 230 {
  const n = Number(value);
  if (n === 180 || n === 230) return n;
  return 0;
}

function normalizeQuoteType(value: unknown): QuoteType | null {
  if (value === 'vesi-ilma' || value === 'ilma-ilma' || value === 'huolto') {
    return value;
  }
  if (value === 'korjaus' || value === 'asennus') {
    return 'huolto';
  }
  return null;
}

function normalizeRegion(value: unknown): QuoteRequestData['region'] | null {
  if (value === 'pohjois' || value === 'keski' || value === 'etela') return value;
  return null;
}

function normalizeProjectType(value: unknown): QuoteRequestData['projectType'] | null {
  if (value === 'uudis' || value === 'korjaus' || value === 'rinnalle') return value;
  return null;
}

function normalizeBrandMode(value: unknown): QuoteBrandMode {
  if (value === 'auto' || value === 'own') return value;
  if (typeof value === 'string' && value.startsWith('partner:')) return value as QuoteBrandMode;
  return 'auto';
}

export function quoteLineTotal(line: QuoteLine): number {
  return Number(line.qty) * Number(line.unitPrice);
}

export function quoteLinesTotal(lines: QuoteLine[]): number {
  return lines.reduce((sum, line) => sum + quoteLineTotal(line), 0);
}

export {
  quoteRequestTitle,
  quoteRequestPageTitle,
  quoteRequestStoredTitle,
  resolveQuoteDisplayTitle,
  stripLegacyQuoteTitleSuffix,
  quoteCustomerNameForTitle,
} from './title';

export function partnerCompanyIdFromPartnership(
  partnership: Partnership,
  myCompanyId: string,
): string {
  return partnership.company_a_id === myCompanyId
    ? partnership.company_b_id
    : partnership.company_a_id;
}

export function resolveQuoteBrandingCompanyId(input: {
  brandMode: QuoteBrandMode;
  myCompanyId: string;
  ownerCompanyId: string;
  partnership: Partnership | null;
}): string {
  const { brandMode, myCompanyId, ownerCompanyId, partnership } = input;

  if (brandMode === 'own') return myCompanyId;

  if (brandMode.startsWith('partner:')) {
    return brandMode.slice('partner:'.length) || ownerCompanyId;
  }

  if (partnership) {
    const partnerCompanyId = partnerCompanyIdFromPartnership(partnership, myCompanyId);
    const perms = partnershipPermsActingOnOwner(partnership, myCompanyId, ownerCompanyId);
    if (perms.use_branding) return partnerCompanyId;
  }

  return ownerCompanyId;
}

export function brandModeOptions(input: {
  myCompanyId: string;
  myCompanyName: string;
  ownerCompanyId: string;
  partnerships: Partnership[];
}): { value: QuoteBrandMode; label: string }[] {
  const options: { value: QuoteBrandMode; label: string }[] = [
    { value: 'auto', label: 'Automaattinen (kumppanibrändi jos sallittu)' },
    { value: 'own', label: `Oma yritys (${input.myCompanyName})` },
  ];

  const seen = new Set<string>([input.myCompanyId]);
  for (const partnership of input.partnerships) {
    const partnerId = partnerCompanyIdFromPartnership(partnership, input.myCompanyId);
    if (seen.has(partnerId)) continue;
    seen.add(partnerId);
    options.push({
      value: `partner:${partnerId}`,
      label: partnership.partner_company.name,
    });
  }

  if (input.ownerCompanyId !== input.myCompanyId && !seen.has(input.ownerCompanyId)) {
    options.push({
      value: `partner:${input.ownerCompanyId}`,
      label: 'Rekisterin omistaja',
    });
  }

  return options;
}

export function syncCustomerFieldsToForm(
  form: QuoteRequestData,
  customer: { phone?: string | null; email?: string | null },
): QuoteRequestData {
  return {
    ...form,
    customerPhone: customer.phone ?? form.customerPhone,
    customerEmail: customer.email ?? form.customerEmail,
  };
}
