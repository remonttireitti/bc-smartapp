import type { SupabaseClient } from '@supabase/supabase-js';

import { partnerPurchaseLineTotal } from './partnerPurchaseDeduction';
import { isRefrigerantWarehouseCostLine } from './refrigerantPassThrough';
import type { BillableCalculation, BillableLine } from './workReportBilling';
import { warehouseDeductionTotalsFromCalculation } from './workReportBilling';
import type { WorkReportPartnerPurchaseLine } from '../types/partnerPurchase';
import type { WorkReportRefrigerantLine } from '../types/inventory';

export type PartnerBillingDeductionSourceRow = {
  id: string;
  title: string;
  owner_company_id: string;
  created_by_company_id: string;
  delegate_company_id: string | null;
  customers?: { name: string | null } | null;
  owner_company?: { name: string | null } | null;
  creator_company?: { name: string | null } | null;
  delegate_company?: { name: string | null } | null;
  billable?: { calculation?: BillableCalculation | null } | null;
};

export type PartnerBillingDeductionKind = 'refrigerant' | 'partner_purchase';

type RefrigerantDeductionSourceLine = Pick<
  WorkReportRefrigerantLine,
  | 'id'
  | 'work_report_id'
  | 'source'
  | 'warehouse_company_id'
  | 'qty_kg'
  | 'unit_price'
  | 'refrigerant_type'
  | 'warehouse_cost_deducted'
> & {
  warehouse_company?: { name: string | null } | { name: string | null }[] | null;
  daily_log?: { log_date: string } | { log_date: string }[] | null;
};

type PartnerPurchaseDeductionSourceLine = Pick<
  WorkReportPartnerPurchaseLine,
  | 'id'
  | 'work_report_id'
  | 'partner_company_id'
  | 'description'
  | 'qty'
  | 'unit_price'
  | 'partner_margin_percent'
  | 'cost_deducted'
> & {
  partner_company?: { name: string | null } | { name: string | null }[] | null;
  daily_log?: { log_date: string } | { log_date: string }[] | null;
};

export type PartnerBillingDeductionRow = {
  lineId: string;
  lineKind: PartnerBillingDeductionKind;
  reportId: string;
  reportTitle: string;
  logDate: string;
  /** Kumppani, jonka laskutuksesta vähennetään. */
  deductionPartnerId: string;
  deductionPartnerName: string;
  customerName: string | null;
  purchaseLabel: string;
  qtyLabel: string;
  total: number;
  charged: boolean;
};

/** @deprecated Use PartnerBillingDeductionSourceRow */
export type RefrigerantBillingPurchaseSourceRow = PartnerBillingDeductionSourceRow;

/** @deprecated Use PartnerBillingDeductionRow */
export type RefrigerantBillingPurchaseRow = PartnerBillingDeductionRow & {
  partnerName: string;
  refrigerantType: string;
  qtyKg: number;
  unitPrice: number;
};

function isDelegatedPartnerOrder(
  row: Pick<PartnerBillingDeductionSourceRow, 'owner_company_id' | 'created_by_company_id' | 'delegate_company_id'>,
): boolean {
  return !!row.delegate_company_id && row.created_by_company_id === row.owner_company_id;
}

function isBillablePartnerReport(
  row: Pick<PartnerBillingDeductionSourceRow, 'owner_company_id' | 'created_by_company_id' | 'delegate_company_id'>,
): boolean {
  return (
    row.owner_company_id !== row.created_by_company_id
    || isDelegatedPartnerOrder(row)
  );
}

function lineTotal(qty: number, unitPrice: number): number {
  return Math.round(qty * unitPrice * 100) / 100;
}

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function shouldShowRefrigerantDeductionForViewer(
  line: Pick<
    WorkReportRefrigerantLine,
    'source' | 'warehouse_company_id' | 'qty_kg' | 'unit_price'
  >,
  report: Pick<PartnerBillingDeductionSourceRow, 'owner_company_id' | 'created_by_company_id'>,
  viewerCompanyId: string,
): boolean {
  if (!line.warehouse_company_id) return false;
  const qty = Number(line.qty_kg) || 0;
  const unitPrice = Number(line.unit_price) || 0;
  if (qty <= 0 || unitPrice <= 0) return false;
  if (line.source !== 'warehouse' && line.source !== 'partner_warehouse') return false;

  if (isRefrigerantWarehouseCostLine(line, viewerCompanyId)) return true;

  return (
    viewerCompanyId === report.created_by_company_id
    && report.created_by_company_id !== report.owner_company_id
    && line.warehouse_company_id !== viewerCompanyId
  );
}

