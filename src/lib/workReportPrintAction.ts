import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveCompanyLogoUrl } from './companyLogo';
import { resolveDailyLogImagesForPrint } from './dailyLogImages';
import { openPrintHtml } from './openPrintWindow';
import { supabase } from './supabase';
import type { BillableCalculation } from './workReportBilling';
import { fetchWorkReportPrintLogs } from './workReportDailyLogSelect';
import {
  calculateWorkReportCustomerBillableFromQuote,
  customerUsesFixedQuote,
  customerUsesQuotePlusExtras,
  parseBillingQuoteSettings,
  type BillingQuoteSettings,
} from './workReportBillingQuote';
import { generateWorkReportPrintHtml, type WorkReportPrintMode } from './workReportPrintHtml';
import type { WorkReport, WorkReportDailyLog } from '../types';

export type { WorkReportPrintMode } from './workReportPrintHtml';

export function workReportPrintPath(reportId: string, mode: WorkReportPrintMode = 'customer') {
  return mode === 'internal'
    ? `/tyoraportit/${reportId}/tuloste?hinnat=1`
    : `/tyoraportit/${reportId}/tuloste`;
}

const REPORT_SELECT = `
  id, title, heading, description, orderer_name, location_text, status,
  scheduled_start, scheduled_end, completed_at,
  owner_company_id, created_by_company_id, created_by_user_id, branding_company_id,
  partnership_id, customer_id, equipment_id, assigned_user_id,
  delegate_company_id, delegated_at,
  created_by_user_name_snapshot, created_by_user_deleted,
  assigned_user_name_snapshot, assigned_user_deleted,
  customers(name),
  equipment(name, tag),
  owner_company:companies!work_reports_owner_company_id_fkey(name),
  branding_company:companies!work_reports_branding_company_id_fkey(name),
  created_by_company:companies!work_reports_created_by_company_id_fkey(name),
  delegate_company:companies!work_reports_delegate_company_id_fkey(name),
  assigned_user:profiles!work_reports_assigned_user_id_fkey(display_name),
  created_by_user:profiles!work_reports_created_by_user_id_fkey(display_name, email)
`;

function sortLogsForPrint(logs: WorkReportDailyLog[]) {
  return [...logs].sort((a, b) => {
    const dateCmp = a.log_date.localeCompare(b.log_date);
    if (dateCmp !== 0) return dateCmp;
    return a.created_at.localeCompare(b.created_at);
  });
}

function resolvePrintContext(
  report: WorkReport,
  viewerCompanyId?: string | null,
) {
  const isDelegatedOrder =
    !!report.delegate_company_id && report.created_by_company_id === report.owner_company_id;
  const isPartnerReport =
    report.created_by_company_id !== report.owner_company_id || isDelegatedOrder;
  const hideAssignee = !!isDelegatedOrder && viewerCompanyId === report.created_by_company_id;

  return { isPartnerReport, hideAssignee };
}

function resolvePrintCustomerCalculation(
  billingQuote: BillingQuoteSettings,
  stored: BillableCalculation | null,
  customerName: string | null,
): BillableCalculation | null {
  if (customerUsesQuotePlusExtras(billingQuote)) {
    return stored;
  }
  if (customerUsesFixedQuote(billingQuote)) {
    return (
      calculateWorkReportCustomerBillableFromQuote({
        settings: billingQuote,
        customerName,
        ratesSource: stored?.ratesSource ?? 'company_default',
      }) ?? stored
    );
  }
  return stored;
}

