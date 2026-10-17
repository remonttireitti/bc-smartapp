import { reportPartner } from '../lib/workReportPartnerFilter';
import DataTable, { StatusMark, type DataTableColumn } from './DataTable';
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
  scheduled: '#64748b',
  in_progress: '#2563eb',
  completed: '#f97316',
  billed_partner: '#16a34a',
  billed_customer: '#16a34a',
  delegated: '#8b5cf6',
};

const LIST_STATUS_LABELS: Record<string, string> = {
  draft: 'Luonnos',
  scheduled: 'Tulossa',
  in_progress: 'Työn alla',
  completed: 'Laskuttamatta',
  billed_partner: 'Laskutettu',
  billed_customer: 'Laskutettu',
};

function listStatusLabel(status: string): string {
  return LIST_STATUS_LABELS[status] ?? getWorkStatusLabel(status);
}

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
export function WorkReportListTable({ rows, showPartner = true }: { rows: RowProps[]; showPartner?: boolean }) {
  const showVisibility = rows.some((p) => p.report.subscriber_id || p.report.customers?.subscriber_id);
  const columns: DataTableColumn<RowProps>[] = [
    {
      key: 'title',
      label: 'Työ',
      value: (p) => p.report.title,
      render: (p) => (
        <>
          {p.report.title}
          {p.report.is_onboarding_demo ? <span className="badge badge-demo">Esimerkki</span> : null}
        </>
      ),
    },
    { key: 'customer', label: 'Asiakas', value: (p) => p.report.customers?.name ?? '' },
    {
      key: 'when',
      label: 'Ajankohta',
      value: (p) => p.report.scheduled_start ?? '',
      render: (p) => scheduleLabel(p.report) || <span className="muted-cell">Ei ajastettu</span>,
      className: 'nowrap',
    },
    ...(showPartner ? [{
      key: 'party',
      label: 'Kumppani',
      value: (p) =>
        (p.variant ?? 'default') === 'default'
          ? reportPartner(p.report, p.viewerCompanyId)?.name ?? 'Omat'
          : tileSubtitle(p.report, p.variant ?? 'default'),
    }] as DataTableColumn<RowProps>[] : []),
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
    value: (p) => listStatusLabel(p.report.status),
    render: (p) => <StatusMark color={tileColor(p.report.status)} label={listStatusLabel(p.report.status)} />,
  });
  const anyActions = rows.some((p) => workflowMenuVisible(p) || p.onDelete);

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(p) => p.report.id}
      rowHref={(p) => p.linkTo ?? `/tyoraportit/${p.report.id}`}
      rowAccent={(p) => tileColor(p.report.status)}
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
