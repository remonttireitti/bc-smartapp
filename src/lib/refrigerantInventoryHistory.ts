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
  type RefrigerantSource,
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
  cylinder_id: string | null;
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

type RawBillingLine = {
  id: string;
  work_report_id: string;
  cylinder_id: string | null;
  source: RefrigerantSource;
  supplier_name: string | null;
  supplier_paid_by: string | null;
  bill_to_customer: boolean;
  warehouse_company_id: string | null;
  refrigerant_type: string;
  qty_kg: number;
  created_at: string;
  cylinder: { serial_number?: string | null; ownership_type?: string | null } | { serial_number?: string | null; ownership_type?: string | null }[] | null;
  daily_log: { log_date: string } | { log_date: string }[] | null;
  work_report: {
    id: string;
    title: string | null;
    owner_company_id: string;
    created_by_company_id: string;
    customers: { name: string | null } | { name: string | null }[] | null;
  } | null;
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
  cylinder_id,
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
  cylinder_id,
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

/**
 * Varaston historiassa näytetään varastoliikkeet (kirjaukset) ja tukkurin osto/myynti.
 * Kumppanin laskutusmyynti (Myynti varastopulosta) ei kuulu varastonomistajan historiaan:
 * varasto vähenee jo käyttö-kirjauksessa, eikä kevytyrittäjän myynti
 * omalle asiakkaalleen ole varaston omistajan asia.
 */
export function filterPurchaseSaleRowsForWarehouseHistory(
  rows: RefrigerantPurchaseSaleRow[],
): RefrigerantPurchaseSaleRow[] {
  return rows.filter((row) => row.source === 'supplier');
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
  return `wr|${workReportId}|${roundQtyKg(qtyKg)}|${normalizeRefrigerantTypeForKey(refrigerantType)}`;
}

function roundQtyKg(qtyKg: number): string {
  return (Math.round(qtyKg * 1000) / 1000).toFixed(3);
}

function normalizeRefrigerantTypeForKey(refrigerantType: string): string {
  return refrigerantType
    .trim()
    .replace(/\s+/g, '')
    .replace(/[‐‑‒–—−]/g, '-')
    .toUpperCase();
}

function normalizeHistoryTitle(title: string | null | undefined): string | null {
  const normalized = title
    ?.trim()
    .replace(/\s+/g, ' ')
    .replace(/[‐‑‒–—−]/g, '-');
  if (!normalized || normalized === '—' || normalized === 'Työraportti') return null;
  return normalized;
}

function workUseTitleDedupKey(
  workReportTitle: string | null | undefined,
  qtyKg: number,
  refrigerantType: string,
): string | null {
  const title = normalizeHistoryTitle(workReportTitle);
  if (!title) return null;
  return `title|${title}|${roundQtyKg(qtyKg)}|${normalizeRefrigerantTypeForKey(refrigerantType)}`;
}

function workUseSerialQtyTypeKey(
  serialNumber: string | null | undefined,
  qtyKg: number,
  refrigerantType: string,
): string | null {
  const serial = serialNumber?.trim();
  if (!serial || serial === '—') return null;
  return `serialqty|${serial}|${roundQtyKg(qtyKg)}|${normalizeRefrigerantTypeForKey(refrigerantType)}`;
}

function stockLineWorkUseKey(
  workReportId: string | null,
  cylinderId: string | null,
  qtyKg: number,
  refrigerantType: string,
): string | null {
  if (!workReportId || !cylinderId) return null;
  return `stock|${workReportId}|${cylinderId}|${roundQtyKg(qtyKg)}|${normalizeRefrigerantTypeForKey(refrigerantType)}`;
}

function stockWorkUseKey(
  workReportId: string | null,
  cylinderId: string | null,
  refrigerantType: string,
): string | null {
  if (!workReportId || !cylinderId) return null;
  return `stockline|${workReportId}|${cylinderId}|${normalizeRefrigerantTypeForKey(refrigerantType)}`;
}

function workUseReportSerialKey(
  workReportId: string | null,
  serialNumber: string | null | undefined,
  refrigerantType: string,
): string | null {
  if (!workReportId) return null;
  const serial = serialNumber?.trim();
  if (!serial || serial === '—') return null;
  return `stockserial|${workReportId}|${serial}|${normalizeRefrigerantTypeForKey(refrigerantType)}`;
}

function workUseMovementDedupKey(movement: RawMovement): string | null {
  const qty = Number(movement.qty_kg) || 0;
  const type = movement.refrigerant_type ?? '';
  return (
    stockWorkUseKey(movement.work_report_id, movement.cylinder_id, type) ??
    workUseReportSerialKey(movement.work_report_id, movement.serial_number, type) ??
    stockLineWorkUseKey(movement.work_report_id, movement.cylinder_id, qty, type) ??
    workUseDedupBaseKey(movement.work_report_id, qty, type) ??
    workUseSerialQtyTypeKey(movement.serial_number, qty, type)
  );
}

function pickNewerWorkUseMovement(current: RawMovement, candidate: RawMovement): RawMovement {
  return candidate.created_at > current.created_at ? candidate : current;
}

/** Poista tietokannan tuplatyökäyttökirjaukset historianäkymästä. */
export function dedupeWorkUseMovements(movements: RawMovement[]): RawMovement[] {
  const workUseByKey = new Map<string, RawMovement>();
  const kept: RawMovement[] = [];

  for (const movement of movements) {
    if (movement.movement_type !== 'work_use') {
      kept.push(movement);
      continue;
    }

    const key = workUseMovementDedupKey(movement);
    if (!key) {
      kept.push(movement);
      continue;
    }

    const existing = workUseByKey.get(key);
    if (!existing) {
      workUseByKey.set(key, movement);
      continue;
    }
    workUseByKey.set(key, pickNewerWorkUseMovement(existing, movement));
  }

  return [...kept, ...workUseByKey.values()];
}

function dedupeHistoryWorkUseRows(rows: RefrigerantInventoryHistoryRow[]): RefrigerantInventoryHistoryRow[] {
  const workUseByKey = new Map<string, RefrigerantInventoryHistoryRow>();
  const kept: RefrigerantInventoryHistoryRow[] = [];

  for (const row of rows) {
    if (row.eventLabel !== 'Käyttö työkohteella') {
      kept.push(row);
      continue;
    }

    const key =
      workUseReportSerialKey(row.work_report_id, row.serial_number, row.refrigerant_type) ??
      workUseDedupBaseKey(row.work_report_id, row.qty_kg, row.refrigerant_type) ??
      workUseSerialQtyTypeKey(row.serial_number, row.qty_kg, row.refrigerant_type) ??
      workUseTitleDedupKey(row.work_report_title, row.qty_kg, row.refrigerant_type);

    if (!key) {
      kept.push(row);
      continue;
    }

    const existing = workUseByKey.get(key);
    if (!existing) {
      workUseByKey.set(key, row);
      continue;
    }
    workUseByKey.set(key, existing.at >= row.at ? existing : row);
  }

  return [...kept, ...workUseByKey.values()];
}

function collectHistoryRowMatchKeys(row: RefrigerantInventoryHistoryRow): string[] {
  const keys = new Set<string>();
  const qty = row.qty_kg;
  const type = row.refrigerant_type;

  const reportSerial = workUseReportSerialKey(row.work_report_id, row.serial_number, type);
  if (reportSerial) keys.add(reportSerial);

  const base = workUseDedupBaseKey(row.work_report_id, qty, type);
  if (base) keys.add(base);

  const title = workUseTitleDedupKey(row.work_report_title, qty, type);
  if (title) keys.add(title);

  const serialQty = workUseSerialQtyTypeKey(row.serial_number, qty, type);
  if (serialQty) keys.add(serialQty);

  return [...keys];
}

/** Poista laskutusmyynti, jos sama erä näkyy jo varaston käyttönä. */
export function collapseHistorySaleWorkUseDuplicates(
  rows: RefrigerantInventoryHistoryRow[],
): RefrigerantInventoryHistoryRow[] {
  const saleRows = rows.filter((row) => row.eventLabel === 'Myynti');
  const useRows = rows.filter((row) => row.eventLabel === 'Käyttö työkohteella');
  if (saleRows.length === 0 || useRows.length === 0) return rows;

  const useByKey = new Map<string, RefrigerantInventoryHistoryRow>();
  for (const useRow of useRows) {
    for (const key of collectHistoryRowMatchKeys(useRow)) {
      useByKey.set(key, useRow);
    }
  }

  const dropIds = new Set<string>();
  for (const sale of saleRows) {
    const matchKeys = collectHistoryRowMatchKeys(sale);
    if (matchKeys.some((key) => useByKey.has(key))) {
      dropIds.add(sale.id);
    }
  }

  if (dropIds.size === 0) return rows;
  return rows.filter((row) => !dropIds.has(row.id));
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

function purchaseSaleToHistoryRow(row: RefrigerantPurchaseSaleRow): RefrigerantInventoryHistoryRow {
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
    affects_warehouse_balance: purchaseSaleRowAffectsWarehouseBalance(row),
  };
}

export function mergeRefrigerantInventoryHistoryRows(
  movements: RawMovement[],
  purchaseSaleRows: RefrigerantPurchaseSaleRow[],
): RefrigerantInventoryHistoryRow[] {
  const rows: RefrigerantInventoryHistoryRow[] = [];

  for (const movement of dedupeWorkUseMovements(movements)) {
    const row = movementToHistoryRow(movement);
    if (row) rows.push(row);
  }

  for (const purchaseSaleRow of purchaseSaleRows) {
    if (purchaseSaleRow.kind === 'retrieve') continue;
    rows.push(purchaseSaleToHistoryRow(purchaseSaleRow));
  }

  return dedupeHistoryWorkUseRows(collapseHistorySaleWorkUseDuplicates(rows)).sort((a, b) =>
    b.at.localeCompare(a.at),
  );
}

export async function loadRefrigerantInventoryHistory(
  supabase: SupabaseClient,
  companyId: string,
  fromDate: string,
  toDate: string,
  viewerCompanyId: string = companyId,
  cylinderId?: string,
): Promise<RefrigerantInventoryHistoryRow[]> {
  const fromIso = `${fromDate}T00:00:00.000Z`;
  const toIso = `${toDate}T23:59:59.999Z`;

  let movementsQuery = supabase
    .from('refrigerant_cylinder_movements')
    .select(MOVEMENT_SELECT)
    .eq('company_id', companyId)
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .order('created_at', { ascending: false });
  if (cylinderId) movementsQuery = movementsQuery.eq('cylinder_id', cylinderId);

  let linesQuery = supabase
    .from('work_report_refrigerant_lines')
    .select(LINE_SELECT)
    .gte('work_report_daily_logs.log_date', fromDate)
    .lte('work_report_daily_logs.log_date', toDate)
    .order('created_at', { ascending: false });
  if (cylinderId) linesQuery = linesQuery.eq('cylinder_id', cylinderId);
  const [movementsResult, linesResult] = await Promise.all([movementsQuery, linesQuery]);

  if (movementsResult.error) throw movementsResult.error;
  if (linesResult.error) throw linesResult.error;

  const rawLines = (linesResult.data as unknown as RawBillingLine[]) ?? [];
  const purchaseSaleRows = filterPurchaseSaleRowsForWarehouseHistory(
    filterPurchaseSaleRowsForViewer(
      buildRefrigerantPurchaseSaleRows(
        rawLines as unknown as Parameters<typeof buildRefrigerantPurchaseSaleRows>[0],
        companyId,
      ),
      viewerCompanyId,
    ),
  );

  return mergeRefrigerantInventoryHistoryRows(
    (movementsResult.data as unknown as RawMovement[]) ?? [],
    purchaseSaleRows,
  );
}
