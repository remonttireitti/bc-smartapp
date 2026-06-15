import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkReport } from '../types';
import { refreshAndPersistPartnerBillable } from './workReportPartnerBillingPersist';
import { fetchWorkReportDetailLogs } from './workReportDailyLogSelect';

function isPartnerReport(
  report: Pick<WorkReport, 'owner_company_id' | 'created_by_company_id' | 'delegate_company_id'>,
): boolean {
  const isDelegatedOrder =
    !!report.delegate_company_id && report.created_by_company_id === report.owner_company_id;
  return report.created_by_company_id !== report.owner_company_id || isDelegatedOrder;
}

/** Pakota kumppanilaskelman tallennus heti päiväkirjausmuutoksen jälkeen. Asiakaslaskua ei lasketa tähän (vain tulostus). */
export async function syncWorkReportBillingAfterLogChange(
  supabase: SupabaseClient,
  report: Pick<
    WorkReport,
    | 'id'
    | 'owner_company_id'
    | 'created_by_company_id'
    | 'delegate_company_id'
    | 'partnership_id'
    | 'customers'
    | 'owner_company'
    | 'delegate_company'
  >,
  viewerCompanyId: string | null | undefined,
): Promise<void> {
  if (!isPartnerReport(report) || viewerCompanyId !== report.created_by_company_id) {
    return;
  }

  const { logs, error } = await fetchWorkReportDetailLogs(supabase, report.id);
  if (error) {
    console.error('Päiväkirjausten lataus laskentaa varten epäonnistui:', error.message);
    return;
  }

  await refreshAndPersistPartnerBillable(supabase, report, logs);
}
