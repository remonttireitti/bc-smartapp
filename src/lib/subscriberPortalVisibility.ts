import { isMaintenanceReportPublished } from './maintenanceReportStatus';
import type { WorkStatus } from '../types';

export type SubscriberPortalVisibility = 'when_ready' | 'as_draft' | 'as_in_progress';

export type SubscriberPortalReportKind = 'work' | 'quote' | 'maintenance';

export const SUBSCRIBER_PORTAL_VISIBILITY_DEFAULT: SubscriberPortalVisibility = 'when_ready';

export const SUBSCRIBER_PORTAL_VISIBILITY_OPTIONS: {
  value: SubscriberPortalVisibility;
  label: string;
  hint: string;
}[] = [
  {
    value: 'when_ready',
    label: 'Vasta valmis (oletus)',
    hint: 'Tilaaja näkee raportin vasta kun se on valmis / lähetetty.',
  },
  {
    value: 'as_draft',
    label: 'Näkyy luonnoksena',
    hint: 'Tilaaja voi seurata raporttia jo luonnosvaiheessa.',
  },
  {
    value: 'as_in_progress',
    label: 'Näkyy työn alla',
    hint: 'Tilaaja näkee raportin ajoitetun tai käynnissä olevan työn ajan.',
  },
];

const WORK_IN_PROGRESS_STATUSES: WorkStatus[] = ['scheduled', 'in_progress', 'delegated'];

function normalizeVisibility(
  visibility: SubscriberPortalVisibility | string | null | undefined,
): SubscriberPortalVisibility {
  if (visibility === 'as_draft' || visibility === 'as_in_progress') return visibility;
  return SUBSCRIBER_PORTAL_VISIBILITY_DEFAULT;
}

function isWorkReportReady(status: string) {
  return status === 'completed' || status === 'billed_partner' || status === 'billed_customer';
}

function isQuoteReady(status: string) {
  return status === 'sent';
}

export function subscriberPortalReportVisible(args: {
  kind: SubscriberPortalReportKind;
  visibility?: SubscriberPortalVisibility | string | null;
  status: string;
}): boolean {
  const visibility = normalizeVisibility(args.visibility);
  const status = args.status.trim();
  const statusLower = status.toLowerCase();

  if (args.kind === 'work' && isWorkReportReady(status)) return true;
  if (args.kind === 'quote' && isQuoteReady(status)) return true;
  if (args.kind === 'maintenance' && isMaintenanceReportPublished(status)) return true;

  if (visibility === 'as_draft') {
    return statusLower === 'draft';
  }

  if (visibility === 'as_in_progress') {
    if (args.kind === 'work') {
      return WORK_IN_PROGRESS_STATUSES.includes(status as WorkStatus);
    }
    return statusLower === 'draft';
  }

  return false;
}

export function subscriberPortalVisibilityLabel(
  visibility: SubscriberPortalVisibility | string | null | undefined,
): string {
  return (
    SUBSCRIBER_PORTAL_VISIBILITY_OPTIONS.find((option) => option.value === normalizeVisibility(visibility))
      ?.label ?? SUBSCRIBER_PORTAL_VISIBILITY_OPTIONS[0].label
  );
}

export function reportHasSubscriberLink(args: {
  subscriber_id?: string | null;
  customer_subscriber_id?: string | null;
}): boolean {
  return !!(args.subscriber_id || args.customer_subscriber_id);
}
