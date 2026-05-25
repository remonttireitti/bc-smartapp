import { Link } from 'react-router-dom';

import { getWorkStatusLabel, reportPartyLabels, type WorkReport } from '../types';



type Variant = 'default' | 'incoming' | 'sent';



export function ReportListItem({

  report,

  variant = 'default',

}: {

  report: WorkReport;

  variant?: Variant;

}) {

  const parties = reportPartyLabels(report);



  return (

    <Link to={`/tyoraportit/${report.id}`} className="report-link">

      <div className="report-link-body">

        <strong>{report.title}</strong>

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

        </div>

      </div>

      <span className={`badge badge-${report.status}`}>{getWorkStatusLabel(report.status)}</span>

    </Link>

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

