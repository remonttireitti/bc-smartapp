import type { WorkReportDailyLog } from '../types';
import type {
  CustomerPrintQuantitySettings,
  CustomerPrintQuantityUnit,
} from './workReportCustomerPrintSettings';

function formatQtyNumber(value: number, decimals = 2): string {
  const rounded = Math.round(value * 10 ** decimals) / 10 ** decimals;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(decimals).replace(/\.?0+$/, '');
}

export function resolveCustomerPrintExpenseUnit(
  expenseType: string,
  settings: CustomerPrintQuantitySettings,
): CustomerPrintQuantityUnit {
  return settings.expenseUnits[expenseType] ?? settings.defaultExpenseUnit;
}

export function formatCustomerPrintQuantity(
  qty: number,
  unit: CustomerPrintQuantityUnit,
  decimals?: number,
): string {
  if (!(qty > 0) && unit !== 'urakka' && unit !== 'erä') return '—';
  if (unit === 'urakka' || unit === 'erä') return unit;
  const unitDecimals =
    decimals ?? (unit === 'kg' ? 3 : unit === 'h' ? 2 : unit === 'km' ? 1 : 2);
  return `${formatQtyNumber(qty, unitDecimals)} ${unit}`;
}

export function formatCustomerPrintExpenseQuantity(
  expenseType: string,
  qty: number,
  settings: CustomerPrintQuantitySettings,
): string {
  const unit = resolveCustomerPrintExpenseUnit(expenseType, settings);
  if (expenseType === 'km') {
    return formatCustomerPrintQuantity(qty, 'km', 1);
  }
  return formatCustomerPrintQuantity(qty, unit);
}

export function formatCustomerPrintRefrigerantQuantity(qtyKg: number): string {
  return formatCustomerPrintQuantity(qtyKg, 'kg', 3);
}

export function formatCustomerPrintHourSummary(
  log: WorkReportDailyLog,
  settings: CustomerPrintQuantitySettings,
): string | null {
  if (!settings.showQuantities || !settings.showHourQuantities) return null;

  switch (log.entry_type) {
    case 'regular':
      return Number(log.hours_regular) > 0
        ? formatCustomerPrintQuantity(Number(log.hours_regular), 'h')
        : null;
    case 'overtime':
      return Number(log.hours_overtime) > 0
        ? `${formatCustomerPrintQuantity(Number(log.hours_overtime), 'h')} ylityö`
        : null;
    case 'regular_and_overtime': {
      const parts: string[] = [];
      if (Number(log.hours_regular) > 0) {
        parts.push(formatCustomerPrintQuantity(Number(log.hours_regular), 'h'));
      }
      if (Number(log.hours_overtime) > 0) {
        parts.push(`${formatCustomerPrintQuantity(Number(log.hours_overtime), 'h')} ylityö`);
      }
      return parts.length > 0 ? parts.join(' + ') : null;
    }
    case 'on_call':
      return Number(log.hours_on_call) > 0
        ? `${formatCustomerPrintQuantity(Number(log.hours_on_call), 'h')} päivystys`
        : null;
    case 'fixed_price':
      return 'urakka';
    default:
      return null;
  }
}
