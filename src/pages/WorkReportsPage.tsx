import { useEffect, useMemo, useState } from 'react';

import { Link } from 'react-router-dom';

import type { Session } from '@supabase/supabase-js';

import AppLayout from '../components/AppLayout';
import WorkReportFilters, {
  buildWorkReportFilterOptions,
  matchesWorkReportFilters,
} from '../components/WorkReportFilters';

import { ReportListItem } from '../components/ReportListItem';

import WorkReportCalendarTimeline, {
  calendarDayHoursLabel,
} from '../components/WorkReportCalendarTimeline';

import {
  buildCalendarEvents,
  CALENDAR_LOG_SELECT,
  formatAllowedOverlapLabel,
} from '../lib/workReportCalendar';

import { supabase } from '../lib/supabase';

import {
  getPortalSubscriberId,
  isPortalUser,
  companySubscriberOrderEditPath,
  isInternalCompanyOrderDraft,
  isSubscriberPortalWorkOrder,
  needsPortalClientFilter,
  PORTAL_COMPLETED_WORK_STATUSES,
  PORTAL_OWN_ORDER_OPEN_STATUSES,
  reportMatchesPortalSubscriber,
} from '../lib/portalWorkOrder';
import { usePortalPreview } from '../hooks/usePortalPreview';

import { useProfile } from '../hooks/useProfile';

import {

  WORK_STATUS_LABELS,

  getWorkStatusLabel,

  buildWorkReportTitle,

  resolveWorkReportDescription,

  addDays,

  addMonths,

  formatDateTime,

  monthGridDays,

  startOfMonth,

  startOfWeek,

  toLocalYmd,

  type WorkReport,

  type WorkReportDailyLog,

  type WorkStatus,

} from '../types';



interface Props {

  session: Session;

}



type Tab = 'calendar' | 'list' | 'history';

type CalendarLayout = 'week' | 'month';



const HISTORY_STATUSES: WorkStatus[] = ['completed', 'billed_partner', 'billed_customer'];

const ACTIVE_STATUSES: WorkStatus[] = ['scheduled', 'in_progress'];

const DRAFT_STATUS: WorkStatus = 'draft';



const DELEGATION_SELECT = `

  id, title, description, location_text, status,

  scheduled_start, scheduled_end, completed_at,

  owner_company_id, created_by_company_id, created_by_user_id, branding_company_id,

  partnership_id, customer_id, equipment_id, assigned_user_id,

  delegate_company_id, delegated_at, created_at, subscriber_id,

  customers(name, subscriber_id),

  equipment(name, tag),

  owner_company:companies!work_reports_owner_company_id_fkey(name),

  branding_company:companies!work_reports_branding_company_id_fkey(name),

  created_by_company:companies!work_reports_created_by_company_id_fkey(name),

  delegate_company:companies!work_reports_delegate_company_id_fkey(name),

  created_by_user:profiles!work_reports_created_by_user_id_fkey(display_name, email),

  assigned_user:profiles!work_reports_assigned_user_id_fkey(display_name)

`;