export async function buildWorkReportPrintHtmlDocument(input: {
  report: WorkReport;
  logs: WorkReportDailyLog[];
  calculation?: BillableCalculation | null;
  customerCalculation?: BillableCalculation | null;
  billingQuote?: BillingQuoteSettings | null;
  printMode?: WorkReportPrintMode;
  /** @deprecated Käytä printMode='internal' */
  showPartnerPrices?: boolean;
  viewerCompanyId?: string | null;
  client?: SupabaseClient;
}) {
  const db = input.client ?? supabase;
  const { isPartnerReport, hideAssignee } = resolvePrintContext(input.report, input.viewerCompanyId);
  const logs = sortLogsForPrint(input.logs);
  const logImages = await resolveDailyLogImagesForPrint(logs);

  const brandingCompanyId = input.report.branding_company_id ?? input.report.owner_company_id;
  const { data: companyRow } = await db
    .from('companies')
    .select('name, logo_url')
    .eq('id', brandingCompanyId)
    .single();

  const companyName = (companyRow as { name: string } | null)?.name ?? '—';
  let logoUrl: string | undefined;
  try {
    logoUrl =
      (await resolveCompanyLogoUrl((companyRow as { logo_url: string | null } | null)?.logo_url)) ??
      undefined;
  } catch {
    logoUrl = undefined;
  }

  const printMode: WorkReportPrintMode =
    input.printMode ?? (input.showPartnerPrices ? 'internal' : 'customer');
  const showInternalPrices = printMode === 'internal';
  const partnerCalculation =
    showInternalPrices && isPartnerReport ? (input.calculation ?? null) : null;
  const billingQuote = parseBillingQuoteSettings(input.billingQuote ?? {});
  const customerCalculation = showInternalPrices
    ? resolvePrintCustomerCalculation(
        billingQuote,
        input.customerCalculation ?? null,
        input.report.customers?.name ?? null,
      )
    : null;

  return generateWorkReportPrintHtml({
    report: input.report,
    logs,
    logImages,
    printMode,
    showPartnerPrices: showInternalPrices && isPartnerReport && !!partnerCalculation,
    calculation: partnerCalculation,
    customerCalculation,
    billingQuote,
    meta: { companyName, logoUrl },
    hideAssignee,
    viewerCompanyId: input.viewerCompanyId,
  });
}

export async function loadWorkReportPrintBundle(
  reportId: string,
  options?: {
    printMode?: WorkReportPrintMode;
    showPartnerPrices?: boolean;
    viewerCompanyId?: string | null;
    client?: SupabaseClient;
  },
) {
  const db = options?.client ?? supabase;

  const [{ data: reportData, error: reportError }, logsResult, { data: billableData }] =
    await Promise.all([
      db.from('work_reports').select(REPORT_SELECT).eq('id', reportId).single(),
      fetchWorkReportPrintLogs(db, reportId),
      db
        .from('work_report_billable')
        .select('calculation, customer_calculation, customer_total, billing_quote')
        .eq('work_report_id', reportId)
        .maybeSingle(),
    ]);

  if (reportError || !reportData) {
    throw new Error(reportError?.message ?? 'Työraporttia ei löytynyt.');
  }

  if (logsResult.error) {
    throw new Error(logsResult.error.message);
  }

  const report = reportData as unknown as WorkReport;
  const logs = logsResult.logs;
  const { isPartnerReport } = resolvePrintContext(report, options?.viewerCompanyId);
  const calculation = (billableData?.calculation as BillableCalculation | undefined) ?? null;
  const storedCustomerCalculation =
    (billableData?.customer_calculation as BillableCalculation | undefined) ?? null;
  const billingQuote = parseBillingQuoteSettings(billableData?.billing_quote ?? {});
  const customerCalculation = resolvePrintCustomerCalculation(
    billingQuote,
    storedCustomerCalculation,
    (reportData as { customers?: { name?: string } }).customers?.name ?? null,
  );

  const html = await buildWorkReportPrintHtmlDocument({
    report,
    logs,
    calculation: isPartnerReport ? calculation : null,
    customerCalculation,
    billingQuote,
    printMode: options?.printMode,
    showPartnerPrices: options?.showPartnerPrices,
    viewerCompanyId: options?.viewerCompanyId,
    client: db,
  });

  return {
    report,
    html,
    calculation: isPartnerReport ? calculation : null,
    customerCalculation,
  };
}

export async function openWorkReportPrint(input: {
  reportId: string;
  printMode?: WorkReportPrintMode;
  showPartnerPrices?: boolean;
  viewerCompanyId?: string | null;
  client?: SupabaseClient;
}) {
  const { html } = await loadWorkReportPrintBundle(input.reportId, input);
  openPrintHtml(html);
}

export async function openWorkReportPrintFromLoaded(input: {
  report: WorkReport;
  logs: WorkReportDailyLog[];
  calculation?: BillableCalculation | null;
  customerCalculation?: BillableCalculation | null;
  printMode?: WorkReportPrintMode;
  showPartnerPrices?: boolean;
  viewerCompanyId?: string | null;
  client?: SupabaseClient;
}) {
  const html = await buildWorkReportPrintHtmlDocument(input);
  openPrintHtml(html);
}
