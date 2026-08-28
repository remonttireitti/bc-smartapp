import type { SupabaseClient } from '@supabase/supabase-js';

import {
  buildRefrigerantPurchaseSaleRows,
  filterPurchaseSaleRowsForViewer,
  formatRefrigerantOwnershipLabel,
  type RefrigerantPurchaseSaleRow,
} from './refrigerantPurchaseSaleList';
import {
  REFRIGERANT_MOVEMENT_TYPE_LABELS,
  type RefrigerantMovementType,
} from '../types/inventory';

export type RefrigerantInventoryHistoryDirection = 'in' | 'out';

export type RefrigerantInventoryHistoryRow = {
  id: string;
  at: string;
  eventLabel: string;
  direction: RefrigerantInventoryHistoryDirection;
  work_report_id: string | null;
  work_report_title: string | null;
  customer_name: string;
  refrigerant_type: string;
  qty_kg: number;
  serial_number: string;
  ownership: string;
  source_label: string;
  /** Varastosaldoon lasketaan vain oikeat varastoliikkeet, ei tukkurin välitysmyyntiä. */
  affects_warehouse_balance: boolean;
};

type RawMovement = {
  id: string;
  movement_type: RefrigerantMovementType;
  qty_kg: number;
  refrigerant_type: string;
  serial_number: string | null;
  ownership_type: string | null;
  work_report_id: string | null;
  created_at: string;
  customer: { name: string | null } | { name: string | null }[] | null;
  cylinder: { ownership_type?: string | null } | { ownership_type?: string | null }[] | null;
  work_report: { title: string | null } | { title: string | null }[] | null;
};

const MOVEMENT_DIRECTION: Record<RefrigerantMovementType, RefrigerantInventoryHistoryDirection | null> = {
  purchase: 'in',
  customer_retrieve: 'in',
  work_use: 'out',
  recycle: 'out',
  dispose: 'out',
  return_rental: 'out',
  adjustment: null,
};

const PURCHASE_SALE_EVENT_LABELS = {
  purchase: 'Osto työmaalla',
  sale: 'Myynti',
} as const;

const MOVEMENT_SELECT = `
  id,
  movement_type,
  qty_kg,
  refrigerant_type,
  serial_number,
  ownership_type,
  work_report_id,
  created_at,
  customer:customers(name),
  cylinder:refrigerant_cylinders(ownership_type),
  work_report:work_reports(title)
`;

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

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function refrigerantHistoryDirectionLabel(direction: RefrigerantInventoryHistoryDirection): string {
  return direction === 'in' ? '+' : '−';
}

/** Tukkurilta suoraan asiakkaalle: ei vaikuta varastosaldoon (+x −x = 0). */
export function purchaseSaleRowAffectsWarehouseBalance(row: RefrigerantPurchaseSaleRow): boolean {
  if (row.source === 'supplier' || row.source === 'partner_warehouse') return false;
  return row.kind === 'sale' && row.source === 'warehouse';
}

export type RefrigerantHistoryBalanceSummary = {
  refrigerant_type: string;
  in_kg: number;
  out_kg: number;
  net_kg: number;
};

export function collectRefrigerantHistoryTypes(rows: RefrigerantInventoryHistoryRow[]): string[] {
  const types = new Set<string>();
  for (const row of rows) {
    const type = row.refrigerant_type.trim();
    if (type && type !== '—') types.add(type);
  }
  return [...types].sort((a, b) => a.localeCompare(b, 'fi'));
}

export function filterRefrigerantHistoryByType(
  rows: RefrigerantInventoryHistoryRow[],
  refrigerantType: string,
): RefrigerantInventoryHistoryRow[] {
  if (!refrigerantType || refrigerantType === 'all') return rows;
  return rows.filter((row) => row.refrigerant_type === refrigerantType);
}

export function summarizeRefrigerantHistoryBalance(
  rows: RefrigerantInventoryHistoryRow[],
): RefrigerantHistoryBalanceSummary[] {
  const byType = new Map<string, { in_kg: number; out_kg: number }>();

  for (const row of rows) {
    if (!row.affects_warehouse_balance) continue;
    const type = row.refrigerant_type.trim() || '—';
    const entry = byType.get(type) ?? { in_kg: 0, out_kg: 0 };
    if (row.direction === 'in') entry.in_kg += row.qty_kg;
    else entry.out_kg += row.qty_kg;
    byType.set(type, entry);
  }

  return [...byType.entries()]
    .map(([refrigerant_type, totals]) => ({
      refrigerant_type,
      in_kg: totals.in_kg,
      out_kg: totals.out_kg,
      net_kg: totals.in_kg - totals.out_kg,
    }))
    .sort((a, b) => a.refrigerant_type.localeCompare(b.refrigerant_type, 'fi'));
}

export function workUseDedupBaseKey(
  workReportId: string | null,
  qtyKg: number,
  refrigerantType: string,
): string | null {
  if (!workReportId) return null;
  return `${workReportId}|${qtyKg.toFixed(3)}|${refrigerantType.trim()}`;
}

