export function isAdminOrManager(role: string | null | undefined) {
  return role === 'admin' || role === 'manager';
}

export function canDeleteCompanyOwnedEntity(
  ownerCompanyId: string,
  myCompanyId: string | null | undefined,
  role: string | null | undefined,
  isGlobalAdmin?: boolean,
) {
  if (isGlobalAdmin) return true;
  if (!myCompanyId || !isAdminOrManager(role)) return false;
  return ownerCompanyId === myCompanyId;
}

export function canDeleteWorkReport(
  report: { created_by_user_id?: string | null },
  userId: string,
  isGlobalAdmin?: boolean,
  role?: string | null,
) {
  if (role === 'subscriber' || role === 'customer') return false;
  if (isGlobalAdmin) return true;
  return report.created_by_user_id === userId;
}

export function canDeleteMaintenanceReport(
  report: {
    status: string;
    owner_company_id: string;
    created_by_company_id?: string | null;
    assigned_user_id?: string | null;
  },
  userId: string,
  myCompanyId: string | null | undefined,
  role: string | null | undefined,
  isGlobalAdmin?: boolean,
) {
  if (role === 'subscriber' || role === 'customer') return false;
  if (isGlobalAdmin) return true;
  if (canDeleteCompanyOwnedEntity(report.owner_company_id, myCompanyId, role, isGlobalAdmin)) {
    return true;
  }
  if (report.status !== 'draft') return false;
  if (report.assigned_user_id && report.assigned_user_id === userId) return true;
  if (
    report.created_by_company_id
    && myCompanyId
    && report.created_by_company_id === myCompanyId
    && role !== 'subscriber'
    && role !== 'customer'
  ) {
    return true;
  }
  return false;
}
