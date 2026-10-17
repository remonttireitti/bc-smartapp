import DataTable, { StatusMark, type DataTableColumn } from './DataTable';
import WorkReportStatusBadges from './WorkReportStatusBadges';
import WorkReportStatusMenu from './WorkReportStatusMenu';
import { canChangeWorkflowStatus } from '../lib/workReportStatusUpdate';
import { resolveWorkReportViewerRole } from '../lib/workReportViewerStatus';
import { subscriberPortalVisibilityLabel } from '../lib/subscriberPortalVisibility';
import {
  getWorkStatusLabel,
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
  billingModuleEnabled?: boolean;
  onDelete?: () => void;
  deleteBusy?: boolean;
  /** Näytä työn tilan pikavaihto kortin alla (aktiiviset työt). */
  showStatusMenu?: boolean;
  onStatusChanged?: () => void;
};

type RowProps = Omit<Props, 'billingModuleEnabled'> & { billingModuleEnabled?: boolean };

function scheduleLabel(report: WorkReport): string {
  return report.scheduled_start
    ? new Date(report.scheduled_start).toLocaleString('fi-FI', {
        day: 'numeric',
        month: 'numeric',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';
}

function workflowMenuVisible(p: RowProps): boolean {
  return !!p.showStatusMenu
    && (p.variant ?? 'default') === 'default'
    && !p.portalView
    && !!p.viewerCompanyId
    && resolveWorkReportViewerRole(p.report, p.viewerCompanyId) !== 'incoming_partner'
    && canChangeWorkflowStatus(p.report.status);
}

/** Työraportit taulukkona: Työ, Asiakas, Ajankohta, Osapuoli, Tila. */
export function WorkReportListTable({ rows }: { rows: RowProps[] }) {
  const showVisibility = rows.some((p) => p.report.subscriber_id || p.report.customers?.subscriber_id);
  const columns: DataTableColumn<RowProps>[] = [
    { key: 'title', label: 'Työ', value: (p) => p.report.title },
    { key: 'customer', label: 'Asiakas', value: (p) => p.report.customers?.name ?? '' },
    {
      key: 'when',
      label: 'Ajankohta',
      value: (p) => p.report.scheduled_start ?? '',
      render: (p) => scheduleLabel(p.report) || <span className="muted-cell">Ei ajastettu</span>,
      className: 'nowrap',
    },
    { key: 'party', label: 'Osapuoli', value: (p) => tileSubtitle(p.report, p.variant ?? 'default') },
  ];
  if (showVisibility) {
    columns.push({
      key: 'visibility',
      label: 'Tilaajalle',
      value: (p) =>
        p.report.subscriber_id || p.report.customers?.subscriber_id
          ? subscriberPortalVisibilityLabel(p.report.subscriber_portal_visibility)
          : '',
    });
  }
  columns.push({
    key: 'status',
    label: 'Tila',
    value: (p) => p.report.status,
    render: (p) =>
      !p.portalView && p.viewerCompanyId ? (
        <WorkReportStatusBadges
          workflowStatus={p.report.status}
          context={{
            status: p.report.status,
            owner_company_id: p.report.owner_company_id,
            created_by_company_id: p.report.created_by_company_id,
            delegate_company_id: p.report.delegate_company_id,
            billing: p.report.billing,
            billable: p.report.billable,
          }}
          viewerCompanyId={p.viewerCompanyId}
          hasDailyLogs={p.hasDailyLogs ?? false}
          dailyLogs={p.dailyLogs ?? []}
          customerBillingEnabled={p.customerBillingEnabled ?? false}
          compact
          hideWorkflowBadge={workflowMenuVisible(p)}
        />
      ) : (
        <StatusMark color={tileColor(p.report.status)} label={getWorkStatusLabel(p.report.status)} />
      ),
  });
  const anyActions = rows.some((p) => workflowMenuVisible(p) || p.onDelete);

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(p) => p.report.id}
      rowHref={(p) => p.linkTo ?? `/tyoraportit/${p.report.id}`}
      ariaLabel="Työraportit"
      hideFilter
      actions={
        anyActions
          ? (p) => (
              <>
                {workflowMenuVisible(p) ? (
                  <WorkReportStatusMenu
                    reportId={p.report.id}
                    status={p.report.status}
                    onChanged={() => p.onStatusChanged?.()}
                  />
                ) : null}
                {p.onDelete ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={p.deleteBusy}
                    onClick={p.onDelete}
                  >
                    {p.deleteBusy ? 'Poistetaan…' : 'Poista luonnos'}
                  </button>
                ) : null}
              </>
            )
          : undefined
      }
    />
  );
}
