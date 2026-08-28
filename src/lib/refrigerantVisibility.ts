import type { WorkReportRefrigerantLine } from '../types/inventory';
import { REFRIGERANT_SOURCE_LABELS } from '../types/inventory';

export type RefrigerantReportContext = {
  viewerCompanyId: string;
  ownerCompanyId: string;
  createdByCompanyId: string;
  sellerLabel?: string | null;
  /** Asiakkaalle jaettava tuloste — ei hintoja eikä ostoketjua. */
  customerPrint?: boolean;
};

export function isPartnerCreatedReportForOwner(ctx: Pick<RefrigerantReportContext, 'ownerCompanyId' | 'createdByCompanyId'>): boolean {
  return ctx.createdByCompanyId !== ctx.ownerCompanyId;
}

/** Raportin omistajayritys ei näe kumppanin/konkurssin toimittajatietoja. */
export function shouldHideRefrigerantSourceFromViewer(ctx: RefrigerantReportContext): boolean {
  return ctx.viewerCompanyId === ctx.ownerCompanyId && isPartnerCreatedReportForOwner(ctx);
}

export function refrigerantReportContext(
  report: Pick<{ owner_company_id: string; created_by_company_id: string }, 'owner_company_id' | 'created_by_company_id'>,
  viewerCompanyId: string | null | undefined,
): RefrigerantReportContext | null {
  if (!viewerCompanyId) return null;
  return {
    viewerCompanyId,
    ownerCompanyId: report.owner_company_id,
    createdByCompanyId: report.created_by_company_id,
  };
}

export function redactRefrigerantSupplierName(
  supplierName: string | null | undefined,
  hideSource: boolean,
): string {
  if (!hideSource && supplierName?.trim()) return supplierName.trim();
  return 'Tukkuri';
}

export function redactRefrigerantPartnerWarehouseName(
  partnerName: string | null | undefined,
  hideSource: boolean,
): string | null {
  if (!hideSource) return partnerName?.trim() || null;
  return null;
}

export function redactRefrigerantSourceLabel(
  input: {
    kind: 'purchase' | 'sale';
    source: WorkReportRefrigerantLine['source'];
    supplier_name: string | null;
    source_label: string;
  },
  hideSource: boolean,
): string {
  if (!hideSource) return input.source_label;
  if (input.kind === 'purchase') return 'Tukkuri';
  if (input.source === 'partner_warehouse') return REFRIGERANT_SOURCE_LABELS.partner_warehouse;
  if (input.source === 'supplier') return REFRIGERANT_SOURCE_LABELS.supplier;
  return REFRIGERANT_SOURCE_LABELS[input.source] ?? input.source;
}
