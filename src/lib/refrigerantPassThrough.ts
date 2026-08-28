import type { WorkReportRefrigerantLine } from '../types/inventory';

export type RefrigerantReportParties = {
  owner_company_id: string;
  created_by_company_id: string;
};

export function isPartnerOwnedWorkReport(report: RefrigerantReportParties): boolean {
  return report.created_by_company_id !== report.owner_company_id;
}

/** Varastopullo työkäytössä toisen yrityksen raportilla — välitysmyynti omistajalle. */
export function isRefrigerantStockPassThrough(
  line: Pick<WorkReportRefrigerantLine, 'source' | 'qty_kg'>,
  report: RefrigerantReportParties,
): boolean {
  if (!isPartnerOwnedWorkReport(report)) return false;
  const qty = Number(line.qty_kg) || 0;
  if (qty <= 0) return false;
  return line.source === 'warehouse' || line.source === 'partner_warehouse';
}

export function refrigerantWarehouseCostUnitPrice(
  line: Pick<WorkReportRefrigerantLine, 'unit_price'>,
): number {
  return Number(line.unit_price) || 0;
}

export function refrigerantSaleToOwnerUnitPrice(
  line: Pick<WorkReportRefrigerantLine, 'unit_price' | 'customer_unit_price'>,
): number {
  const customer = line.customer_unit_price != null ? Number(line.customer_unit_price) : 0;
  if (customer > 0) return customer;
  return Number(line.unit_price) || 0;
}

export function shouldBillRefrigerantSaleToReportOwner(
  line: Pick<WorkReportRefrigerantLine, 'source' | 'qty_kg'>,
  report: RefrigerantReportParties,
): boolean {
  return isRefrigerantStockPassThrough(line, report);
}

export function isRefrigerantWarehouseCostLine(
  line: Pick<WorkReportRefrigerantLine, 'source' | 'warehouse_company_id' | 'qty_kg'>,
  viewerCompanyId: string | null | undefined,
): boolean {
  if (!viewerCompanyId || !line.warehouse_company_id) return false;
  if (line.warehouse_company_id !== viewerCompanyId) return false;
  const qty = Number(line.qty_kg) || 0;
  if (qty <= 0) return false;
  return line.source === 'warehouse' || line.source === 'partner_warehouse';
}
