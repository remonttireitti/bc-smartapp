import { useEffect, useMemo, useState } from 'react';

import { Link } from 'react-router-dom';

import type { Session } from '@supabase/supabase-js';

import AppLayout from '../components/AppLayout';

import { supabase } from '../lib/supabase';

import { resolveMaintenanceReportTitle } from '../lib/huoltoRaportti/defaults';

import type { HuoltoReportData } from '../lib/huoltoRaportti/types';

import { maintenanceListTrail, withNavTrail } from '../lib/navigationTrail';

import { useProfile } from '../hooks/useProfile';
import {
  filterMaintenanceReportsForPortalView,
  isPortalUser,
  needsPortalClientFilter,
  reportMatchesPortalSubscriber,
} from '../lib/portalWorkOrder';
import { getPortalSubscriberId } from '../lib/portalPreview';
import { usePortalPreview } from '../hooks/usePortalPreview';
import { isMaintenanceReportPublished } from '../lib/maintenanceReportStatus';
import { getMaintenanceReportStatusLabel } from '../types';



interface Props {

  session: Session;

}



type MaintenanceReportListRow = {

  id: string;

  status: string;

  title: string | null;

  data: HuoltoReportData;

  updated_at: string;

  created_at: string;

  customer_id: string | null;

  subscriber_id: string | null;

  equipment_id: string | null;

  owner_company_id: string;

  branding_company_id: string;

  customers: { name: string; subscriber_id: string | null } | null;

  equipment: { name: string; tag: string | null } | null;

  owner_company: { name: string } | null;

  branding_company: { name: string } | null;

};



function reportSearchText(report: MaintenanceReportListRow): string {

  const data = report.data ?? ({} as HuoltoReportData);

  return [

    resolveMaintenanceReportTitle(report.title, data, report.customers?.name),

    report.customers?.name,

    data.asiakas,

    report.equipment?.name,

    report.equipment?.tag,

    data.laiteTunnus,

    data.laiteMalli,

    data.osoite,

    report.owner_company?.name,

    report.branding_company?.name,

  ]

    .filter(Boolean)

    .join(' ')

    .toLowerCase();

}



