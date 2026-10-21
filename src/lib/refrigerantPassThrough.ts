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
  line: Pick<WorkReportRefrigerantLine, 'source' | 'warehouse_company_id' | 'qty_kg'> & { customer_sale?: boolean },
  viewerCompanyId: string | null | undefined,
): boolean {
  if (line.customer_sale === true) return false;
  if (!viewerCompanyId || !line.warehouse_company_id) return false;
  if (line.warehouse_company_id !== viewerCompanyId) return false;
  const qty = Number(line.qty_kg) || 0;
  if (qty <= 0) return false;
  return line.source === 'warehouse' || line.source === 'partner_warehouse';
}

/** Kumppanin varasto (uusi tapa): ei myyntiä kumppanille, vain myyntiprovisio asiakasmyynnistä. */
export function isRefrigerantCustomerSaleLine(line: Pick<WorkReportRefrigerantLine, 'source' | 'customer_sale'>): boolean {
  return line.source === 'partner_warehouse' && line.customer_sale === true;
}

/** Asiakasmyynti (kg × hinta asiakkaalle); 0 kun hinta puuttuu. */
export function refrigerantCustomerSaleNet(line: Pick<WorkReportRefrigerantLine, 'qty_kg' | 'customer_unit_price'>): number {
  const qty = Number(line.qty_kg) || 0;
  const price = line.customer_unit_price != null ? Number(line.customer_unit_price) || 0 : 0;
  if (!(qty > 0) || !(price > 0)) return 0;
  return Math.round(qty * price * 100) / 100;
}

/** Myyntiprovisio = % × asiakasmyynti (laskutetaan kumppanilta). */
export function refrigerantCommissionAmount(
  line: Pick<WorkReportRefrigerantLine, 'qty_kg' | 'customer_unit_price' | 'commission_percent'>,
): number {
  const pct = Number(line.commission_percent) || 0;
  if (!(pct > 0)) return 0;
  return Math.round(refrigerantCustomerSaleNet(line) * pct) / 100;
}
