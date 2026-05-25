import type { QuoteProjectType, QuoteRegion, QuoteRequestData, QuoteType } from './types';

export const QUOTE_TYPE_LABELS: Record<QuoteType, string> = {
  'vesi-ilma': 'Vesi-ilmalämpöpumppu',
  'ilma-ilma': 'Ilmalämpöpumppu',
  huolto: 'Kylmälaite huolto',
  korjaus: 'Kylmälaitteen korjaus',
  asennus: 'Kylmälaitteen asennus',
};

export const QUOTE_REGION_LABELS: Record<QuoteRegion, string> = {
  pohjois: 'Pohjois-Suomi',
  keski: 'Keskisuomi',
  etela: 'Etelä-Suomi',
};

export const QUOTE_PROJECT_TYPE_LABELS: Record<QuoteProjectType, string> = {
  uudis: 'Uudisrakennus',
  korjaus: 'Korjaus (korvaa vanhan)',
  rinnalle: 'Asennus vanhan rinnalle',
};

export const BUILDING_TYPE_OPTIONS = [
  { value: 'omakotitalo', label: 'Omakotitalo' },
  { value: 'paritalo', label: 'Paritalo' },
  { value: 'rivitalo', label: 'Rivitalo' },
  { value: 'kerrostalo', label: 'Kerrostalo' },
  { value: 'liike', label: 'Liikekiinteistö' },
  { value: 'maatalous', label: 'Maatalous' },
];

export const HEATING_SYSTEM_OPTIONS = [
  { value: 'lattialammitys_45', label: 'Lattialämmitys (max 45°C)' },
  { value: 'patteri_45', label: 'Patteriverkosto (max 45°C)' },
  { value: 'patteri_65', label: 'Patteriverkosto (max 65°C)' },
  { value: 'monipiirinen', label: 'Moni piirinen (max 45°C)' },
  { value: 'radiaattorit', label: 'Radiaattorit' },
];

export const CURRENT_HEATING_OPTIONS = [
  'sähkö',
  'öljy',
  'puu',
  'kaukolämpö',
  'maalämpö',
  'ilmalämpöpumppu',
  'vesi-ilmalämpöpumppu',
  'muu',
];

export const QUOTE_SECTION_LABELS = {
  asiakas: 'Asiakas',
  kohde: 'Kohde & laskenta',
  tyot: 'Työt & tarvikkeet',
  hinnoittelu: 'Hinnoittelu',
} as const;

export const VILP_BRAND_OPTIONS: Array<{ value: QuoteRequestData['vilpBrandChoice']; label: string }> = [
  { value: '', label: '— Valitse valmistaja —' },
  { value: 'Daikin', label: 'Daikin' },
  { value: 'Inventor', label: 'Inventor' },
  { value: 'Samsung', label: 'Samsung' },
];

export const IILP_PURPOSE_LABELS: Record<QuoteRequestData['iilpPurpose'], string> = {
  cooling: 'Vain jäähdytys / viilennys',
  cooling_heating: 'Jäähdytys + lämmitys',
};

export const DEVICE_REGISTRY_BRANDS = ['Daikin', 'Inventor', 'Samsung'] as const;

export const quoteTemplates: Record<QuoteType, Partial<QuoteRequestData>> = {
  'vesi-ilma': { laborHours: 16, laborRate: 65, travelCost: 50, vatRate: 25.5 },
  'ilma-ilma': {
    laborHours: 0,
    laborRate: 65,
    travelCost: 50,
    vatRate: 25.5,
    iilpBaseInstallEnabled: true,
    iilpBaseInstallLaborGross: 890,
    iilpBaseInstallMaterialsGross: 500,
  },
  huolto: { laborHours: 2, laborRate: 65, travelCost: 50, vatRate: 25.5 },
  korjaus: { laborHours: 4, laborRate: 65, travelCost: 50, vatRate: 25.5 },
  asennus: { laborHours: 12, laborRate: 65, travelCost: 50, vatRate: 25.5 },
};

export function isPumpQuoteType(type: QuoteType): boolean {
  return type === 'vesi-ilma' || type === 'ilma-ilma';
}

export function isRepairQuoteType(type: QuoteType): boolean {
  return type === 'huolto' || type === 'korjaus' || type === 'asennus';
}
