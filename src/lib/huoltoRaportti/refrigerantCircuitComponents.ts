import type { HuoltoInspectionStatus } from './huoltoInspectionStatus';
import type { RefrigerantCircuitComponent, RefrigerantCircuitData } from './types';

export type RefrigerantCircuitComponentPresetType =
  | 'paisuntaventtiili'
  | 'magneettiventtiili'
  | 'nestelasi'
  | 'kuivain'
  | 'imusuodatin'
  | 'lauhdutimenTalvivarustus'
  | 'tarinavaimennin';

export type RefrigerantCircuitComponentType = RefrigerantCircuitComponentPresetType | 'custom';

export const REFRIGERANT_CIRCUIT_COMPONENT_PRESETS: Array<{
  type: RefrigerantCircuitComponentPresetType;
  label: string;
}> = [
  { type: 'paisuntaventtiili', label: 'Paisuntaventtiili' },
  { type: 'magneettiventtiili', label: 'Magneettiventtiili' },
  { type: 'nestelasi', label: 'Nestelasi' },
  { type: 'kuivain', label: 'Kuivain' },
  { type: 'imusuodatin', label: 'Imusuodatin' },
  { type: 'lauhdutimenTalvivarustus', label: 'Lauhdutimen talvivarustus' },
  { type: 'tarinavaimennin', label: 'Tärinänvaimennus' },
];

export function refrigerantCircuitComponentLabel(component: RefrigerantCircuitComponent): string {
  if (component.type === 'custom') {
    return String(component.customName ?? '').trim() || 'Muu komponentti';
  }
  return (
    REFRIGERANT_CIRCUIT_COMPONENT_PRESETS.find((preset) => preset.type === component.type)?.label
    ?? component.type
  );
}

