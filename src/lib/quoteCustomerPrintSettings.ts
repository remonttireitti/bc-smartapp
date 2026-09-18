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
  /** Esittelyteksti (yläotsikon tagline) tulosteen fonttikoko px. */
  taglineFontSizePx: number;
  /** Kiitos-viestin / lopputekstin fonttikoko px. */
  closingFontSizePx: number;
};

export const QUOTE_PRINT_FONT_SIZE_OPTIONS = [9, 10, 11, 11.5, 12, 13, 14] as const;

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
  taglineFontSizePx: 11.5,
  closingFontSizePx: 11,
};

export { CUSTOMER_PRINT_QUANTITY_UNIT_OPTIONS };

export function quotePrintTypographyStyleAttr(
  settings?: Pick<QuoteCustomerPrintQuantitySettings, 'taglineFontSizePx' | 'closingFontSizePx'> | null,
): string {
  if (!settings) return '';
  const tagline = Number(settings.taglineFontSizePx);
  const closing = Number(settings.closingFontSizePx);
  if (!Number.isFinite(tagline) && !Number.isFinite(closing)) return '';
  const parts: string[] = [];
  if (Number.isFinite(tagline)) parts.push(`--quote-tagline-font-size:${tagline}px`);
  if (Number.isFinite(closing)) parts.push(`--quote-closing-font-size:${closing}px`);
  return parts.length ? ` style="${parts.join(';')}"` : '';
}

function parseBoolParam(value: string | null, fallback: boolean): boolean {
  if (value === '1' || value === 'true') return true;
  if (value === '0' || value === 'false') return false;
  return fallback;
}

function isUnit(value: string): value is CustomerPrintQuantityUnit {
  return CUSTOMER_PRINT_QUANTITY_UNIT_OPTIONS.some((option) => option.value === value);
}

function parseFontSizeParam(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed)) return fallback;
  if ((QUOTE_PRINT_FONT_SIZE_OPTIONS as readonly number[]).includes(parsed)) return parsed;
  if (parsed >= 8 && parsed <= 18) return parsed;
  return fallback;
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
    taglineFontSizePx: parseFontSizeParam(searchParams.get('fontti_esittely'), defaults.taglineFontSizePx),
    closingFontSizePx: parseFontSizeParam(searchParams.get('fontti_kiitos'), defaults.closingFontSizePx),
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
  if (settings.taglineFontSizePx !== DEFAULT_QUOTE_CUSTOMER_PRINT_QUANTITY_SETTINGS.taglineFontSizePx) {
    params.set('fontti_esittely', String(settings.taglineFontSizePx));
  }
  if (settings.closingFontSizePx !== DEFAULT_QUOTE_CUSTOMER_PRINT_QUANTITY_SETTINGS.closingFontSizePx) {
    params.set('fontti_kiitos', String(settings.closingFontSizePx));
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
