/** Tila, jolloin huoltoraportti näkyy tilaajalle / asiakasportaalissa. */
const PUBLISHED_STATUSES = new Set([
  'submitted',
  'completed',
  'valmis',
  'toimitettu',
  'complete',
  'ready',
  'done',
]);

export function isMaintenanceReportPublished(status: string | null | undefined): boolean {
  const key = String(status ?? '').trim().toLowerCase();
  return PUBLISHED_STATUSES.has(key);
}

export function normalizeMaintenanceReportStatusForSave(
  status: string | null | undefined,
): 'draft' | 'submitted' {
  return isMaintenanceReportPublished(status) ? 'submitted' : 'draft';
}
