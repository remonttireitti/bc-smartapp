import type { SupabaseClient } from '@supabase/supabase-js';

import { refrigerantIncludedInCustomerBilling } from './refrigerantInventory';
import { formatRefrigerantOwnershipLabel } from './refrigerantPurchaseSaleList';
import { openSimplePrintHtml } from './openPrintWindow';
import type { RefrigerantMovementType, RefrigerantRentalSupplier, RefrigerantSource, RefrigerantSupplierPaidBy } from '../types/inventory';
import {
  REFRIGERANT_MOVEMENT_TYPE_LABELS,
  REFRIGERANT_RENTAL_SUPPLIER_LABELS,
} from '../types/inventory';

export type RefrigerantPeriodReportRow = {
  kind: 'movement' | 'supplier_sale';
  date: string;
  typeLabel: string;
  refrigerant_type: string;
  serial_number: string;
  qty_kg: number;
  /** Asiakas myynnissä/talteenotossa, toimittaja/lähde ostoissa. */
  party_name: string;
  location: string;
  ownership: string;
  notes: string;
};

export type RefrigerantPeriodSummary = {
  purchased_kg: number;
  customer_retrieved_kg: number;
  sold_kg: number;
  recycled_kg: number;
};

export type RefrigerantStockSnapshotRow = {
  serial_number: string;
  refrigerant_type: string;
  remaining_kg: number;
  capacity_kg: number;
  ownership: string;
  status_label: string;
};

type RawCylinder = {
  rental_supplier: RefrigerantRentalSupplier | null;
  stock_source: string | null;
  ownership_type: string | null;
};

type RawMovement = {
  movement_type: RefrigerantMovementType;
  qty_kg: number;
  refrigerant_type: string;
  serial_number: string | null;
  location: string | null;
  ownership_type: string | null;
  work_report_id: string | null;
  notes: string | null;
  created_at: string;
  customer: { name: string | null } | { name: string | null }[] | null;
  work_report:
    | {
        title: string | null;
        customers: { name: string | null } | { name: string | null }[] | null;
      }
    | {
        title: string | null;
        customers: { name: string | null } | { name: string | null }[] | null;
      }[]
    | null;
  cylinder: RawCylinder | RawCylinder[] | null;
};

type RawReportLine = {
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
    owner_company_id: string;
    customers: { name: string | null } | { name: string | null }[] | null;
  } | null;
};

const MOVEMENT_SELECT = `
  id, company_id, cylinder_id, movement_type, qty_kg, refrigerant_type, serial_number,
  customer_id, location, ownership_type, work_report_id, notes, created_at,
  customer:customers(name),
  work_report:work_reports(title, customers(name)),
  cylinder:refrigerant_cylinders(rental_supplier, stock_source, ownership_type)
`;

const LINE_SELECT = `
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
  work_report:work_reports!inner(owner_company_id, customers(name))
`;

const STOCK_SELECT = `
  serial_number,
  refrigerant_type,
  remaining_kg,
  capacity_kg,
  purchased_kg,
  ownership_type,
  status
`;

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function partyOrDash(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed || '—';
}

export function purchaseMovementPartyName(
  movement: Pick<RawMovement, 'notes' | 'ownership_type'>,
  cylinder: RawCylinder | null,
): string {
  const rentalSupplier = cylinder?.rental_supplier;
  if (rentalSupplier && REFRIGERANT_RENTAL_SUPPLIER_LABELS[rentalSupplier]) {
    return `Vuokra: ${REFRIGERANT_RENTAL_SUPPLIER_LABELS[rentalSupplier]}`;
  }
  const notes = movement.notes?.trim();
  if (notes && notes !== 'Varastoon') return notes;
  return 'Ostettu varastoon';
}

export function movementToPeriodReportRow(movement: RawMovement): RefrigerantPeriodReportRow | null {
  const type = movement.movement_type;
  const qty = Number(movement.qty_kg) || 0;
  if (qty <= 0) return null;

  const customer = unwrapOne(movement.customer);
  const workReport = unwrapOne(movement.work_report);
  const workCustomer = unwrapOne(workReport?.customers ?? null);
  const cylinder = unwrapOne(movement.cylinder);

  let typeLabel = REFRIGERANT_MOVEMENT_TYPE_LABELS[type] ?? type;
  let partyName = '—';
  let notes = movement.notes?.trim() || '';

  if (type === 'purchase') {
    partyName = purchaseMovementPartyName(movement, cylinder);
    if (!notes) notes = 'Varastoon';
  } else if (type === 'customer_retrieve') {
    partyName = partyOrDash(customer?.name);
    notes = '';
  } else if (type === 'work_use') {
    typeLabel = 'Myynti asiakkaalle';
    partyName = partyOrDash(workCustomer?.name);
    const title = workReport?.title?.trim();
    if (title) notes = title;
  } else if (customer?.name) {
    partyName = partyOrDash(customer.name);
  }

  return {
    kind: 'movement',
    date: movement.created_at,
    typeLabel,
    refrigerant_type: movement.refrigerant_type?.trim() || '—',
    serial_number: movement.serial_number?.trim() || '—',
    qty_kg: qty,
    party_name: partyName,
    location: movement.location?.trim() || '—',
    ownership: formatRefrigerantOwnershipLabel(movement.ownership_type ?? cylinder?.ownership_type),
    notes,
  };
}

