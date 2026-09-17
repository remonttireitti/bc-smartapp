import { resolveQuoteMaterialRowKind } from './quoteRequest/installationSupplies';
import type { QuoteMaterial } from './quoteRequest/types';
import type { QuoteCustomerPrintQuantitySettings } from './quoteCustomerPrintSettings';
import { quoteQuantityVisibleForKind } from './quoteCustomerPrintSettings';
import { formatCustomerPrintQuantity } from './workReportCustomerPrintQuantity';
import {
  CUSTOMER_PRINT_QUANTITY_UNIT_OPTIONS,
  type CustomerPrintQuantityUnit,
} from './workReportCustomerPrintSettings';

function isPrintUnit(value: string): value is CustomerPrintQuantityUnit {
  return CUSTOMER_PRINT_QUANTITY_UNIT_OPTIONS.some((option) => option.value === value);
}

export function resolveQuoteMaterialUnit(
  mat: QuoteMaterial,
  settings: QuoteCustomerPrintQuantitySettings,
): CustomerPrintQuantityUnit {
  if (mat.unit && isPrintUnit(mat.unit)) return mat.unit;
  const kind = resolveQuoteMaterialRowKind(mat);
  return settings.defaultUnits[kind] ?? (kind === 'labor' ? 'h' : 'kpl');
}

export function formatQuoteMaterialQtyLabel(
  mat: QuoteMaterial,
  settings: QuoteCustomerPrintQuantitySettings,
): string | null {
  const kind = resolveQuoteMaterialRowKind(mat);
  if (!quoteQuantityVisibleForKind(kind, settings)) return null;
  const qty = Number(mat.quantity) || 0;
  const unit = resolveQuoteMaterialUnit(mat, settings);
  if (unit === 'urakka' || unit === 'erä') return unit;
  return formatCustomerPrintQuantity(qty, unit);
}

export function formatQuoteWorkHoursQtyLabel(
  hours: number,
  settings: QuoteCustomerPrintQuantitySettings,
): string | null {
  if (!settings.showQuantities || !settings.showWorkItemQuantities) return null;
  return formatCustomerPrintQuantity(hours, 'h');
}

export function formatQuoteDeviceQtyLabel(
  qty: number,
  unit: CustomerPrintQuantityUnit | undefined,
  settings: QuoteCustomerPrintQuantitySettings,
): string | null {
  if (!settings.showQuantities || !settings.showDeviceQuantities) return null;
  const resolved = unit ?? settings.defaultUnits.device ?? 'kpl';
  if (resolved === 'urakka' || resolved === 'erä') return resolved;
  return formatCustomerPrintQuantity(qty > 0 ? qty : 1, resolved);
}
