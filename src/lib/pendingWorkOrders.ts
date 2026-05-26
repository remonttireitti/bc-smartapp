import type { SupabaseClient } from '@supabase/supabase-js';
import { isSubscriberPortalWorkOrder } from './portalWorkOrder';

const SUBSCRIBER_PENDING_SELECT =
  'id, status, subscriber_id, assigned_user_id, created_by_company_id, owner_company_id, created_by_user_id';

export interface PendingWorkOrderCounts {
  fromSubscriber: number;
  fromPartner: number;
  total: number;
}

export async function loadPendingWorkOrderCounts(
  supabase: SupabaseClient,
  companyId: string,
  viewerUserId: string,
): Promise<PendingWorkOrderCounts> {
  if (!companyId) {
    return { fromSubscriber: 0, fromPartner: 0, total: 0 };
  }

  const [subscriberResult, partnerResult] = await Promise.all([
    supabase
      .from('work_reports')
      .select(SUBSCRIBER_PENDING_SELECT)
      .eq('owner_company_id', companyId)
      .eq('status', 'draft')
      .not('subscriber_id', 'is', null),
    supabase
      .from('work_reports')
      .select('id')
      .eq('delegate_company_id', companyId)
      .eq('status', 'delegated'),
  ]);

  if (subscriberResult.error) console.error(subscriberResult.error);
  if (partnerResult.error) console.error(partnerResult.error);

  const fromSubscriber = (subscriberResult.data ?? []).filter((row) =>
    isSubscriberPortalWorkOrder(row, viewerUserId),
  ).length;

  const fromPartner = partnerResult.data?.length ?? 0;

  return {
    fromSubscriber,
    fromPartner,
    total: fromSubscriber + fromPartner,
  };
}

export function formatPendingWorkOrderMessage(counts: PendingWorkOrderCounts): string | null {
  if (counts.total <= 0) return null;

  if (counts.total === 1) {
    if (counts.fromSubscriber === 1) return 'Sinulle on tullut uusi työtilaus tilaajalta.';
    return 'Sinulle on tullut uusi toimeksianto kumppanilta.';
  }

  const parts: string[] = [];
  if (counts.fromSubscriber > 0) {
    parts.push(
      counts.fromSubscriber === 1
        ? '1 tilaajalta'
        : `${counts.fromSubscriber} tilaajalta`,
    );
  }
  if (counts.fromPartner > 0) {
    parts.push(
      counts.fromPartner === 1 ? '1 kumppanilta' : `${counts.fromPartner} kumppanilta`,
    );
  }

  return `Sinulle on ${counts.total} uutta työtilausta (${parts.join(', ')}).`;
}
