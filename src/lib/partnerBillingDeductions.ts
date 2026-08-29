import type { BillableCalculation, BillableLine } from './workReportBilling';
import { warehouseDeductionTotalsFromCalculation } from './workReportBilling';

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
