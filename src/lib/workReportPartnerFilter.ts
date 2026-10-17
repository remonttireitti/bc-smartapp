import type { WorkReport } from '../types';

export const OWN_PARTNER_KEY = '__own__';
const STORAGE_KEY = 'bc.workReports.partnerFilter';

type PartnerFields = Pick<
  WorkReport,
  'owner_company_id' | 'created_by_company_id' | 'delegate_company_id' | 'owner_company' | 'created_by_company' | 'delegate_company'
> & { branding_company?: { name: string } | null; branding_company_id?: string | null };

/** Raportin kumppani katsojan näkökulmasta (null = omat työt). */
export function reportPartner(report: PartnerFields, viewerCompanyId: string | null | undefined): { id: string; name: string } | null {
  if (!viewerCompanyId) return null;
  if (report.delegate_company_id && report.delegate_company_id !== viewerCompanyId) {
    return { id: report.delegate_company_id, name: report.delegate_company?.name ?? 'Kumppani' };
  }
  if (report.created_by_company_id && report.created_by_company_id !== viewerCompanyId) {
    return { id: report.created_by_company_id, name: report.created_by_company?.name ?? 'Kumppani' };
  }
  if (report.owner_company_id && report.owner_company_id !== viewerCompanyId) {
    return { id: report.owner_company_id, name: report.owner_company?.name ?? 'Kumppani' };
  }
  return null;
}

export function reportPartnerKey(report: PartnerFields, viewerCompanyId: string | null | undefined): string {
  return reportPartner(report, viewerCompanyId)?.id ?? OWN_PARTNER_KEY;
}

export function partnerFilterOptions(reports: PartnerFields[], viewerCompanyId: string | null | undefined) {
  const map = new Map<string, string>();
  let own = false;
  for (const r of reports) {
    const p = reportPartner(r, viewerCompanyId);
    if (p) map.set(p.id, p.name);
    else own = true;
  }
  return {
    partners: [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'fi')),
    hasOwn: own,
  };
}

export function readPartnerFilter(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function writePartnerFilter(value: string) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, value);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
