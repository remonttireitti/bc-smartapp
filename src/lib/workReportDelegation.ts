import type { WorkReport } from '../types';
import { isAdminOrManager } from './deletePermissions';
import { isPortalPreviewActive } from './portalPreview';

function isPortalStaffReadOnly(role: string | null | undefined) {
  return role === 'subscriber' || role === 'customer' || isPortalPreviewActive();
}

/** Kumppanille lähetetty toimeksianto, jota vastaanottava yritys ei ole vielä ottanut työn alle. */
export function canAcceptDelegatedWorkOrder(input: {
  report: Pick<WorkReport, 'status' | 'delegate_company_id'>;
  companyId?: string | null;
  role?: string | null;
}) {
  const { report, companyId, role } = input;
  if (report.status !== 'delegated') return false;
  if (!companyId || companyId !== report.delegate_company_id) return false;
  if (isPortalStaffReadOnly(role)) return false;
  return role === 'admin' || role === 'manager' || role === 'technician';
}

/** Ylläpitäjä/esimies voi määrittää tekijän toiselle kuin itselleen. */
export function canAssignDelegatedWorkOrder(input: {
  report: Pick<WorkReport, 'status' | 'delegate_company_id'>;
  companyId?: string | null;
  role?: string | null;
}) {
  const { report, companyId, role } = input;
  if (report.status !== 'delegated') return false;
  if (!companyId || companyId !== report.delegate_company_id) return false;
  if (isPortalStaffReadOnly(role)) return false;
  return isAdminOrManager(role);
}
