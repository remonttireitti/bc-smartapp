import { normalizeWorkflowStatus, type WorkStatus } from '../types';

export function buildWorkReportStatusPatch(
  currentStatus: WorkStatus,
  nextStatus: WorkStatus,
): Record<string, unknown> | null {
  if (nextStatus === 'billed_partner' || nextStatus === 'billed_customer') return null;

  const patch: Record<string, unknown> = { status: nextStatus };

  if (nextStatus === 'completed') {
    patch.completed_at = new Date().toISOString();
  } else if (normalizeWorkflowStatus(currentStatus) === 'completed') {
    patch.completed_at = null;
  }

  return patch;
}
