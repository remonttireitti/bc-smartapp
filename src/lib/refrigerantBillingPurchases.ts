import type { BillableCalculation } from './workReportBilling';
import { warehouseDeductionTotalsFromCalculation } from './workReportBilling';

export type RefrigerantBillingPurchaseSourceRow = {
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

export type RefrigerantBillingPurchaseRow = {
  lineId: string;
  reportId: string;
  reportTitle: string;
  logDate: string;
  partnerName: string;
  customerName: string | null;
  refrigerantType: string;
  qtyKg: number;
  unitPrice: number;
  total: number;
  charged: boolean;
};

function isDelegatedPartnerOrder(
  row: Pick<RefrigerantBillingPurchaseSourceRow, 'owner_company_id' | 'created_by_company_id' | 'delegate_company_id'>,
): boolean {
  return !!row.delegate_company_id && row.created_by_company_id === row.owner_company_id;
}

function isBillablePartnerReport(
  row: Pick<RefrigerantBillingPurchaseSourceRow, 'owner_company_id' | 'created_by_company_id' | 'delegate_company_id'>,
): boolean {
  return (
    row.owner_company_id !== row.created_by_company_id
    || isDelegatedPartnerOrder(row)
  );
}

function billToPartnerName(row: RefrigerantBillingPurchaseSourceRow, viewerCompanyId?: string | null): string {
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

export function collectRefrigerantBillingPurchases(
  rows: RefrigerantBillingPurchaseSourceRow[],
  viewerCompanyId: string,
): RefrigerantBillingPurchaseRow[] {
  const purchases: RefrigerantBillingPurchaseRow[] = [];

  for (const row of rows) {
    if (!isBillablePartnerReport(row)) continue;
    const { lines } = warehouseDeductionTotalsFromCalculation(row.billable?.calculation ?? undefined);
    for (const line of lines) {
      if (!line.refrigerantLineId) continue;
      purchases.push({
        lineId: line.refrigerantLineId,
        reportId: row.id,
        reportTitle: row.title,
        logDate: line.logDate,
        partnerName: billToPartnerName(row, viewerCompanyId),
        customerName: row.customers?.name ?? null,
        refrigerantType: refrigerantTypeFromDescription(line.description),
        qtyKg: line.qty,
        unitPrice: line.unitPrice,
        total: line.total,
        charged: line.warehouseDeduction === 'deducted',
      });
    }
  }

  return purchases.sort((a, b) => {
    const dateCmp = b.logDate.localeCompare(a.logDate);
    if (dateCmp !== 0) return dateCmp;
    return a.reportTitle.localeCompare(b.reportTitle, 'fi');
  });
}

export function refrigerantBillingPurchaseTotals(rows: RefrigerantBillingPurchaseRow[]) {
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
