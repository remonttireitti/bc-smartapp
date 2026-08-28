import type { SupabaseClient } from '@supabase/supabase-js';

import { refrigerantIncludedInCustomerBilling } from './refrigerantInventory';
import {
  REFRIGERANT_CYLINDER_OWNERSHIP_LABELS,
  REFRIGERANT_SOURCE_LABELS,
  type RefrigerantSource,
  type RefrigerantSupplierPaidBy,
} from '../types/inventory';

export type RefrigerantPurchaseSaleKind = 'purchase' | 'sale';

export type RefrigerantPurchaseSaleRow = {
  id: string;
  kind: RefrigerantPurchaseSaleKind;
  date: string;
  work_report_id: string;
  work_report_title: string;
  customer_name: string;
  refrigerant_type: string;
  qty_kg: number;
  serial_number: string;
  ownership: string;
  source_label: string;
};

type RawLine = {
  id: string;
  work_report_id: string;
  source: RefrigerantSource;
  supplier_name: string | null;
  supplier_paid_by: RefrigerantSupplierPaidBy | null;
  bill_to_customer: boolean;
  warehouse_company_id: string | null;
  refrigerant_type: string;
  qty_kg: number;
  created_at: string;
  cylinder: { serial_number?: string | null; ownership_type?: string | null } | null;
  daily_log: { log_date: string } | { log_date: string }[] | null;
  work_report: {
    id: string;
    title: string | null;
    owner_company_id: string;
    customers: { name: string | null } | { name: string | null }[] | null;
  } | null;
};

const LINE_SELECT = `
  id,
  work_report_id,
  source,
  supplier_name,
  supplier_paid_by,
  bill_to_customer,
  warehouse_company_id,
  refrigerant_type,
  qty_kg,
  created_at,
  cylinder:refrigerant_cylinders(serial_number, ownership_type),
  daily_log:work_report_daily_logs!inner(log_date),
  work_report:work_reports!inner(
    id,
    title,
    owner_company_id,
    customers(name)
  )
`;

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function formatRefrigerantOwnershipLabel(ownershipType: string | null | undefined): string {
  if (ownershipType === 'owned') return REFRIGERANT_CYLINDER_OWNERSHIP_LABELS.owned;
  if (ownershipType === 'rental') return REFRIGERANT_CYLINDER_OWNERSHIP_LABELS.rental;
  return '—';
}

export function refrigerantPurchaseSaleSourceLabel(line: {
  kind: RefrigerantPurchaseSaleKind;
  source: RefrigerantSource;
  supplier_name: string | null;
}): string {
  if (line.kind === 'purchase') {
    const supplier = line.supplier_name?.trim();
    return supplier ? `Tukkuri: ${supplier}` : REFRIGERANT_SOURCE_LABELS.supplier;
  }
  return REFRIGERANT_SOURCE_LABELS[line.source] ?? line.source;
}

export function lineBelongsToWarehouseCompany(
  line: Pick<RawLine, 'warehouse_company_id' | 'work_report'>,
  companyId: string,
): boolean {
  const ownerCompanyId = line.work_report?.owner_company_id;
  if (ownerCompanyId === companyId) return true;
  return line.warehouse_company_id === companyId;
}

function createPurchaseSaleRow(line: RawLine, kind: RefrigerantPurchaseSaleKind): RefrigerantPurchaseSaleRow {
  const dailyLog = unwrapOne(line.daily_log);
  const workReport = line.work_report;
  const customer = unwrapOne(workReport?.customers ?? null);
  const cylinder = unwrapOne(line.cylinder);
  const qty = Number(line.qty_kg) || 0;

  return {
    id: `${kind}:${line.id}`,
    kind,
    date: dailyLog?.log_date ?? line.created_at.slice(0, 10),
    work_report_id: line.work_report_id,
    work_report_title: workReport?.title?.trim() || 'Työraportti',
    customer_name: customer?.name?.trim() || '—',
    refrigerant_type: line.refrigerant_type?.trim() || '—',
    qty_kg: qty,
    serial_number: cylinder?.serial_number?.trim() || '—',
    ownership: formatRefrigerantOwnershipLabel(cylinder?.ownership_type),
    source_label: refrigerantPurchaseSaleSourceLabel({
      kind,
      source: line.source,
      supplier_name: line.supplier_name,
    }),
  };
}

export function buildRefrigerantPurchaseSaleRows(
  lines: RawLine[],
  companyId: string,
): RefrigerantPurchaseSaleRow[] {
  const rows: RefrigerantPurchaseSaleRow[] = [];

  for (const line of lines) {
    if (!lineBelongsToWarehouseCompany(line, companyId)) continue;

    const qty = Number(line.qty_kg) || 0;
    if (qty <= 0) continue;

    if (line.source === 'supplier') {
      rows.push(createPurchaseSaleRow(line, 'purchase'));
    }

    if (
      refrigerantIncludedInCustomerBilling({
        source: line.source,
        supplier_paid_by: line.supplier_paid_by,
        bill_to_customer: line.bill_to_customer,
      })
    ) {
      rows.push(createPurchaseSaleRow(line, 'sale'));
    }
  }

  rows.sort((a, b) => {
    const dateCmp = b.date.localeCompare(a.date);
    if (dateCmp !== 0) return dateCmp;
    if (a.kind !== b.kind) return a.kind === 'purchase' ? -1 : 1;
    return a.work_report_title.localeCompare(b.work_report_title, 'fi');
  });

  return rows;
}

export async function loadRefrigerantPurchaseSaleList(
  supabase: SupabaseClient,
  companyId: string,
  fromDate: string,
  toDate: string,
): Promise<RefrigerantPurchaseSaleRow[]> {
  const { data, error } = await supabase
    .from('work_report_refrigerant_lines')
    .select(LINE_SELECT)
    .gte('work_report_daily_logs.log_date', fromDate)
    .lte('work_report_daily_logs.log_date', toDate)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return buildRefrigerantPurchaseSaleRows((data as unknown as RawLine[]) ?? [], companyId);
}
