import type { DailyExpenseLine } from '../types';

export function isExpenseWarehousePurchaseLine(
  line: Pick<DailyExpenseLine, 'expense_type' | 'warehouse_company_id' | 'qty' | 'unit_price'>,
): boolean {
  if (line.expense_type !== 'warehouse_purchase') return false;
  if (!line.warehouse_company_id) return false;
  const qty = Number(line.qty) || 0;
  const unitPrice = Number(line.unit_price) || 0;
  return qty > 0 && unitPrice > 0;
}

export function isExpenseWarehouseCostLine(
  line: Pick<DailyExpenseLine, 'expense_type' | 'warehouse_company_id' | 'qty' | 'unit_price'>,
  viewerCompanyId: string | null | undefined,
): boolean {
  if (!viewerCompanyId || !line.warehouse_company_id) return false;
  if (line.warehouse_company_id !== viewerCompanyId) return false;
  return isExpenseWarehousePurchaseLine(line);
}

export function expenseWarehouseCostUnitPrice(
  line: Pick<DailyExpenseLine, 'unit_price'>,
): number {
  return Number(line.unit_price) || 0;
}

export function formatExpenseWarehouseCostLabel(
  line: Pick<DailyExpenseLine, 'description' | 'qty' | 'unit_price'>,
  deducted: boolean,
): string {
  const qty = Number(line.qty) || 0;
  const unit = expenseWarehouseCostUnitPrice(line);
  const total = Math.round(qty * unit * 100) / 100;
  const desc = line.description.trim() || 'Työkalu/varaosa';
  const status = deducted ? ' · vähennetty' : ' · ei vielä vähennetty';
  return `Varastosta ${desc} · ${qty} kpl × ${formatExpenseEuro(unit)} = ${formatExpenseEuro(total)}${status}`;
}

function formatExpenseEuro(amount: number): string {
  return `${amount.toFixed(2).replace('.', ',')} €`;
}

export function warehouseCompanyOptionsForReport(
  report: {
    owner_company_id: string;
    created_by_company_id: string;
    delegate_company_id: string | null;
    owner_company?: { name: string | null } | null;
    created_by_company?: { name: string | null } | null;
    delegate_company?: { name: string | null } | null;
  },
  ownCompanyId: string | null | undefined,
): { id: string; name: string }[] {
  const entries: { id: string; name: string }[] = [];
  const push = (id: string | null | undefined, name: string | null | undefined) => {
    if (!id || id === ownCompanyId) return;
    if (entries.some((entry) => entry.id === id)) return;
    entries.push({ id, name: name?.trim() || 'Yritys' });
  };
  push(report.owner_company_id, report.owner_company?.name);
  push(report.created_by_company_id, report.created_by_company?.name);
  push(report.delegate_company_id, report.delegate_company?.name);
  return entries;
}
