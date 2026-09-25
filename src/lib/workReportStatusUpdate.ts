import { WORK_STATUS_LABELS, normalizeWorkflowStatus, type WorkStatus } from '../types';

/**
 * Työn tilat, joita käyttäjä voi vaihtaa suoraan (raportti- ja listanäkymä).
 * Luonnos ja "Odottaa vastaanottoa" kuuluvat omiin työnkulkuihinsa (luonnoksen
 * muokkaus / toimeksiannon vastaanotto), eikä niihin siirrytä käsin.
 * Laskutus (Laskutettu / Osittain laskutettu) on erillinen tieto work_report_billing-taulussa.
 */
export const EDITABLE_WORKFLOW_STATUSES: WorkStatus[] = ['scheduled', 'in_progress', 'completed'];

/** Voiko työn tilaa vaihtaa valikosta nykyisestä tilasta. */
export function canChangeWorkflowStatus(status: WorkStatus | string | null | undefined): boolean {
  const normalized = normalizeWorkflowStatus(String(status ?? '') as WorkStatus);
  return EDITABLE_WORKFLOW_STATUSES.includes(normalized);
}

/** Valikon vaihtoehdot (kaikki muokattavat tilat, nykyinen merkitään aktiiviseksi). */
export function workflowStatusMenuOptions(
  status: WorkStatus | string | null | undefined,
): Array<{ value: WorkStatus; label: string; active: boolean }> {
  if (!canChangeWorkflowStatus(status)) return [];
  const current = normalizeWorkflowStatus(String(status) as WorkStatus);
  return EDITABLE_WORKFLOW_STATUSES.map((value) => ({
    value,
    label: WORK_STATUS_LABELS[value],
    active: value === current,
  }));
}

export function workflowStatusChangedNotice(nextStatus: WorkStatus): string {
  return `Työn tila vaihdettu: ${WORK_STATUS_LABELS[normalizeWorkflowStatus(nextStatus)]}.`;
}

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