export function createRefrigerantCircuitComponentId(): string {
  return `komp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyRefrigerantCircuitComponent(
  type: RefrigerantCircuitComponentType,
  customName = '',
): RefrigerantCircuitComponent {
  return {
    id: createRefrigerantCircuitComponentId(),
    type,
    customName: type === 'custom' ? customName : '',
    valmistaja: '',
    malli: '',
    kommentti: '',
    tila: null,
  };
}

function componentHasData(component: RefrigerantCircuitComponent): boolean {
  return Boolean(
    String(component.valmistaja ?? '').trim()
    || String(component.malli ?? '').trim()
    || String(component.kommentti ?? '').trim()
    || (component.type === 'custom' && String(component.customName ?? '').trim()),
  );
}

export function refrigerantCircuitComponentStatus(
  component: RefrigerantCircuitComponent,
): HuoltoInspectionStatus {
  if (!componentHasData(component)) return 'na';
  return component.tila ?? null;
}

export function refrigerantCircuitComponentSubtitle(component: RefrigerantCircuitComponent): string {
  return [component.valmistaja, component.malli]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join(' · ');
}

function legacyExpansionValveComponent(data: RefrigerantCircuitData): RefrigerantCircuitComponent | null {
  if (
    !String(data.paisuntaventtiiliTyyppi ?? '').trim()
    && !String(data.paisuntaventtiiliValmistaja ?? '').trim()
    && !String(data.paisuntaventtiiliMalli ?? '').trim()
    && !String(data.paisuntaventtiiliHuomio ?? '').trim()
  ) {
    return null;
  }
  return {
    id: 'legacy-paisuntaventtiili',
    type: 'paisuntaventtiili',
    valmistaja: data.paisuntaventtiiliValmistaja ?? '',
    malli: data.paisuntaventtiiliMalli ?? '',
    kommentti: data.paisuntaventtiiliHuomio ?? '',
    tila: data.paisuntaventtiiliTila ?? null,
    paisuntaventtiiliTyyppi: data.paisuntaventtiiliTyyppi ?? '',
    paisuntaventtiiliMuu: data.paisuntaventtiiliMuu ?? '',
  };
}

function legacyMagnetValveComponent(data: RefrigerantCircuitData): RefrigerantCircuitComponent | null {
  if (
    !String(data.magneettiventtiiliValmistaja ?? '').trim()
    && !String(data.magneettiventtiiliMalli ?? '').trim()
    && !String(data.magneettiventtiiliHuomio ?? '').trim()
  ) {
    return null;
  }
  return {
    id: 'legacy-magneettiventtiili',
    type: 'magneettiventtiili',
    valmistaja: data.magneettiventtiiliValmistaja ?? '',
    malli: data.magneettiventtiiliMalli ?? '',
    kommentti: data.magneettiventtiiliHuomio ?? '',
    tila: data.magneettiventtiiliTila ?? null,
    magneettiventtiiliTestattu: !!data.magneettiventtiiliTestattu,
  };
}

function legacyDryerComponent(data: RefrigerantCircuitData): RefrigerantCircuitComponent | null {
  if (
    !String(data.kuivainValmistaja ?? '').trim()
    && !String(data.kuivainMalli ?? '').trim()
    && !String(data.kuivainLisatieto ?? '').trim()
    && !String(data.kuivainKivienMaara ?? '').trim()
  ) {
    return null;
  }
  return {
    id: 'legacy-kuivain',
    type: 'kuivain',
    valmistaja: data.kuivainValmistaja ?? '',
    malli: data.kuivainMalli ?? '',
    kommentti: data.kuivainLisatieto ?? '',
    tila: data.kuivainTila ?? null,
    kuivainKivienMaara: data.kuivainKivienMaara ?? '',
  };
}

function legacySightGlassComponent(data: RefrigerantCircuitData): RefrigerantCircuitComponent | null {
  if (!data.nestelasiKuiva) return null;
  return {
    id: 'legacy-nestelasi',
    type: 'nestelasi',
    valmistaja: '',
    malli: '',
    kommentti: 'Nestelasi kuiva',
    tila: 'ok',
    nestelasiKuiva: true,
  };
}

export function migrateLegacyCircuitComponents(data: RefrigerantCircuitData): RefrigerantCircuitComponent[] {
  if (Array.isArray(data.kompponentit) && data.kompponentit.length > 0) {
    return data.kompponentit.map((component) => ({
      ...createEmptyRefrigerantCircuitComponent('custom'),
      ...component,
      id: component.id || createRefrigerantCircuitComponentId(),
    }));
  }

  const legacy = [
    legacyExpansionValveComponent(data),
    legacyMagnetValveComponent(data),
    legacySightGlassComponent(data),
    legacyDryerComponent(data),
  ].filter((component): component is RefrigerantCircuitComponent => component != null);

  return legacy;
}

export function ensureRefrigerantCircuitComponents(data: RefrigerantCircuitData): RefrigerantCircuitComponent[] {
  return migrateLegacyCircuitComponents(data);
}

function applyLegacyComponentPatch(
  data: RefrigerantCircuitData,
  component: RefrigerantCircuitComponent,
): Partial<RefrigerantCircuitData> {
  if (component.type === 'paisuntaventtiili') {
    return {
      paisuntaventtiiliTyyppi: component.paisuntaventtiiliTyyppi ?? data.paisuntaventtiiliTyyppi ?? '',
      paisuntaventtiiliMuu: component.paisuntaventtiiliMuu ?? data.paisuntaventtiiliMuu ?? '',
      paisuntaventtiiliValmistaja: component.valmistaja ?? '',
      paisuntaventtiiliMalli: component.malli ?? '',
      paisuntaventtiiliHuomio: component.kommentti ?? '',
      paisuntaventtiiliTila: component.tila ?? null,
    };
  }
  if (component.type === 'magneettiventtiili') {
    return {
      magneettiventtiiliValmistaja: component.valmistaja ?? '',
      magneettiventtiiliMalli: component.malli ?? '',
      magneettiventtiiliHuomio: component.kommentti ?? '',
      magneettiventtiiliTila: component.tila ?? null,
      magneettiventtiiliTestattu: component.magneettiventtiiliTestattu ?? false,
    };
  }
  if (component.type === 'kuivain') {
    return {
      kuivainValmistaja: component.valmistaja ?? '',
      kuivainMalli: component.malli ?? '',
      kuivainLisatieto: component.kommentti ?? '',
      kuivainTila: component.tila ?? null,
      kuivainKivienMaara: component.kuivainKivienMaara ?? data.kuivainKivienMaara ?? '',
      kuivainOK: component.tila === 'ok',
    };
  }
  if (component.type === 'nestelasi') {
    return {
      nestelasiKuiva: component.nestelasiKuiva ?? componentHasData(component),
    };
  }
  return {};
}

export function syncLegacyFieldsFromComponents(data: RefrigerantCircuitData): RefrigerantCircuitData {
  const kompponentit = ensureRefrigerantCircuitComponents(data);
  let next: RefrigerantCircuitData = { ...data, kompponentit };

  for (const component of kompponentit) {
    next = { ...next, ...applyLegacyComponentPatch(next, component) };
  }

  const hasMagnet = kompponentit.some((component) => component.type === 'magneettiventtiili');
  const hasExpansion = kompponentit.some((component) => component.type === 'paisuntaventtiili');
  const hasDryer = kompponentit.some((component) => component.type === 'kuivain');
  const hasSightGlass = kompponentit.some((component) => component.type === 'nestelasi');

  if (!hasExpansion) {
    next = {
      ...next,
      paisuntaventtiiliTyyppi: '',
      paisuntaventtiiliMuu: '',
      paisuntaventtiiliValmistaja: '',
      paisuntaventtiiliMalli: '',
      paisuntaventtiiliHuomio: '',
      paisuntaventtiiliTila: 'na',
    };
  }
  if (!hasMagnet) {
    next = {
      ...next,
      magneettiventtiiliValmistaja: '',
      magneettiventtiiliMalli: '',
      magneettiventtiiliHuomio: '',
      magneettiventtiiliTila: 'na',
      magneettiventtiiliTestattu: false,
    };
  }
  if (!hasDryer) {
    next = {
      ...next,
      kuivainValmistaja: '',
      kuivainMalli: '',
      kuivainLisatieto: '',
      kuivainKivienMaara: '',
      kuivainTila: 'na',
      kuivainOK: false,
    };
  }
  if (!hasSightGlass) {
    next = { ...next, nestelasiKuiva: false };
  }

  return next;
}

export function updateRefrigerantCircuitComponents(
  data: RefrigerantCircuitData,
  kompponentit: RefrigerantCircuitComponent[],
): RefrigerantCircuitData {
  return syncLegacyFieldsFromComponents({ ...data, kompponentit });
}

export function circuitComponentsInspectionStatuses(
  data: RefrigerantCircuitData,
): HuoltoInspectionStatus[] {
  if (!data.onKaytossa) return [];
  return ensureRefrigerantCircuitComponents(data)
    .map((component) => refrigerantCircuitComponentStatus(component))
    .filter((status) => status !== 'na');
}
