import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import WorkReportStatusBadges from './WorkReportStatusBadges';
import { subscriberPortalVisibilityLabel } from '../lib/subscriberPortalVisibility';
import {
  reportPartyLabels,
  type WorkReport,
  type WorkReportDailyLog,
} from '../types';

type Variant = 'default' | 'incoming' | 'sent';

const STATUS_COLORS: Record<string, string> = {
  draft: '#64748b',
  scheduled: '#0ea5e9',
  in_progress: '#f59e0b',
  completed: '#22c55e',
  billed_partner: '#6366f1',
  billed_customer: '#6366f1',
  delegated: '#8b5cf6',
};

function tileColor(status: string): string {
  return STATUS_COLORS[status] ?? '#0ea5e9';
}

function tileSubtitle(report: WorkReport, variant: Variant): string {
  if (variant === 'incoming') return report.created_by_company?.name ?? 'Saapunut tilaus';
  if (variant === 'sent') return report.delegate_company?.name ?? 'Lähetetty kumppanille';
  const parties = reportPartyLabels(report);
  return parties.onBehalfOf !== '—' ? parties.onBehalfOf : parties.reporterCompany;
}

type Props = {
  report: WorkReport;
  variant?: Variant;
  portalView?: boolean;
  viewerCompanyId?: string | null;
  hasDailyLogs?: boolean;
  dailyLogs?: WorkReportDailyLog[];
  customerBillingEnabled?: boolean;
  linkTo?: string;
  onDelete?: () => void;
  deleteBusy?: boolean;
};

export function WorkReportListTile({
  report,
  variant = 'default',
  portalView = false,
  viewerCompanyId = null,
  hasDailyLogs = false,
  dailyLogs = [],
  customerBillingEnabled = false,
  linkTo,
  onDelete,
  deleteBusy = false,
}: Props) {
  const href = linkTo ?? `/tyoraportit/${report.id}`;
  const scheduleLabel = report.scheduled_start
    ? new Date(report.scheduled_start).toLocaleString('fi-FI', {
        day: 'numeric',
        month: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Ei ajastettu';
  const showStatusBadges = !portalView && !!viewerCompanyId;

  return (
    <div className="work-report-list-tile-wrap">
      <Link
        to={href}
        className="tile work-report-list-tile"
        style={{ background: tileColor(report.status) }}
      >
        <div className="work-report-list-tile-body">
          <strong className="work-report-list-tile-title">{report.title}</strong>
          <span className="work-report-list-tile-line">{report.customers?.name ?? '—'}</span>
          <span className="work-report-list-tile-line">{scheduleLabel}</span>
          <span className="work-report-list-tile-meta">{tileSubtitle(report, variant)}</span>
          {report.subscriber_id || report.customers?.subscriber_id ? (
            <span className="work-report-list-tile-meta">
              {subscriberPortalVisibilityLabel(report.subscriber_portal_visibility)}
            </span>
          ) : null}
        </div>
        {showStatusBadges ? (
          <div className="work-report-list-tile-footer">
            <WorkReportStatusBadges
              workflowStatus={report.status}
              context={{
                status: report.status,
                owner_company_id: report.owner_company_id,
                created_by_company_id: report.created_by_company_id,
                delegate_company_id: report.delegate_company_id,
                billing: report.billing,
                billable: report.billable,
              }}
              viewerCompanyId={viewerCompanyId}
              hasDailyLogs={hasDailyLogs}
              dailyLogs={dailyLogs}
              customerBillingEnabled={customerBillingEnabled}
              compact
            />
          </div>
        ) : null}
      </Link>
      {onDelete ? (
        <button
          type="button"
          className="btn btn-secondary btn-sm work-report-list-tile-delete"
          disabled={deleteBusy}
          onClick={onDelete}
        >
          {deleteBusy ? 'Poistetaan…' : 'Poista luonnos'}
        </button>
      ) : null}
    </div>
  );
}

export function WorkReportListGrid({ children }: { children: ReactNode }) {
  return <div className="grid work-report-list-grid">{children}</div>;
}
