import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkReport } from '../types';
import { loadCompanyTracksCustomerInvoicing } from './management';
import { refreshAndPersistCustomerBillable } from './workReportCustomerBillingPersist';
import { refreshAndPersistPartnerBillable } from './workReportPartnerBillingPersist';
import { fetchWorkReportDetailLogs } from './workReportDailyLogSelect';

function isPartnerReport(
  report: Pick<WorkReport, 'owner_company_id' | 'created_by_company_id' | 'delegate_company_id'>,
): boolean {
  const isDelegatedOrder =
    !!report.delegate_company_id && report.created_by_company_id === report.owner_company_id;
  return report.created_by_company_id !== report.owner_company_id || isDelegatedOrder;
}

/** Pakota laskelman tallennus heti päiväkirjausmuutoksen jälkeen. */
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
  const { logs, error } = await fetchWorkReportDetailLogs(supabase, report.id);
  if (error) {
    console.error('Päiväkirjausten lataus laskentaa varten epäonnistui:', error.message);
    return;
  }

  const tasks: Promise<unknown>[] = [];

  if (isPartnerReport(report) && viewerCompanyId === report.created_by_company_id) {
    tasks.push(refreshAndPersistPartnerBillable(supabase, report, logs));
  }

  const tracksCustomer = await loadCompanyTracksCustomerInvoicing(supabase, report.owner_company_id);
  if (tracksCustomer) {
    tasks.push(refreshAndPersistCustomerBillable(supabase, report, logs));
  }

  await Promise.all(tasks);
}
