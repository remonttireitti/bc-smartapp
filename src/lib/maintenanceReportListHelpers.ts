import { resolveMaintenanceReportTitle } from './huoltoRaportti/defaults';
import type { HuoltoReportData } from './huoltoRaportti/types';
import { isMaintenanceReportPublished } from './maintenanceReportStatus';

export type MaintenanceReportListItem = {
  id: string;
  status: string;
  title: string | null;
  data: HuoltoReportData;
  updated_at: string;
  owner_company_id: string;
  customers: { name: string } | null;
  equipment: { name: string; tag: string | null } | null;
  owner_company: { name: string } | null;
  branding_company: { name: string } | null;
};

const STATUS_COLORS: Record<string, string> = {
  draft: '#64748b',
  submitted: '#22c55e',
};

export function maintenanceReportTileColor(status: string): string {
  return isMaintenanceReportPublished(status) ? STATUS_COLORS.submitted : STATUS_COLORS.draft;
}

export function maintenanceReportTileTitle(report: MaintenanceReportListItem): string {
  const data = report.data ?? ({} as HuoltoReportData);
  const customerName = report.customers?.name ?? data.asiakas;
  return resolveMaintenanceReportTitle(report.title, data, customerName);
}

export function maintenanceReportTileLines(
  report: MaintenanceReportListItem,
  myCompanyId: string | null,
): { customerLine: string; detailLine: string; registryLine: string | null } {
  const data = report.data ?? ({} as HuoltoReportData);
  const customerName = report.customers?.name ?? data.asiakas ?? '—';
  const deviceLabel = report.equipment?.tag || report.equipment?.name || data.laiteTunnus || data.laiteMalli;
  const address = data.osoite?.trim();
  const detailParts = [address, deviceLabel].filter(Boolean);
  const isPartnerRegistry = Boolean(myCompanyId && report.owner_company_id !== myCompanyId);
  const registryLabel = isPartnerRegistry ? report.owner_company?.name : report.branding_company?.name;

  return {
    customerLine: customerName,
    detailLine: detailParts.length > 0 ? detailParts.join(' • ') : '—',
    registryLine: registryLabel?.trim() || null,
  };
}

export function maintenanceReportSearchText(report: MaintenanceReportListItem): string {
  const data = report.data ?? ({} as HuoltoReportData);
  return [
    maintenanceReportTileTitle(report),
    report.customers?.name,
    data.asiakas,
    report.equipment?.name,
    report.equipment?.tag,
    data.laiteTunnus,
    data.laiteMalli,
    data.osoite,
    report.owner_company?.name,
    report.branding_company?.name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}