export default function WorkReportsPage({ session }: Props) {

  const { profile } = useProfile(session);
  const portalPreview = usePortalPreview();
  const portalSubscriberId = getPortalSubscriberId(profile);
  const [subscriberCustomerIds, setSubscriberCustomerIds] = useState<Set<string>>(() => new Set());

  const [tab, setTab] = useState<Tab>('list');

  const [brandingFilter, setBrandingFilter] = useState('');
  const [personFilter, setPersonFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(new Date()));

  const [calendarLayout, setCalendarLayout] = useState<CalendarLayout>('week');

  const [reports, setReports] = useState<WorkReport[]>([]);

  const [logsByReportId, setLogsByReportId] = useState<Map<string, WorkReportDailyLog[]>>(new Map());

  const [incomingDelegated, setIncomingDelegated] = useState<WorkReport[]>([]);

  const [sentDelegated, setSentDelegated] = useState<WorkReport[]>([]);

  const [loading, setLoading] = useState(true);

  const companyId = profile?.company_id ?? '';



  useEffect(() => {

    if (companyId) void loadReports();

  }, [session.user.id, companyId]);



  useEffect(() => {
    if (!portalSubscriberId || !needsPortalClientFilter(profile)) {
      setSubscriberCustomerIds(new Set());
      return;
    }

    void supabase
      .from('customers')
      .select('id')
      .eq('subscriber_id', portalSubscriberId)
      .then(({ data, error }) => {
        if (error) {
          console.error(error);
          setSubscriberCustomerIds(new Set());
          return;
        }
        setSubscriberCustomerIds(new Set((data ?? []).map((row) => row.id)));
      });
  }, [portalSubscriberId, profile, portalPreview]);

  async function loadReports() {

    setLoading(true);



    let query = supabase

      .from('work_reports')

      .select(DELEGATION_SELECT)

      .order('scheduled_start', { ascending: true, nullsFirst: false });

    const [mainResult, incomingResult, sentResult] = await Promise.all([
      query,

      supabase

        .from('work_reports')

        .select(DELEGATION_SELECT)

        .eq('delegate_company_id', companyId)

        .eq('status', 'delegated')

        .order('delegated_at', { ascending: false }),

      supabase

        .from('work_reports')

        .select(DELEGATION_SELECT)

        .eq('created_by_company_id', companyId)

        .not('delegate_company_id', 'is', null)

        .eq('status', 'delegated')

        .order('delegated_at', { ascending: false }),

    ]);



    if (mainResult.error) {

      console.error(mainResult.error);

      setReports([]);

    } else {

      const loaded = (mainResult.data as unknown as WorkReport[]) ?? [];

      setReports(loaded);

      const activeIds = loaded.filter((r) => ACTIVE_STATUSES.includes(r.status)).map((r) => r.id);

      if (activeIds.length === 0) {

        setLogsByReportId(new Map());

      } else {

        const { data: logRows } = await supabase

          .from('work_report_daily_logs')

          .select(CALENDAR_LOG_SELECT)

          .in('work_report_id', activeIds);

        const map = new Map<string, WorkReportDailyLog[]>();

        for (const log of (logRows ?? []) as WorkReportDailyLog[]) {

          const list = map.get(log.work_report_id) ?? [];

          list.push(log);

          map.set(log.work_report_id, list);

        }

        setLogsByReportId(map);

      }

    }



    setIncomingDelegated((incomingResult.data as unknown as WorkReport[]) ?? []);

    setSentDelegated((sentResult.data as unknown as WorkReport[]) ?? []);

    setLoading(false);

  }



  const filterOptions = useMemo(() => buildWorkReportFilterOptions(reports), [reports]);

  const filteredReports = useMemo(
    () =>
      reports.filter((report) =>
        matchesWorkReportFilters(
          report,
          {
            brandingId: brandingFilter,
            personId: personFilter,
            customerId: customerFilter,
          },
          session.user.id,
        ),
      ),
    [reports, brandingFilter, personFilter, customerFilter, session.user.id],
  );

  const hasActiveFilters = Boolean(brandingFilter || personFilter || customerFilter);

  const activeReports = useMemo(

    () => filteredReports.filter((r) => ACTIVE_STATUSES.includes(r.status)),

    [filteredReports],

  );



  const allDraftReports = useMemo(
    () => filteredReports.filter((r) => r.status === DRAFT_STATUS),
    [filteredReports],
  );

  const subscriberPortalOrders = useMemo(
    () => allDraftReports.filter((r) => isSubscriberPortalWorkOrder(r, session.user.id)),
    [allDraftReports, session.user.id],
  );

  const draftReports = useMemo(
    () => allDraftReports.filter((r) => !isSubscriberPortalWorkOrder(r, session.user.id)),
    [allDraftReports, session.user.id],
  );



  const historyReports = useMemo(

    () =>

      filteredReports

        .filter((r) => HISTORY_STATUSES.includes(r.status))

        .sort((a, b) => {

          const aTime = a.completed_at ?? a.scheduled_start ?? a.created_at;

          const bTime = b.completed_at ?? b.scheduled_start ?? b.created_at;

          return new Date(bTime).getTime() - new Date(aTime).getTime();

        }),

    [filteredReports],

  );



  const calendarEvents = useMemo(

    () => buildCalendarEvents({ reports: activeReports, logsByReportId }),

    [activeReports, logsByReportId],

  );

  const weekDays = useMemo(

    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),

    [weekStart],

  );



  const monthDays = useMemo(() => monthGridDays(monthAnchor), [monthAnchor]);

  const calendarDays = calendarLayout === 'week' ? weekDays : monthDays;

  const activeMonth = monthAnchor.getMonth();

  function workReportListTitle(report: WorkReport) {
    const description = report.description?.trim() || resolveWorkReportDescription(report);
    return buildWorkReportTitle(report.customers?.name, description);
  }

  function draftEditPath(report: WorkReport) {
    if (isSubscriberPortalWorkOrder(report, session.user.id)) {
      return companySubscriberOrderEditPath(report.id);
    }

    return isInternalCompanyOrderDraft(report)
      ? `/tyoraportit/toimeksianto/${report.id}/muokkaa`
      : `/tyoraportit/${report.id}/muokkaa`;
  }

  const portalMode = isPortalUser(profile);
  const isSubscriberPortal = profile?.role === 'subscriber' || portalPreview?.kind === 'subscriber';
  const adminSubscriberPreview = needsPortalClientFilter(profile) && !!portalSubscriberId;

  const myPortalOrders = useMemo(
    () => reports.filter((r) => r.created_by_user_id === session.user.id),
    [reports, session.user.id],
  );

  const portalOpenOrders = useMemo(() => {
    if (adminSubscriberPreview && portalSubscriberId) {
      return reports.filter(
        (r) =>
          PORTAL_OWN_ORDER_OPEN_STATUSES.includes(r.status)
          && reportMatchesPortalSubscriber(r, portalSubscriberId, subscriberCustomerIds),
      );
    }
    return myPortalOrders.filter((r) => PORTAL_OWN_ORDER_OPEN_STATUSES.includes(r.status));
  }, [reports, myPortalOrders, adminSubscriberPreview, portalSubscriberId, subscriberCustomerIds]);

  const portalHistoryOrders = useMemo(() => {
    let list = reports.filter((r) => PORTAL_COMPLETED_WORK_STATUSES.includes(r.status));
    if (adminSubscriberPreview && portalSubscriberId) {
      list = list.filter((r) =>
        reportMatchesPortalSubscriber(r, portalSubscriberId, subscriberCustomerIds),
      );
    }
    return list.sort((a, b) => {
      const aTime = a.completed_at ?? a.scheduled_start ?? a.created_at;
      const bTime = b.completed_at ?? b.scheduled_start ?? b.created_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
  }, [reports, adminSubscriberPreview, portalSubscriberId, subscriberCustomerIds]);

  if (portalMode) {
    return (
      <AppLayout session={session}>
        <div className="page-header">
          <div>
            <p className="breadcrumb">
              <Link to="/">Etusivu</Link> / Työraportit
            </p>
            <h1>Työtilaukset</h1>
            <p className="muted">
              {profile?.companies?.name ?? '—'} • lähetä työtilauksia ja seuraa tilauksen tilaa
            </p>
            {isSubscriberPortal && (
              <p className="muted" style={{ marginTop: '0.5rem' }}>
                Näet valmiit työraportit kohteista, jotka on linkitetty tilaajaan (asiakaskortilla tai raportin
                tilaaja-kentällä). Keskeneräiset yrityksen raportit eivät näy — vain valmis / laskutettu.
              </p>
            )}
          </div>
          <div className="page-header-actions">
            <Link to="/tyoraportit/tilaus/uusi" className="btn btn-primary">
              + Uusi työtilaus
            </Link>
          </div>
        </div>

        {loading ? (
          <p className="muted">Ladataan…</p>
        ) : (
          <>
            <section className="panel">
              <h2>Avoimet tilaukset</h2>
              {portalOpenOrders.length === 0 ? (
                <p className="muted">Ei avoimia tilauksia.</p>
              ) : (
                <ul className="report-list">
                  {portalOpenOrders.map((report) => (
                    <li key={report.id}>
                      <Link
                        to={`/tyoraportit/tilaus/${report.id}/muokkaa`}
                        className="report-link"
                      >
                        <div className="report-link-body">
                          <strong>{report.title}</strong>
                          <span className="muted">
                            {getWorkStatusLabel(report.status)}
                            {report.customers?.name ? ` • ${report.customers.name}` : ''}
                            {report.scheduled_start
                              ? ` • ${formatDateTime(report.scheduled_start)}`
                              : ''}
                          </span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel">
              <h2>Valmiit työraportit</h2>
              {portalHistoryOrders.length === 0 ? (
                <p className="muted">Ei valmiita raportteja vielä.</p>
              ) : (
                <ul className="report-list">
                  {portalHistoryOrders.map((report) => (
                    <li key={report.id}>
                      <Link to={`/tyoraportit/${report.id}`} className="report-link">
                        <div className="report-link-body">
                          <strong>{report.title}</strong>
                          <span className="muted">
                            {getWorkStatusLabel(report.status)}
                            {report.completed_at
                              ? ` • ${formatDateTime(report.completed_at)}`
                              : ''}
                          </span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </AppLayout>
    );
  }

  return (

    <AppLayout session={session}>

      <div className="page-header">

        <div>

          <p className="breadcrumb">

            <Link to="/">Etusivu</Link> / Työraportti

          </p>

          <h1>Työraportit</h1>

          <p className="muted">

            {profile?.companies?.name ?? '—'} • kalenteri, aikataulu ja laskutus

          </p>

        </div>

        <div className="page-header-actions">

          <Link to="/tyoraportit/toimeksianto/uusi" className="btn btn-secondary">

            + Toimeksianto kumppanille

          </Link>

          <Link to="/tyoraportit/uusi" className="btn btn-primary">

            + Uusi työraportti

          </Link>

        </div>

      </div>



      <div className="toolbar">

        <div className="tabs">

          <button type="button" className={tab === 'list' ? 'tab active' : 'tab'} onClick={() => setTab('list')}>

            Lista

          </button>

          <button type="button" className={tab === 'calendar' ? 'tab active' : 'tab'} onClick={() => setTab('calendar')}>

            Kalenteri

          </button>

          <button type="button" className={tab === 'history' ? 'tab active' : 'tab'} onClick={() => setTab('history')}>

            Historia

          </button>

        </div>

        <div className="toolbar-right">
          <WorkReportFilters
            brandingId={brandingFilter}
            personId={personFilter}
            customerId={customerFilter}
            onBrandingChange={setBrandingFilter}
            onPersonChange={setPersonFilter}
            onCustomerChange={setCustomerFilter}
            options={filterOptions}
            hasActiveFilters={hasActiveFilters}
            onClear={() => {
              setBrandingFilter('');
              setPersonFilter('');
              setCustomerFilter('');
            }}
          />
        </div>

      </div>



      {loading ? (

        <p className="muted">Ladataan…</p>

      ) : tab === 'calendar' ? (

        <section className="panel work-report-calendar-panel">

          <div className="calendar-nav">

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                if (calendarLayout === 'week') setWeekStart(addDays(weekStart, -7));
                else setMonthAnchor(addMonths(monthAnchor, -1));
              }}
            >

              ← {calendarLayout === 'week' ? 'Edellinen viikko' : 'Edellinen kuukausi'}

            </button>

            <strong>

              {calendarLayout === 'week' ? (
                <>
                  {formatDateTime(weekStart.toISOString()).split(' ')[0]} –{' '}
                  {formatDateTime(addDays(weekStart, 6).toISOString()).split(' ')[0]}
                </>
              ) : (
                monthAnchor.toLocaleDateString('fi-FI', { month: 'long', year: 'numeric' })
              )}

            </strong>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                if (calendarLayout === 'week') setWeekStart(addDays(weekStart, 7));
                else setMonthAnchor(addMonths(monthAnchor, 1));
              }}
            >

              {calendarLayout === 'week' ? 'Seuraava viikko' : 'Seuraava kuukausi'} →

            </button>

          </div>

          <div className="work-report-calendar-controls">

            <button
              type="button"
              className={calendarLayout === 'week' ? 'billing-pill active' : 'billing-pill'}
              onClick={() => setCalendarLayout('week')}
            >
              Viikko
            </button>

            <button
              type="button"
              className={calendarLayout === 'month' ? 'billing-pill active' : 'billing-pill'}
              onClick={() => setCalendarLayout('month')}
            >
              Kuukausi
            </button>

            <span className="muted work-report-calendar-legend">
              07–17 · kellon mukaan skaalattu · max {formatAllowedOverlapLabel()} päällekkäisyys sallittu
            </span>

          </div>

          <div className={`calendar-grid ${calendarLayout === 'month' ? 'calendar-grid-month' : ''}`}>

            {calendarDays.map((day) => {

              const dayYmd = toLocalYmd(day);

              const hoursLabel = calendarDayHoursLabel(calendarEvents, dayYmd);

              return (

              <div
                key={day.toISOString()}
                className={[
                  'calendar-day',
                  calendarLayout === 'month' && day.getMonth() !== activeMonth ? 'outside-month' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >

                <div className="calendar-day-head">

                  {day.toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric' })}

                  {hoursLabel && <span className="calendar-day-hours">{hoursLabel}</span>}

                </div>

                <div className={`calendar-day-body ${calendarLayout === 'month' ? 'calendar-day-body-month' : ''}`}>

                  <WorkReportCalendarTimeline
                    dayYmd={dayYmd}
                    events={calendarEvents}
                    compact={calendarLayout === 'month'}
                  />

                </div>

              </div>

            )})}

          </div>

        </section>

      ) : tab === 'list' ? (

        <section className="panel">

          {incomingDelegated.length > 0 && (

            <>

              <h2>Saapuneet toimeksiannot</h2>

              <p className="muted">Kumppanit lähettäneet työtehtäviä — määritä tekijä raportin sivulta.</p>

              <ul className="report-list">

                {incomingDelegated.map((r) => (

                  <li key={r.id}>

                    <ReportListItem report={r} variant="incoming" />

                  </li>

                ))}

              </ul>

            </>

          )}



          {sentDelegated.length > 0 && (

            <>

              <h2>Lähetetyt toimeksiannot</h2>

              <p className="muted">Odottaa kumppanin tekijän määrittämistä.</p>

              <ul className="report-list">

                {sentDelegated.map((r) => (

                  <li key={r.id}>

                    <ReportListItem report={r} variant="sent" />

                  </li>

                ))}

              </ul>

            </>

          )}



          {subscriberPortalOrders.length > 0 && (
            <>
              <h2>Tilaajan työtilaukset</h2>
              <p className="muted">
                Asiakasportaalista tulleet tilaukset — ota vastaan omaan kalenteriin tai siirrä kumppanille.
              </p>
              <ul className="report-list">
                {subscriberPortalOrders.map((r) => (
                  <li key={r.id}>
                    <Link to={draftEditPath(r)} className="report-link">
                      <div className="report-link-body">
                        <strong>{workReportListTitle(r)}</strong>
                        <span className="muted">
                          {r.orderer_name ? `Tilaaja: ${r.orderer_name}` : 'Tilaajan tilaus'}
                          {r.location_text ? ` • ${r.location_text}` : ''}
                        </span>
                      </div>
                      <span className="badge badge-draft">Tilaajan tilaus</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          {draftReports.length > 0 && (

            <>

              <h2>Luonnokset</h2>

              <ul className="report-list">

                {draftReports.map((r) => (

                  <li key={r.id}>

                    <Link to={draftEditPath(r)} className="report-link">

                      <div className="report-link-body">

                        <strong>{workReportListTitle(r)}</strong>

                        <span className="muted">{r.customers?.name ?? r.location_text ?? '—'}</span>

                      </div>

                      <span className="badge badge-draft">{WORK_STATUS_LABELS.draft}</span>

                    </Link>

                  </li>

                ))}

              </ul>

            </>

          )}

          <h2>Tulevat ja käynnissä olevat työt</h2>

          {activeReports.length === 0 ? (

            <p className="muted">Ei työraportteja valituilla suodattimilla.</p>

          ) : (

            <ul className="report-list">

              {activeReports.map((r) => (

                <li key={r.id}>

                  <ReportListItem report={r} />

                </li>

              ))}

            </ul>

          )}

        </section>

      ) : (

        <section className="panel">

          <h2>Työhistoria</h2>

          {historyReports.length === 0 ? (

            <p className="muted">Ei valmiita tai laskutettuja töitä.</p>

          ) : (

            <ul className="report-list">

              {historyReports.map((r) => (

                <li key={r.id}>

                  <ReportListItem report={r} />

                </li>

              ))}

            </ul>

          )}

        </section>

      )}

    </AppLayout>

  );

}

