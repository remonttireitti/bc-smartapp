import type { QuoteMaterialRowKind } from './quoteRequest/types';
import {
  CUSTOMER_PRINT_QUANTITY_UNIT_OPTIONS,
  type CustomerPrintQuantityUnit,
} from './workReportCustomerPrintSettings';

export type QuoteCustomerPrintQuantitySettings = {
  showQuantities: boolean;
  showLaborQuantities: boolean;
  showSupplyQuantities: boolean;
  showExpenseQuantities: boolean;
  showDeviceQuantities: boolean;
  showWorkItemQuantities: boolean;
  defaultUnits: Partial<Record<QuoteMaterialRowKind, CustomerPrintQuantityUnit>>;
};

export const DEFAULT_QUOTE_CUSTOMER_PRINT_QUANTITY_SETTINGS: QuoteCustomerPrintQuantitySettings = {
  showQuantities: true,
  showLaborQuantities: true,
  showSupplyQuantities: true,
  showExpenseQuantities: true,
  showDeviceQuantities: true,
  showWorkItemQuantities: true,
  defaultUnits: {
    labor: 'h',
    supply: 'kpl',
    expense: 'kpl',
    device: 'kpl',
  },
};

export { CUSTOMER_PRINT_QUANTITY_UNIT_OPTIONS };

function parseBoolParam(value: string | null, fallback: boolean): boolean {
  if (value === '1' || value === 'true') return true;
  if (value === '0' || value === 'false') return false;
  return fallback;
}

function isUnit(value: string): value is CustomerPrintQuantityUnit {
  return CUSTOMER_PRINT_QUANTITY_UNIT_OPTIONS.some((option) => option.value === value);
}

export function parseQuoteCustomerPrintQuantitySettings(
  searchParams: URLSearchParams,
): QuoteCustomerPrintQuantitySettings {
  const defaults = DEFAULT_QUOTE_CUSTOMER_PRINT_QUANTITY_SETTINGS;
  const showQuantities = parseBoolParam(searchParams.get('maarat'), defaults.showQuantities);
  const base = showQuantities;
  const showLaborQuantities = parseBoolParam(searchParams.get('maarat_tyot'), base);
  const showSupplyQuantities = parseBoolParam(searchParams.get('maarat_tarvi'), base);
  const showExpenseQuantities = parseBoolParam(searchParams.get('maarat_kulut'), base);
  const showDeviceQuantities = parseBoolParam(searchParams.get('maarat_laite'), base);
  const showWorkItemQuantities = parseBoolParam(searchParams.get('maarat_tyorivit'), base);

  const defaultUnits = { ...defaults.defaultUnits };
  for (const kind of Object.keys(defaultUnits) as QuoteMaterialRowKind[]) {
    const override = searchParams.get(`yksikko_${kind}`);
    if (override && isUnit(override)) defaultUnits[kind] = override;
  }

  return {
    showQuantities,
    showLaborQuantities,
    showSupplyQuantities,
    showExpenseQuantities,
    showDeviceQuantities,
    showWorkItemQuantities,
    defaultUnits,
  };
}

export function serializeQuoteCustomerPrintQuantitySettings(
  settings: QuoteCustomerPrintQuantitySettings,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set('maarat', settings.showQuantities ? '1' : '0');
  if (!settings.showLaborQuantities) params.set('maarat_tyot', '0');
  if (!settings.showSupplyQuantities) params.set('maarat_tarvi', '0');
  if (!settings.showExpenseQuantities) params.set('maarat_kulut', '0');
  if (!settings.showDeviceQuantities) params.set('maarat_laite', '0');
  if (!settings.showWorkItemQuantities) params.set('maarat_tyorivit', '0');
  for (const [kind, unit] of Object.entries(settings.defaultUnits)) {
    const defaultUnit = DEFAULT_QUOTE_CUSTOMER_PRINT_QUANTITY_SETTINGS.defaultUnits[kind as QuoteMaterialRowKind];
    if (unit && unit !== defaultUnit) params.set(`yksikko_${kind}`, unit);
  }
  return params;
}

export function quoteCustomerPrintQuantitySettingsPath(
  quoteId: string,
  settings: QuoteCustomerPrintQuantitySettings,
): string {
  const params = serializeQuoteCustomerPrintQuantitySettings(settings);
  const query = params.toString();
  return query
    ? `/tarjouspyynnot/${quoteId}/tuloste?${query}`
    : `/tarjouspyynnot/${quoteId}/tuloste`;
}

export function quoteQuantityVisibleForKind(
  kind: QuoteMaterialRowKind,
  settings: QuoteCustomerPrintQuantitySettings,
): boolean {
  if (!settings.showQuantities) return false;
  if (kind === 'labor') return settings.showLaborQuantities;
  if (kind === 'supply') return settings.showSupplyQuantities;
  if (kind === 'expense') return settings.showExpenseQuantities;
  return settings.showDeviceQuantities;
}