function shouldShowPartnerPurchaseDeductionForViewer(
  line: Pick<WorkReportPartnerPurchaseLine, 'partner_company_id' | 'qty' | 'unit_price'>,
  report: Pick<PartnerBillingDeductionSourceRow, 'owner_company_id' | 'created_by_company_id'>,
  viewerCompanyId: string,
): boolean {
  if (!line.partner_company_id) return false;
  const qty = Number(line.qty) || 0;
  const unitPrice = Number(line.unit_price) || 0;
  if (qty <= 0 || unitPrice <= 0) return false;

  if (line.partner_company_id === viewerCompanyId) return true;

  return (
    viewerCompanyId === report.created_by_company_id
    && report.created_by_company_id !== report.owner_company_id
    && line.partner_company_id !== viewerCompanyId
  );
}

export function buildPartnerBillingDeductionsFromSource(
  reports: PartnerBillingDeductionSourceRow[],
  refrigerantLines: RefrigerantDeductionSourceLine[],
  partnerPurchaseLines: PartnerPurchaseDeductionSourceLine[],
  viewerCompanyId: string,
  partnerFilterId?: string | null,
): PartnerBillingDeductionRow[] {
  const reportById = new Map(reports.map((row) => [row.id, row]));
  const deductions: PartnerBillingDeductionRow[] = [];

  for (const line of refrigerantLines) {
    const report = reportById.get(line.work_report_id);
    if (!report || !isBillablePartnerReport(report)) continue;
    if (!shouldShowRefrigerantDeductionForViewer(line, report, viewerCompanyId)) continue;

    const warehouseCompany = unwrapRelation(line.warehouse_company);
    const dailyLog = unwrapRelation(line.daily_log);
    const deductionPartnerId = line.warehouse_company_id ?? '';
    const deductionPartnerName = warehouseCompany?.name?.trim() || '—';
    const qty = Number(line.qty_kg) || 0;
    const total = lineTotal(qty, Number(line.unit_price) || 0);

    if (partnerFilterId && deductionPartnerId && deductionPartnerId !== partnerFilterId) continue;

    deductions.push({
      lineId: line.id,
      lineKind: 'refrigerant',
      reportId: report.id,
      reportTitle: report.title,
      logDate: dailyLog?.log_date ?? '',
      deductionPartnerId,
      deductionPartnerName,
      customerName: report.customers?.name ?? null,
      purchaseLabel: line.refrigerant_type,
      qtyLabel: `${qty.toFixed(3)} kg`,
      total,
      charged: Boolean(line.warehouse_cost_deducted),
    });
  }

  for (const line of partnerPurchaseLines) {
    const report = reportById.get(line.work_report_id);
    if (!report || !isBillablePartnerReport(report)) continue;
    if (!shouldShowPartnerPurchaseDeductionForViewer(line, report, viewerCompanyId)) continue;

    const partnerCompany = unwrapRelation(line.partner_company);
    const dailyLog = unwrapRelation(line.daily_log);
    const deductionPartnerId = line.partner_company_id;
    const deductionPartnerName = partnerCompany?.name?.trim() || '—';
    const qty = Number(line.qty) || 0;
    const total = partnerPurchaseLineTotal(line);

    if (partnerFilterId && deductionPartnerId && deductionPartnerId !== partnerFilterId) continue;

    deductions.push({
      lineId: line.id,
      lineKind: 'partner_purchase',
      reportId: report.id,
      reportTitle: report.title,
      logDate: dailyLog?.log_date ?? '',
      deductionPartnerId,
      deductionPartnerName,
      customerName: report.customers?.name ?? null,
      purchaseLabel: line.description.trim() || 'Työkalu/varaosa',
      qtyLabel: Number.isInteger(qty) ? `${qty} kpl` : `${qty} kpl`,
      total,
      charged: Boolean(line.cost_deducted),
    });
  }

  return deductions.sort((a, b) => {
    const dateCmp = b.logDate.localeCompare(a.logDate);
    if (dateCmp !== 0) return dateCmp;
    return a.reportTitle.localeCompare(b.reportTitle, 'fi');
  });
}

