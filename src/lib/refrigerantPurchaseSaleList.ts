import type { SupabaseClient } from '@supabase/supabase-js';

import { refrigerantIncludedInCustomerBilling } from './refrigerantInventory';
import {
  redactRefrigerantSourceLabel,
  shouldHideRefrigerantSourceFromViewer,
  type RefrigerantReportContext,
} from './refrigerantVisibility';
import {
  REFRIGERANT_CYLINDER_OWNERSHIP_LABELS,
  REFRIGERANT_SOURCE_LABELS,
  type RefrigerantSource,
  type RefrigerantSupplierPaidBy,
} from '../types/inventory';

export type RefrigerantPurchaseSaleKind = 'purchase' | 'sale' | 'retrieve';

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
  source: RefrigerantSource;
  owner_company_id: string;
  created_by_company_id: string;
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
    created_by_company_id: string;
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
    created_by_company_id,
    customers(name)
  )
`;

type RawMovement = {
  id: string;
  company_id: string;
  movement_type: string;
  qty_kg: number;
  refrigerant_type: string;
  serial_number: string | null;
  ownership_type: string | null;
  work_report_id: string | null;
  created_at: string;
  customer: { name: string | null } | { name: string | null }[] | null;
  cylinder: { ownership_type?: string | null } | { ownership_type?: string | null }[] | null;
};

const MOVEMENT_SELECT = `
  id,
  company_id,
  movement_type,
  qty_kg,
  refrigerant_type,
  serial_number,
  ownership_type,
  work_report_id,
  created_at,
  customer:customers(name),
  cylinder:refrigerant_cylinders(ownership_type)
`;

const KIND_SORT_ORDER: Record<RefrigerantPurchaseSaleKind, number> = {
  purchase: 0,
  retrieve: 1,
  sale: 2,
};

function sortPurchaseSaleRows(rows: RefrigerantPurchaseSaleRow[]): RefrigerantPurchaseSaleRow[] {
  return rows.sort((a, b) => {
    const dateCmp = b.date.localeCompare(a.date);
    if (dateCmp !== 0) return dateCmp;
    const kindCmp = KIND_SORT_ORDER[a.kind] - KIND_SORT_ORDER[b.kind];
    if (kindCmp !== 0) return kindCmp;
    return a.work_report_title.localeCompare(b.work_report_title, 'fi');
  });
}

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
  if (line.kind === 'retrieve') return 'Asiakkaalta talteen';
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
  const sourceLabel = refrigerantPurchaseSaleSourceLabel({
    kind,
    source: line.source,
    supplier_name: line.supplier_name,
  });

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
    source_label: sourceLabel,
    source: line.source,
    owner_company_id: workReport?.owner_company_id ?? '',
    created_by_company_id: workReport?.created_by_company_id ?? '',
  };
}

function createCustomerRetrieveRow(movement: RawMovement, companyId: string): RefrigerantPurchaseSaleRow {
  const customer = unwrapOne(movement.customer);
  const cylinder = unwrapOne(movement.cylinder);
  const qty = Number(movement.qty_kg) || 0;

  return {
    id: `retrieve:${movement.id}`,
    kind: 'retrieve',
    date: movement.created_at.slice(0, 10),
    work_report_id: movement.work_report_id ?? '',
    work_report_title: '—',
    customer_name: customer?.name?.trim() || '—',
    refrigerant_type: movement.refrigerant_type?.trim() || '—',
    qty_kg: qty,
    serial_number: movement.serial_number?.trim() || '—',
    ownership: formatRefrigerantOwnershipLabel(movement.ownership_type ?? cylinder?.ownership_type),
    source_label: refrigerantPurchaseSaleSourceLabel({
      kind: 'retrieve',
      source: 'warehouse',
      supplier_name: null,
    }),
    source: 'warehouse',
    owner_company_id: companyId,
    created_by_company_id: companyId,
  };
}

export function buildCustomerRetrieveRows(
  movements: RawMovement[],
  companyId: string,
): RefrigerantPurchaseSaleRow[] {
  const rows: RefrigerantPurchaseSaleRow[] = [];

  for (const movement of movements) {
    if (movement.company_id !== companyId) continue;
    if (movement.movement_type !== 'customer_retrieve') continue;
    const qty = Number(movement.qty_kg) || 0;
    if (qty <= 0) continue;
    rows.push(createCustomerRetrieveRow(movement, companyId));
  }

  return rows;
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

  return sortPurchaseSaleRows(rows);
}

export function mergeRefrigerantPurchaseSaleRows(
  lineRows: RefrigerantPurchaseSaleRow[],
  retrieveRows: RefrigerantPurchaseSaleRow[],
): RefrigerantPurchaseSaleRow[] {
  return sortPurchaseSaleRows([...lineRows, ...retrieveRows]);
}

export function filterPurchaseSaleRowsForViewer(
  rows: RefrigerantPurchaseSaleRow[],
  viewerCompanyId: string,
): RefrigerantPurchaseSaleRow[] {
  return rows
    .filter((row) => {
      const ctx: RefrigerantReportContext = {
        viewerCompanyId,
        ownerCompanyId: row.owner_company_id,
        createdByCompanyId: row.created_by_company_id,
      };
      if (row.kind === 'purchase' && shouldHideRefrigerantSourceFromViewer(ctx)) {
        return false;
      }
      return true;
    })
    .map((row) => {
      const ctx: RefrigerantReportContext = {
        viewerCompanyId,
        ownerCompanyId: row.owner_company_id,
        createdByCompanyId: row.created_by_company_id,
      };
      const hideSource = shouldHideRefrigerantSourceFromViewer(ctx);
      if (!hideSource) return row;
      return {
        ...row,
        source_label: redactRefrigerantSourceLabel(
          {
            kind: row.kind,
            source: row.source,
            supplier_name: null,
            source_label: row.source_label,
          },
          true,
        ),
      };
    });
}

export async function loadRefrigerantPurchaseSaleList(
  supabase: SupabaseClient,
  companyId: string,
  fromDate: string,
  toDate: string,
  viewerCompanyId: string = companyId,
): Promise<RefrigerantPurchaseSaleRow[]> {
  const fromIso = `${fromDate}T00:00:00.000Z`;
  const toIso = `${toDate}T23:59:59.999Z`;

  const [linesResult, movementsResult] = await Promise.all([
    supabase
      .from('work_report_refrigerant_lines')
      .select(LINE_SELECT)
      .gte('work_report_daily_logs.log_date', fromDate)
      .lte('work_report_daily_logs.log_date', toDate)
      .order('created_at', { ascending: false }),
    supabase
      .from('refrigerant_cylinder_movements')
      .select(MOVEMENT_SELECT)
      .eq('company_id', companyId)
      .eq('movement_type', 'customer_retrieve')
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .order('created_at', { ascending: false }),
  ]);

  if (linesResult.error) throw linesResult.error;
  if (movementsResult.error) throw movementsResult.error;

  const lineRows = buildRefrigerantPurchaseSaleRows(
    (linesResult.data as unknown as RawLine[]) ?? [],
    companyId,
  );
  const retrieveRows = buildCustomerRetrieveRows(
    (movementsResult.data as unknown as RawMovement[]) ?? [],
    companyId,
  );
  const rows = mergeRefrigerantPurchaseSaleRows(lineRows, retrieveRows);
  return filterPurchaseSaleRowsForViewer(rows, viewerCompanyId);
}
