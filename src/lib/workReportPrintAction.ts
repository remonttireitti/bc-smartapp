import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveCompanyLogoUrl } from './companyLogo';
import { resolveDailyLogImagesByLogId } from './dailyLogImages';
import { openPrintHtml } from './openPrintWindow';
import { supabase } from './supabase';
import type { BillableCalculation } from './workReportBilling';
import { generateWorkReportPrintHtml } from './workReportPrintHtml';
import type { WorkReport, WorkReportDailyLog } from '../types';

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

const LOG_SELECT = `
  id, work_report_id, log_date, entry_type,
  hours_regular, hours_overtime, hours_on_call, fixed_price_amount, hourly_rate_override,
  commission_amount, commission_note, work_done, created_by, created_at,
  author_name_snapshot, author_deleted,
  author:profiles!work_report_daily_logs_created_by_fkey(display_name),
  expense_lines:work_report_daily_expense_lines(id, daily_log_id, expense_type, description, qty, unit_price, bill_to_partner, bill_to_customer, customer_unit_price, sort_order),
  refrigerant_lines:work_report_refrigerant_lines(
    id, daily_log_id, work_report_id, source, cylinder_id, warehouse_company_id, owner_user_id, supplier_name,
    supplier_paid_by, unit_price, customer_unit_price, bill_to_customer,
    refrigerant_type, qty_kg, notes, created_by, created_at,
    cylinder:refrigerant_cylinders(serial_number, refrigerant_type),
    warehouse_company:companies!work_report_refrigerant_lines_warehouse_company_id_fkey(name),
    owner_user:profiles!work_report_refrigerant_lines_owner_user_id_fkey(display_name)
  ),
  images:work_report_daily_log_images(id, daily_log_id, storage_path, file_name, mime_type)
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

export async function buildWorkReportPrintHtmlDocument(input: {
  report: WorkReport;
  logs: WorkReportDailyLog[];
  calculation?: BillableCalculation | null;
  customerCalculation?: BillableCalculation | null;
  showPartnerPrices?: boolean;
  viewerCompanyId?: string | null;
  client?: SupabaseClient;
}) {
  const db = input.client ?? supabase;
  const { isPartnerReport, hideAssignee } = resolvePrintContext(input.report, input.viewerCompanyId);
  const logs = sortLogsForPrint(input.logs);
  const logImages = await resolveDailyLogImagesByLogId(logs);

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

  const calculation =
    input.showPartnerPrices && isPartnerReport ? (input.calculation ?? null) : null;

  return generateWorkReportPrintHtml({
    report: input.report,
    logs,
    logImages,
    showPartnerPrices: !!input.showPartnerPrices && isPartnerReport && !!calculation,
    calculation,
    customerCalculation: input.customerCalculation ?? null,
    meta: { companyName, logoUrl },
    hideAssignee,
  });
}

export async function loadWorkReportPrintBundle(
  reportId: string,
  options?: { showPartnerPrices?: boolean; viewerCompanyId?: string | null; client?: SupabaseClient },
) {
  const db = options?.client ?? supabase;

  const [{ data: reportData, error: reportError }, { data: logsData }, { data: billableData }] =
    await Promise.all([
      db.from('work_reports').select(REPORT_SELECT).eq('id', reportId).single(),
      db
        .from('work_report_daily_logs')
        .select(LOG_SELECT)
        .eq('work_report_id', reportId)
        .order('log_date', { ascending: true })
        .order('created_at', { ascending: true }),
      db
        .from('work_report_billable')
        .select('calculation, customer_calculation, customer_total')
        .eq('work_report_id', reportId)
        .maybeSingle(),
    ]);

  if (reportError || !reportData) {
    throw new Error(reportError?.message ?? 'Työraporttia ei löytynyt.');
  }

  const report = reportData as unknown as WorkReport;
  const logs = (logsData as unknown as WorkReportDailyLog[]) ?? [];
  const { isPartnerReport } = resolvePrintContext(report, options?.viewerCompanyId);
  const calculation = (billableData?.calculation as BillableCalculation | undefined) ?? null;
  const customerCalculation =
    (billableData?.customer_calculation as BillableCalculation | undefined) ?? null;

  const html = await buildWorkReportPrintHtmlDocument({
    report,
    logs,
    calculation: isPartnerReport ? calculation : null,
    customerCalculation,
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
  showPartnerPrices?: boolean;
  viewerCompanyId?: string | null;
  client?: SupabaseClient;
}) {
  const html = await buildWorkReportPrintHtmlDocument(input);
  openPrintHtml(html);
}