export async function loadPartnerBillingDeductionsFromSource(
  supabase: SupabaseClient,
  reports: PartnerBillingDeductionSourceRow[],
  viewerCompanyId: string,
  partnerFilterId?: string | null,
): Promise<PartnerBillingDeductionRow[]> {
  const partnerReports = reports.filter(isBillablePartnerReport);
  const reportIds = partnerReports.map((row) => row.id);
  if (reportIds.length === 0) return [];

  const [refrigerantResult, purchaseResult] = await Promise.all([
    supabase
      .from('work_report_refrigerant_lines')
      .select(
        `id, work_report_id, source, warehouse_company_id, qty_kg, unit_price, refrigerant_type, warehouse_cost_deducted,
        warehouse_company:companies!work_report_refrigerant_lines_warehouse_company_id_fkey(name),
        daily_log:work_report_daily_logs!inner(log_date)`,
      )
      .in('work_report_id', reportIds),
    supabase
      .from('work_report_partner_purchase_lines')
      .select(
        `id, work_report_id, partner_company_id, supplier_name, description, qty, unit_price, partner_margin_percent, cost_deducted,
        partner_company:companies!work_report_partner_purchase_lines_partner_company_id_fkey(name),
        daily_log:work_report_daily_logs!inner(log_date)`,
      )
      .in('work_report_id', reportIds),
  ]);

  if (refrigerantResult.error) throw refrigerantResult.error;
  if (purchaseResult.error) throw purchaseResult.error;

  return buildPartnerBillingDeductionsFromSource(
    partnerReports,
    (refrigerantResult.data as unknown as RefrigerantDeductionSourceLine[]) ?? [],
    (purchaseResult.data as unknown as PartnerPurchaseDeductionSourceLine[]) ?? [],
    viewerCompanyId,
    partnerFilterId,
  );
}

function fallbackBillToPartnerName(row: PartnerBillingDeductionSourceRow, viewerCompanyId?: string | null): string {
  if (viewerCompanyId && isDelegatedPartnerOrder(row)) {
    return viewerCompanyId === row.delegate_company_id
      ? (row.owner_company?.name ?? '—')
      : (row.delegate_company?.name ?? '—');
  }
  if (viewerCompanyId && viewerCompanyId === row.created_by_company_id) {
    return isDelegatedPartnerOrder(row)
      ? (row.delegate_company?.name ?? '—')
      : (row.owner_company?.name ?? '—');
  }
  if (viewerCompanyId && viewerCompanyId === row.owner_company_id && row.created_by_company_id !== row.owner_company_id) {
    return row.creator_company?.name ?? '—';
  }
  if (isDelegatedPartnerOrder(row)) {
    return row.delegate_company?.name ?? '—';
  }
  return row.owner_company?.name ?? '—';
}

function refrigerantTypeFromDescription(description: string): string {
  const match = description.match(/(?:Varastosta\s+)?([A-Za-z0-9-]+)\s+[\d,.]+\s*kg/i);
  return match?.[1] ?? description.split(' ')[0] ?? '—';
}

function partnerPurchaseLabelFromDescription(description: string): string {
  const match = description.match(/Kumppanin piikki(?:\s+\([^)]+\))?\s*·\s*([^·]+)/i);
  return match?.[1]?.trim() || description.split('·')[1]?.trim() || 'Työkalu/varaosa';
}