export default function MaintenanceReportsPage({ session }: Props) {

  const { profile } = useProfile(session);

  const portalPreview = usePortalPreview();
  const portalSubscriberId = getPortalSubscriberId(profile);
  const [subscriberCustomerIds, setSubscriberCustomerIds] = useState<Set<string>>(() => new Set());

  const [reports, setReports] = useState<MaintenanceReportListRow[]>([]);

  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');

  const portalMode = isPortalUser(profile);



  useEffect(() => {

    void loadReports();

  }, [session.user.id, portalPreview?.kind, portalPreview?.kind === 'subscriber' ? portalPreview.subscriberId : portalPreview?.kind === 'customer' ? portalPreview.customerId : null]);

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

    const { data, error } = await supabase

      .from('maintenance_reports')

      .select(`

        id, status, data, updated_at, created_at,

        customer_id, subscriber_id, subscriber_portal_visibility, equipment_id, owner_company_id, branding_company_id,

        customers(name, subscriber_id),

        equipment(name, tag),

        owner_company:companies!maintenance_reports_owner_company_id_fkey(name),

        branding_company:companies!maintenance_reports_branding_company_id_fkey(name)

      `)

      .order('updated_at', { ascending: false });



    if (error) {

      console.error(error);

      setReports([]);

    } else {

      setReports((data as unknown as MaintenanceReportListRow[]) ?? []);

    }

    setLoading(false);

  }



  const portalVisibleReports = useMemo(
    () => filterMaintenanceReportsForPortalView(reports, profile, subscriberCustomerIds),
    [reports, profile, subscriberCustomerIds],
  );

  const filteredReports = useMemo(() => {
    const base = portalMode ? portalVisibleReports : reports;

    const query = search.trim().toLowerCase();
    if (!query) return base;

    return base.filter((report) => reportSearchText(report).includes(query));
  }, [reports, portalMode, portalVisibleReports, search]);



  const grouped = useMemo(() => {
    const drafts = portalMode ? [] : filteredReports.filter((r) => r.status === 'draft');
    const done = portalMode
      ? filteredReports
      : filteredReports.filter((r) => r.status !== 'draft');
    return { drafts, done };
  }, [filteredReports, portalMode]);

  const portalPendingCount = useMemo(() => {
    if (!portalMode || !needsPortalClientFilter(profile) || !portalSubscriberId) return 0;
    return reports.filter(
      (r) =>
        r.status !== 'submitted'
        && reportMatchesPortalSubscriber(r, portalSubscriberId, subscriberCustomerIds),
    ).length;
  }, [portalMode, profile, portalSubscriberId, reports, subscriberCustomerIds]);

  return (

    <AppLayout session={session}>

      <div className="page-header">

        <div>

          <p className="breadcrumb">

            <Link to="/">Etusivu</Link> / Huoltoraportit

          </p>

          <h1>Huoltoraportit</h1>

          <p className="muted">

            {profile?.companies?.name ?? '—'} •{' '}
            {portalMode
              ? 'valmiit huoltopöytäkirjat linkeistäsi kohteista'
              : 'laiterekisteri ja huoltolomake'}

          </p>

          {portalMode && (
            <p className="muted" style={{ marginTop: '0.5rem' }}>
              Näet vain <strong>valmiit</strong> huoltoraportit (tila Valmis). Luonnokset eivät näy tilaajalle.
              Varmista, että asiakaskohde on linkitetty tilaajaan ja raportti on merkitty valmiiksi.
            </p>
          )}

        </div>

        {!portalMode && (
          <div className="page-header-actions">
            <Link to="/huoltoraportit/uusi" className="btn btn-primary" {...withNavTrail(maintenanceListTrail())}>
              + Uusi huoltoraportti
            </Link>
          </div>
        )}

      </div>



      <div className="toolbar">

        <label className="search-field-grow">

          Hae raportteja

          <input

            type="search"

            value={search}

            onChange={(event) => setSearch(event.target.value)}

            placeholder="Asiakas, kumppani/rekisteri, laite, osoite…"

          />

        </label>

      </div>



      {loading ? (

        <p className="muted">Ladataan…</p>

      ) : portalMode && grouped.done.length === 0 ? (

        <section className="panel">
          <p>
            {search.trim()
              ? `Ei tuloksia haulle "${search.trim()}".`
              : portalPendingCount > 0
                ? `Ei toimitettuja huoltoraportteja vielä. Löytyi ${portalPendingCount} luonnosta linkitetyistä kohteista — merkitse raportti toimitetuksi, jotta se näkyy tilaajalle.`
                : 'Ei toimitettuja huoltoraportteja vielä. Kun palveluyritys merkitsee raportin toimitetuksi ja kohde on linkitetty tilaajaan, raportti näkyy tässä.'}
          </p>
        </section>

      ) : !portalMode && reports.length === 0 ? (

        <section className="panel">
          <p>Ei huoltoraportteja. Aloita luomalla uusi raportti.</p>
        </section>

      ) : !portalMode && filteredReports.length === 0 ? (

        <section className="panel">

          <p className="muted">Ei tuloksia haulle &quot;{search.trim()}&quot;.</p>

        </section>

      ) : (

        <>

          {grouped.drafts.length > 0 && (

            <section className="panel">

              <h2>Luonnokset</h2>

              <ul className="report-list">

                {grouped.drafts.map((r) => (

                  <ReportRow key={r.id} report={r} myCompanyId={profile?.company_id ?? null} />

                ))}

              </ul>

            </section>

          )}

          {grouped.done.length > 0 && (

            <section className="panel">

              <h2>Valmiit huoltoraportit</h2>

              <ul className="report-list">

                {grouped.done.map((r) => (

                  <ReportRow
                    key={r.id}
                    report={r}
                    myCompanyId={profile?.company_id ?? null}
                    portalMode={portalMode}
                  />

                ))}

              </ul>

            </section>

          )}

        </>

      )}

    </AppLayout>

  );

}



function ReportRow({

  report,

  myCompanyId,

  portalMode = false,

}: {

  report: MaintenanceReportListRow;

  myCompanyId: string | null;

  portalMode?: boolean;

}) {

  const data = report.data ?? ({} as HuoltoReportData);

  const customerName = report.customers?.name ?? data.asiakas;

  const title = resolveMaintenanceReportTitle(report.title, data, customerName);

  const deviceLabel =

    report.equipment?.tag || report.equipment?.name || data.laiteTunnus || data.laiteMalli;

  const registryName = report.owner_company?.name;
  const isPartnerRegistry = Boolean(myCompanyId && report.owner_company_id !== myCompanyId);
  const registryLabel = isPartnerRegistry ? registryName : report.branding_company?.name;



  return (

    <li>

      <Link

        to={portalMode ? `/huoltoraportit/${report.id}/tuloste` : `/huoltoraportit/${report.id}`}

        className="report-list-item"

        {...withNavTrail(maintenanceListTrail())}

      >

        <div>

          <strong>{title}</strong>

          <span className="muted">

            {customerName}

            {deviceLabel ? ` • ${deviceLabel}` : ''}

            {registryLabel ? ` • ${registryLabel}` : ''}

          </span>

        </div>

        <span className={`badge badge-${isMaintenanceReportPublished(report.status) ? 'completed' : 'scheduled'}`}>

          {getMaintenanceReportStatusLabel(report.status)}

        </span>

      </Link>

    </li>

  );

}

