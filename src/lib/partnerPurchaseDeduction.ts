import {
  computeCustomerPriceFromPartnerCost,
  DEFAULT_PARTNER_EXPENSE_MARGIN_PERCENT,
} from './workReportExpenseBilling';
import type { WorkReportPartnerPurchaseLine } from '../types/partnerPurchase';

export function partnerPurchaseLineTotal(
  line: Pick<WorkReportPartnerPurchaseLine, 'qty' | 'unit_price' | 'partner_margin_percent'>,
): number {
  const qty = Number(line.qty) || 0;
  const unit = Number(line.unit_price) || 0;
  if (!(qty > 0) || !(unit > 0)) return 0;
  const margin = Number(line.partner_margin_percent);
  const marginPercent = Number.isFinite(margin) ? margin : DEFAULT_PARTNER_EXPENSE_MARGIN_PERCENT;
  const unitWithMargin = computeCustomerPriceFromPartnerCost(unit, marginPercent);
  return Math.round(qty * unitWithMargin * 100) / 100;
}

export function isPartnerPurchaseDeductionLine(
  line: Pick<WorkReportPartnerPurchaseLine, 'partner_company_id' | 'qty' | 'unit_price'>,
): boolean {
  if (!line.partner_company_id) return false;
  const qty = Number(line.qty) || 0;
  const unitPrice = Number(line.unit_price) || 0;
  return qty > 0 && unitPrice > 0;
}

export function isPartnerPurchaseOwedToViewer(
  line: Pick<WorkReportPartnerPurchaseLine, 'partner_company_id' | 'qty' | 'unit_price'>,
  viewerCompanyId: string | null | undefined,
): boolean {
  if (!viewerCompanyId || !line.partner_company_id) return false;
  if (line.partner_company_id !== viewerCompanyId) return false;
  return isPartnerPurchaseDeductionLine(line);
}

export function formatPartnerPurchaseDeductionLabel(
  line: Pick<
    WorkReportPartnerPurchaseLine,
    'description' | 'supplier_name' | 'qty' | 'unit_price' | 'partner_margin_percent' | 'partner_company'
  >,
  deducted: boolean,
): string {
  const qty = Number(line.qty) || 0;
  const unit = Number(line.unit_price) || 0;
  const margin = Number(line.partner_margin_percent);
  const marginPercent = Number.isFinite(margin) ? margin : DEFAULT_PARTNER_EXPENSE_MARGIN_PERCENT;
  const total = partnerPurchaseLineTotal(line);
  const desc = line.description.trim() || 'Työkalu/varaosa';
  const supplier = line.supplier_name?.trim();
  const partner = line.partner_company?.name?.trim();
  const status = deducted ? ' · vähennetty' : ' · ei vielä vähennetty';
  const parts = [
    'Kumppanin piikki',
    partner ? `(${partner})` : null,
    desc,
    supplier ? `tukkuri ${supplier}` : null,
    `${qty} kpl × ${formatEuro(unit)} + ${marginPercent} % = ${formatEuro(total)}`,
    status,
  ].filter(Boolean);
  return parts.join(' · ');
}

function formatEuro(amount: number): string {
  return `${amount.toFixed(2).replace('.', ',')} €`;
}

export function partnerCompanyOptionsForReport(
  report: {
    owner_company_id: string;
    created_by_company_id: string;
    delegate_company_id: string | null;
    owner_company?: { name: string | null } | null;
    created_by_company?: { name: string | null } | null;
    delegate_company?: { name: string | null } | null;
  },
  ownCompanyId: string | null | undefined,
): { id: string; name: string }[] {
  const entries: { id: string; name: string }[] = [];
  const push = (id: string | null | undefined, name: string | null | undefined) => {
    if (!id || id === ownCompanyId) return;
    if (entries.some((entry) => entry.id === id)) return;
    entries.push({ id, name: name?.trim() || 'Yritys' });
  };
  push(report.owner_company_id, report.owner_company?.name);
  push(report.created_by_company_id, report.created_by_company?.name);
  push(report.delegate_company_id, report.delegate_company?.name);
  return entries;
}