function mapDeductionLine(
  row: PartnerBillingDeductionSourceRow,
  line: BillableLine,
  viewerCompanyId: string,
): PartnerBillingDeductionRow | null {
  let lineKind: PartnerBillingDeductionKind | null = null;
  let lineId: string | null = null;
  if (line.refrigerantLineId) {
    lineKind = 'refrigerant';
    lineId = line.refrigerantLineId;
  } else if (line.partnerPurchaseLineId) {
    lineKind = 'partner_purchase';
    lineId = line.partnerPurchaseLineId;
  }
  if (!lineKind || !lineId) return null;

  const deductionPartnerId = line.deductionPartnerCompanyId ?? '';
  const deductionPartnerName =
    line.deductionPartnerName?.trim()
    || fallbackBillToPartnerName(row, viewerCompanyId);

  const purchaseLabel =
    lineKind === 'refrigerant'
      ? refrigerantTypeFromDescription(line.description)
      : partnerPurchaseLabelFromDescription(line.description);

  const qtyLabel =
    lineKind === 'refrigerant'
      ? `${line.qty.toFixed(3)} kg`
      : `${Number.isInteger(line.qty) ? line.qty : line.qty} kpl`;

  return {
    lineId,
    lineKind,
    reportId: row.id,
    reportTitle: row.title,
    logDate: line.logDate,
    deductionPartnerId,
    deductionPartnerName,
    customerName: row.customers?.name ?? null,
    purchaseLabel,
    qtyLabel,
    total: line.total,
    charged: line.warehouseDeduction === 'deducted',
  };
}

export function collectPartnerBillingDeductions(
  rows: PartnerBillingDeductionSourceRow[],
  viewerCompanyId: string,
  partnerFilterId?: string | null,
): PartnerBillingDeductionRow[] {
  const deductions: PartnerBillingDeductionRow[] = [];

  for (const row of rows) {
    if (!isBillablePartnerReport(row)) continue;
    const { lines } = warehouseDeductionTotalsFromCalculation(row.billable?.calculation ?? undefined);
    for (const line of lines) {
      const mapped = mapDeductionLine(row, line, viewerCompanyId);
      if (!mapped) continue;
      if (partnerFilterId && mapped.deductionPartnerId && mapped.deductionPartnerId !== partnerFilterId) {
        continue;
      }
      deductions.push(mapped);
    }
  }

  return deductions.sort((a, b) => {
    const dateCmp = b.logDate.localeCompare(a.logDate);
    if (dateCmp !== 0) return dateCmp;
    return a.reportTitle.localeCompare(b.reportTitle, 'fi');
  });
}

/** Prefer source rows; fall back to stored calculation only when source is unavailable. */
export function mergePartnerBillingDeductions(
  sourceRows: PartnerBillingDeductionRow[],
  calculationRows: PartnerBillingDeductionRow[],
): PartnerBillingDeductionRow[] {
  if (sourceRows.length > 0) return sourceRows;
  return calculationRows;
}

export function collectRefrigerantBillingPurchases(
  rows: PartnerBillingDeductionSourceRow[],
  viewerCompanyId: string,
  partnerFilterId?: string | null,
): RefrigerantBillingPurchaseRow[] {
  return collectPartnerBillingDeductions(rows, viewerCompanyId, partnerFilterId).map((row) => ({
    ...row,
    partnerName: row.deductionPartnerName,
    refrigerantType: row.purchaseLabel,
    qtyKg: row.lineKind === 'refrigerant' ? Number.parseFloat(row.qtyLabel) : 1,
    unitPrice: row.total,
  }));
}

export function partnerBillingDeductionTotals(rows: PartnerBillingDeductionRow[]) {
  let pending = 0;
  let charged = 0;
  let pendingCount = 0;
  let chargedCount = 0;
  for (const row of rows) {
    if (row.charged) {
      charged += row.total;
      chargedCount += 1;
    } else {
      pending += row.total;
      pendingCount += 1;
    }
  }
  return {
    pending: Math.round(pending * 100) / 100,
    charged: Math.round(charged * 100) / 100,
    pendingCount,
    chargedCount,
    totalCount: rows.length,
  };
}

/** @deprecated Use partnerBillingDeductionTotals */
export function refrigerantBillingPurchaseTotals(rows: PartnerBillingDeductionRow[]) {
  return partnerBillingDeductionTotals(rows);
}
