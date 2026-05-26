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
