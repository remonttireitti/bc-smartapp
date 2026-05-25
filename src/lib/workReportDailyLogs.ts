import type { WorkReport, WorkReportDailyLog } from '../types';
import { isAdminOrManager } from './deletePermissions';

export function canEditWorkReportDescription(input: {
  report: Pick<
    WorkReport,
    | 'status'
    | 'assigned_user_id'
    | 'created_by_user_id'
    | 'created_by_company_id'
    | 'owner_company_id'
    | 'delegate_company_id'
  >;
  userId: string;
  companyId?: string | null;
  role?: string | null;
}) {
  const { report, userId, companyId, role } = input;

  if (report.status === 'billed_customer' || report.status === 'billed_partner') {
    return false;
  }

  if (report.assigned_user_id === userId) return true;
  if (report.created_by_user_id === userId) return true;
  if (companyId === report.owner_company_id && isAdminOrManager(role)) return true;
  if (companyId === report.created_by_company_id && isAdminOrManager(role)) return true;
  if (companyId === report.delegate_company_id && isAdminOrManager(role)) return true;

  return false;
}

export function canManageWorkReportDailyLogs(input: {
  report: Pick<
    WorkReport,
    | 'status'
    | 'assigned_user_id'
    | 'created_by_user_id'
    | 'created_by_company_id'
    | 'owner_company_id'
    | 'delegate_company_id'
  >;
  userId: string;
  companyId?: string | null;
  role?: string | null;
}) {
  const { report, userId, companyId, role } = input;

  if (report.status === 'billed_customer' || report.status === 'billed_partner') {
    return false;
  }

  if (report.status === 'delegated') {
    return (
      companyId === report.delegate_company_id &&
      (role === 'admin' || report.assigned_user_id === userId)
    );
  }

  if (report.assigned_user_id === userId) return true;
  if (report.created_by_user_id === userId) return true;
  if (companyId === report.created_by_company_id && isAdminOrManager(role)) return true;
  if (companyId === report.owner_company_id && isAdminOrManager(role)) return true;

  return false;
}

export function dailyLogHasBillableContent(log: WorkReportDailyLog) {
  return (
    Number(log.hours_regular) > 0
    || Number(log.hours_overtime) > 0
    || Number(log.hours_on_call) > 0
    || Number(log.fixed_price_amount) > 0
    || Number(log.commission_amount) > 0
    || (log.expense_lines?.length ?? 0) > 0
  );
}