export function supplierLineToPeriodReportRow(line: RawReportLine): RefrigerantPeriodReportRow | null {
  if (line.source !== 'supplier') return null;
  if (!refrigerantIncludedInCustomerBilling(line)) return null;

  const qty = Number(line.qty_kg) || 0;
  if (qty <= 0) return null;

  const dailyLog = unwrapOne(line.daily_log);
  const customer = unwrapOne(line.work_report?.customers ?? null);
  const cylinder = unwrapOne(line.cylinder);
  const supplier = line.supplier_name?.trim() || 'Tukkuri';

  return {
    kind: 'supplier_sale',
    date: `${dailyLog?.log_date ?? line.created_at.slice(0, 10)}T12:00:00.000Z`,
    typeLabel: 'Myynti asiakkaalle (tukkurin kautta)',
    refrigerant_type: line.refrigerant_type?.trim() || '—',
    serial_number: cylinder?.serial_number?.trim() || '—',
    qty_kg: qty,
    party_name: partyOrDash(customer?.name),
    location: '—',
    ownership: formatRefrigerantOwnershipLabel(cylinder?.ownership_type),
    notes: `Tukkuri: ${supplier} · ei varastoliikettä`,
  };
}

export function summarizePeriodReportRows(rows: RefrigerantPeriodReportRow[]): RefrigerantPeriodSummary {
  const summary: RefrigerantPeriodSummary = {
    purchased_kg: 0,
    customer_retrieved_kg: 0,
    sold_kg: 0,
    recycled_kg: 0,
  };

  for (const row of rows) {
    if (row.typeLabel.startsWith('Osto / varastoon')) summary.purchased_kg += row.qty_kg;
    else if (row.typeLabel === 'Asiakkaalta talteen') summary.customer_retrieved_kg += row.qty_kg;
    else if (row.typeLabel.startsWith('Myynti asiakkaalle')) summary.sold_kg += row.qty_kg;
    else if (row.typeLabel === 'Kierrätykseen toimitettu') summary.recycled_kg += row.qty_kg;
  }

  return summary;
}