function movementToHistoryRow(movement: RawMovement): RefrigerantInventoryHistoryRow | null {
  const direction = MOVEMENT_DIRECTION[movement.movement_type];
  if (!direction) return null;

  const customer = unwrapOne(movement.customer);
  const cylinder = unwrapOne(movement.cylinder);
  const workReport = unwrapOne(movement.work_report);
  const qty = Number(movement.qty_kg) || 0;
  if (qty <= 0) return null;

  return {
    id: `movement:${movement.id}`,
    at: movement.created_at,
    eventLabel: REFRIGERANT_MOVEMENT_TYPE_LABELS[movement.movement_type],
    direction,
    work_report_id: movement.work_report_id,
    work_report_title: workReport?.title?.trim() || null,
    customer_name: customer?.name?.trim() || '—',
    refrigerant_type: movement.refrigerant_type?.trim() || '—',
    qty_kg: qty,
    serial_number: movement.serial_number?.trim() || '—',
    ownership: formatRefrigerantOwnershipLabel(movement.ownership_type ?? cylinder?.ownership_type),
    source_label: REFRIGERANT_MOVEMENT_TYPE_LABELS[movement.movement_type],
    affects_warehouse_balance: true,
  };
}

function purchaseSaleToHistoryRow(
  row: RefrigerantPurchaseSaleRow,
  replacesWarehouseWorkUse = false,
): RefrigerantInventoryHistoryRow {
  const eventLabel =
    row.kind === 'purchase' ? PURCHASE_SALE_EVENT_LABELS.purchase : PURCHASE_SALE_EVENT_LABELS.sale;
  return {
    id: `report:${row.id}`,
    at: `${row.date}T12:00:00.000Z`,
    eventLabel,
    direction: row.kind === 'purchase' ? 'in' : 'out',
    work_report_id: row.work_report_id || null,
    work_report_title: row.work_report_title === '—' ? null : row.work_report_title,
    customer_name: row.customer_name,
    refrigerant_type: row.refrigerant_type,
    qty_kg: row.qty_kg,
    serial_number: row.serial_number,
    ownership: row.ownership,
    source_label: row.source_label,
    affects_warehouse_balance:
      replacesWarehouseWorkUse || purchaseSaleRowAffectsWarehouseBalance(row),
  };
}

export function mergeRefrigerantInventoryHistoryRows(
  movements: RawMovement[],
  purchaseSaleRows: RefrigerantPurchaseSaleRow[],
): RefrigerantInventoryHistoryRow[] {
  const rows: RefrigerantInventoryHistoryRow[] = [];
  const billedWorkUseBaseKeys = new Set(
    purchaseSaleRows
      .filter((row) => row.kind === 'sale')
      .map((row) => workUseDedupBaseKey(row.work_report_id, row.qty_kg, row.refrigerant_type))
      .filter((key): key is string => key != null),
  );
  const replacedWorkUseBaseKeys = new Set<string>();

  for (const movement of movements) {
    if (movement.movement_type === 'work_use') {
      const dedupKey = workUseDedupBaseKey(
        movement.work_report_id,
        Number(movement.qty_kg) || 0,
        movement.refrigerant_type ?? '',
      );
      if (dedupKey && billedWorkUseBaseKeys.has(dedupKey)) {
        replacedWorkUseBaseKeys.add(dedupKey);
        continue;
      }
    }

    const row = movementToHistoryRow(movement);
    if (row) rows.push(row);
  }

  for (const purchaseSaleRow of purchaseSaleRows) {
    if (purchaseSaleRow.kind === 'retrieve') continue;
    const dedupKey = workUseDedupBaseKey(
      purchaseSaleRow.work_report_id,
      purchaseSaleRow.qty_kg,
      purchaseSaleRow.refrigerant_type,
    );
    rows.push(
      purchaseSaleToHistoryRow(
        purchaseSaleRow,
        purchaseSaleRow.kind === 'sale' && dedupKey != null && replacedWorkUseBaseKeys.has(dedupKey),
      ),
    );
  }

  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

export async function loadRefrigerantInventoryHistory(
  supabase: SupabaseClient,
  companyId: string,
  fromDate: string,
  toDate: string,
  viewerCompanyId: string = companyId,
): Promise<RefrigerantInventoryHistoryRow[]> {
  const fromIso = `${fromDate}T00:00:00.000Z`;
  const toIso = `${toDate}T23:59:59.999Z`;

  const [movementsResult, linesResult] = await Promise.all([
    supabase
      .from('refrigerant_cylinder_movements')
      .select(MOVEMENT_SELECT)
      .eq('company_id', companyId)
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .order('created_at', { ascending: false }),
    supabase
      .from('work_report_refrigerant_lines')
      .select(LINE_SELECT)
      .gte('work_report_daily_logs.log_date', fromDate)
      .lte('work_report_daily_logs.log_date', toDate)
      .order('created_at', { ascending: false }),
  ]);

  if (movementsResult.error) throw movementsResult.error;
  if (linesResult.error) throw linesResult.error;

  const purchaseSaleRows = filterPurchaseSaleRowsForViewer(
    buildRefrigerantPurchaseSaleRows(
      (linesResult.data as unknown as Parameters<typeof buildRefrigerantPurchaseSaleRows>[0]) ?? [],
      companyId,
    ),
    viewerCompanyId,
  );

  return mergeRefrigerantInventoryHistoryRows(
    (movementsResult.data as unknown as RawMovement[]) ?? [],
    purchaseSaleRows,
  );
}
