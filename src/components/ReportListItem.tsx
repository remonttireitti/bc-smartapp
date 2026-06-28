import { Link } from 'react-router-dom';



import WorkReportStatusBadges from './WorkReportStatusBadges';

import WorkReportStatusMenu from './WorkReportStatusMenu';

import WorkReportBillingStatusMenu from './WorkReportBillingStatusMenu';

import { subscriberPortalVisibilityLabel } from '../lib/subscriberPortalVisibility';

import {

  isIncomingPartnerBill,

  type BillingListRow,

} from '../lib/workReportBillingCopy';

import {
  getWorkStatusLabel,
  getPortalWorkStatusLabel,
  reportPartyLabels,
  type WorkReport,
  type WorkReportDailyLog,
} from '../types';



type Variant = 'default' | 'incoming' | 'sent';



export function ReportListItem({

  report,

  variant = 'default',

  viewerCompanyId = null,

  hasDailyLogs = false,

  dailyLogs = [],

  billingModuleEnabled = false,

  customerBillingEnabled = false,

  showStatusMenu = false,

  portalView = false,

  onStatusChanged,

}: {

  report: WorkReport;

  variant?: Variant;

  viewerCompanyId?: string | null;

  hasDailyLogs?: boolean;

  dailyLogs?: WorkReportDailyLog[];

  billingModuleEnabled?: boolean;

  customerBillingEnabled?: boolean;

  showStatusMenu?: boolean;

  portalView?: boolean;

  onStatusChanged?: () => void;

}) {

  const parties = reportPartyLabels(report);

  const statusContext = {

    status: report.status,

    owner_company_id: report.owner_company_id,

    created_by_company_id: report.created_by_company_id,

    delegate_company_id: report.delegate_company_id,

    billing: report.billing,

    billable: report.billable,

  };

  const hasSubscriberLink = !!(report.subscriber_id || report.customers?.subscriber_id);

  const billingRow: BillingListRow = {

    id: report.id,

    title: report.title,

    status: report.status,

    completed_at: report.completed_at,

    scheduled_start: report.scheduled_start,

    created_at: report.created_at,

    owner_company_id: report.owner_company_id,

    created_by_company_id: report.created_by_company_id,

    delegate_company_id: report.delegate_company_id,

    customers: report.customers,

    owner_company: report.owner_company,

    delegate_company: report.delegate_company,

    billing: report.billing

      ? {

          partner_invoice_status: report.billing.partner_invoice_status ?? 'none',

          partner_invoice_amount: null,

          partner_billed_amount: report.billing.partner_billed_amount ?? null,

          partner_billed_at: report.billing.partner_billed_at ?? null,

          customer_invoice_status: report.billing.customer_invoice_status ?? 'none',

          customer_invoice_amount: null,

          customer_billed_at: null,

        }

      : null,

    billable: report.billable

      ? {

          partner_total: Number(report.billable.partner_total ?? 0),

          customer_total: Number(report.billable.customer_total ?? 0),

        }

      : null,

  };

  const showBillingMenu =

    !portalView

    && !!viewerCompanyId

    && billingModuleEnabled

    && variant === 'default'

    && (isIncomingPartnerBill(billingRow, viewerCompanyId)

      || (customerBillingEnabled && viewerCompanyId === report.owner_company_id));



  return (

    <div className="report-list-row-pro">

      <Link to={`/tyoraportit/${report.id}`} className="report-link">

        <div className="report-link-body">

          <strong>{report.title}</strong>

          {report.is_onboarding_demo && <span className="badge badge-demo">Esimerkki</span>}



          <div className="report-meta-row">

            {variant === 'incoming' ? (

              <span>

                <em>Lähettäjä:</em> {report.created_by_company?.name ?? '—'}

              </span>

            ) : variant === 'sent' ? (

              <span>

                <em>Kumppani:</em> {report.delegate_company?.name ?? '—'}

              </span>

            ) : (

              <>

                <span>

                  <em>Raportoi:</em> {parties.reporterName}

                  {parties.reporterCompany !== '—' && ` (${parties.reporterCompany})`}

                </span>

                <span>

                  <em>Nimissä:</em> {parties.onBehalfOf}

                </span>

              </>

            )}

          </div>



          <div className="muted">

            {report.scheduled_start

              ? new Date(report.scheduled_start).toLocaleString('fi-FI', {

                  day: 'numeric',

                  month: 'numeric',

                  year: 'numeric',

                  hour: '2-digit',

                  minute: '2-digit',

                })

              : '—'}{' '}

            • {report.customers?.name ?? '—'}

            {report.location_text ? ` • ${report.location_text}` : ''}

            {variant === 'incoming' && report.assigned_user?.display_name

              ? ` • Tekijä: ${report.assigned_user.display_name}`

              : ''}

            {hasSubscriberLink && !portalView && (

              <> • Tilaajalle: {subscriberPortalVisibilityLabel(report.subscriber_portal_visibility)}</>

            )}

          </div>

        </div>

      </Link>



      <div className="report-list-row-aside">

        {showStatusMenu && variant === 'default' && !portalView ? (

          <WorkReportStatusMenu

            reportId={report.id}

            status={report.status}

            onChanged={onStatusChanged}

          />

        ) : null}



        {showBillingMenu && viewerCompanyId ? (

          <WorkReportBillingStatusMenu

            report={report}

            viewerCompanyId={viewerCompanyId}

            customerBillingEnabled={customerBillingEnabled}

            onChanged={onStatusChanged}

          />

        ) : null}



        {billingModuleEnabled && viewerCompanyId && !portalView ? (

          <WorkReportStatusBadges

            workflowStatus={report.status}

            context={statusContext}

            viewerCompanyId={viewerCompanyId}

            hasDailyLogs={hasDailyLogs}

            dailyLogs={dailyLogs}

            billingModuleEnabled={billingModuleEnabled}

            customerBillingEnabled={customerBillingEnabled}

            compact

          />

        ) : portalView ? (

          <span className={`badge badge-${report.status}`}>{getPortalWorkStatusLabel(report.status)}</span>

        ) : !showStatusMenu || variant !== 'default' ? (

          <span className={`badge badge-${report.status}`}>{getWorkStatusLabel(report.status)}</span>

        ) : null}

      </div>

    </div>

  );

}



export function ReportCalendarMeta({ report }: { report: WorkReport }) {

  const parties = reportPartyLabels(report);



  if (report.delegate_company) {

    return (

      <span className="calendar-meta">

        {parties.reporterCompany} → {report.delegate_company.name}

      </span>

    );

  }



  return (

    <span className="calendar-meta">

      {parties.reporterCompany} → {parties.onBehalfOf}

    </span>

  );

}