export function mergePeriodReportRows(
  movements: RawMovement[],
  supplierLines: RawReportLine[],
): RefrigerantPeriodReportRow[] {
  const rows: RefrigerantPeriodReportRow[] = [];

  for (const movement of movements) {
    const row = movementToPeriodReportRow(movement);
    if (row) rows.push(row);
  }

  for (const line of supplierLines) {
    const row = supplierLineToPeriodReportRow(line);
    if (row) rows.push(row);
  }

  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

function lineBelongsToWarehouseCompany(line: RawReportLine, companyId: string): boolean {
  if (line.warehouse_company_id === companyId) return true;
  return line.work_report?.owner_company_id === companyId;
}

export async function loadRefrigerantStockSnapshot(
  supabase: SupabaseClient,
  companyId: string,
): Promise<RefrigerantStockSnapshotRow[]> {
  const { data, error } = await supabase
    .from('refrigerant_cylinders')
    .select(STOCK_SELECT)
    .eq('company_id', companyId)
    .in('status', ['in_stock', 'empty'])
    .order('serial_number', { ascending: true, nullsFirst: false });

  if (error) throw error;

  return (data ?? [])
    .map((row) => {
      const remaining = Number(row.remaining_kg) || 0;
      const capacity = Number(row.capacity_kg) || Number(row.purchased_kg) || 0;
      const type = row.refrigerant_type?.trim() || '—';
      const serial = row.serial_number?.trim() || '—';
      const status = row.status === 'empty' ? 'Tyhjä' : 'Varastossa';
      return {
        serial_number: serial,
        refrigerant_type: type,
        remaining_kg: remaining,
        capacity_kg: capacity,
        ownership: formatRefrigerantOwnershipLabel(row.ownership_type),
        status_label: status,
      };
    })
    .filter((row) => row.remaining_kg > 0.0005 || row.serial_number !== '—');
}

export async function loadRefrigerantPeriodReport(
  supabase: SupabaseClient,
  companyId: string,
  fromIso: string,
  toIso: string,
  fromDate: string,
  toDate: string,
): Promise<{
  rows: RefrigerantPeriodReportRow[];
  summary: RefrigerantPeriodSummary;
  stock: RefrigerantStockSnapshotRow[];
}> {
  const [movementsResult, linesResult, stock] = await Promise.all([
    supabase
      .from('refrigerant_cylinder_movements')
      .select(MOVEMENT_SELECT)
      .eq('company_id', companyId)
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .order('created_at', { ascending: true }),
    supabase
      .from('work_report_refrigerant_lines')
      .select(LINE_SELECT)
      .eq('source', 'supplier')
      .gte('work_report_daily_logs.log_date', fromDate)
      .lte('work_report_daily_logs.log_date', toDate)
      .order('created_at', { ascending: true }),
    loadRefrigerantStockSnapshot(supabase, companyId),
  ]);

  if (movementsResult.error) throw movementsResult.error;
  if (linesResult.error) throw linesResult.error;

  const supplierLines = ((linesResult.data as unknown as RawReportLine[]) ?? []).filter((line) =>
    lineBelongsToWarehouseCompany(line, companyId),
  );

  const rows = mergePeriodReportRows(
    (movementsResult.data as unknown as RawMovement[]) ?? [],
    supplierLines,
  );

  return {
    rows,
    summary: summarizePeriodReportRows(rows),
    stock,
  };
}

export function buildRefrigerantPeriodReportHtml(opts: {
  companyName: string;
  fromLabel: string;
  toLabel: string;
  summary: RefrigerantPeriodSummary;
  rows: RefrigerantPeriodReportRow[];
  stock: RefrigerantStockSnapshotRow[];
}): string {
  const { companyName, fromLabel, toLabel, summary, rows, stock } = opts;
  const fmt = (n: number) => n.toFixed(2).replace('.', ',');

  const summaryRows = [
    ['Ostettu / varastoon (kg)', fmt(summary.purchased_kg)],
    ['Asiakkaalta talteen (kg)', fmt(summary.customer_retrieved_kg)],
    ['Myyty asiakkaalle (kg)', fmt(summary.sold_kg)],
    ['Kierrätykseen toimitettu (kg)', fmt(summary.recycled_kg)],
  ]
    .map(([label, val]) => `<tr><td>${label}</td><td style="text-align:right;font-weight:bold">${val}</td></tr>`)
    .join('');

  const detailRows = rows
    .map(
      (r) => `<tr>
        <td>${new Date(r.date).toLocaleString('fi-FI')}</td>
        <td>${escapeHtml(r.typeLabel)}</td>
        <td>${escapeHtml(r.refrigerant_type)}</td>
        <td>${escapeHtml(r.serial_number)}</td>
        <td style="text-align:right">${fmt(r.qty_kg)}</td>
        <td>${escapeHtml(r.party_name)}</td>
        <td>${escapeHtml(r.location)}</td>
        <td>${escapeHtml(r.ownership)}</td>
        <td>${escapeHtml(r.notes)}</td>
      </tr>`,
    )
    .join('');

  const stockRows = stock
    .map(
      (row) => `<tr>
        <td>${escapeHtml(row.serial_number)}</td>
        <td>${escapeHtml(row.refrigerant_type)}</td>
        <td style="text-align:right">${fmt(row.remaining_kg)}</td>
        <td style="text-align:right">${fmt(row.capacity_kg)}</td>
        <td>${escapeHtml(row.ownership)}</td>
        <td>${escapeHtml(row.status_label)}</td>
      </tr>`,
    )
    .join('');

  const stockTotal = stock.reduce((sum, row) => sum + row.remaining_kg, 0);

  return `<!DOCTYPE html>
<html lang="fi">
<head>
  <meta charset="utf-8" />
  <title>Kylmäaineraportti ${escapeHtml(companyName)}</title>
  <style>
    body { font-family: system-ui, sans-serif; font-size: 11px; margin: 16px; color: #111; }
    h1 { font-size: 16px; margin: 0 0 4px; }
    h2 { font-size: 13px; margin: 16px 0 8px; }
    .muted { color: #555; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; }
    @media print { body { margin: 8px; } }
  </style>
</head>
<body>
  <h1>Kylmäaineraportti</h1>
  <p class="muted">${escapeHtml(companyName)} · ${escapeHtml(fromLabel)} – ${escapeHtml(toLabel)}</p>
  <h2>Yhteenveto</h2>
  <table>${summaryRows}</table>
  <h2>Tapahtumat</h2>
  <table>
    <thead>
      <tr>
        <th>Aika</th><th>Tapahtuma</th><th>Aine</th><th>Pullo</th><th>kg</th>
        <th>Asiakas / lähde</th><th>Sijainti</th><th>Omistus</th><th>Huom.</th>
      </tr>
    </thead>
    <tbody>${detailRows || '<tr><td colspan="9">Ei tapahtumia valitulla jaksolla.</td></tr>'}</tbody>
  </table>
  <h2>Varastosaldo (${escapeHtml(toLabel)})</h2>
  <table>
    <thead>
      <tr>
        <th>Pullo</th><th>Aine</th><th>Jäljellä (kg)</th><th>Kapasiteetti (kg)</th><th>Omistus</th><th>Tila</th>
      </tr>
    </thead>
    <tbody>${stockRows || '<tr><td colspan="6">Ei pulloja varastossa.</td></tr>'}</tbody>
    <tfoot>
      <tr>
        <th colspan="2">Yhteensä</th>
        <th style="text-align:right">${fmt(stockTotal)}</th>
        <th colspan="3"></th>
      </tr>
    </tfoot>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function printRefrigerantPeriodReport(
  html: string,
  documentTitle?: string,
  printWindow?: Window | null,
): void {
  openSimplePrintHtml(html, { documentTitle, printWindow });
}
