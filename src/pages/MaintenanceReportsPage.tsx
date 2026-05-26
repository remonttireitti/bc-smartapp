import { useEffect, useMemo, useState } from 'react';

import { Link } from 'react-router-dom';

import type { Session } from '@supabase/supabase-js';

import AppLayout from '../components/AppLayout';

import { supabase } from '../lib/supabase';

import { resolveMaintenanceReportTitle } from '../lib/huoltoRaportti/defaults';

import type { HuoltoReportData } from '../lib/huoltoRaportti/types';

import { maintenanceListTrail, withNavTrail } from '../lib/navigationTrail';

import { useProfile } from '../hooks/useProfile';
import { isPortalUser } from '../lib/portalWorkOrder';
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

  equipment_id: string | null;

  owner_company_id: string;

  branding_company_id: string;

  customers: { name: string } | null;

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

  const [reports, setReports] = useState<MaintenanceReportListRow[]>([]);

  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');



  useEffect(() => {

    void loadReports();

  }, [session.user.id]);



  async function loadReports() {

    setLoading(true);

    const { data, error } = await supabase

      .from('maintenance_reports')

      .select(`

        id, status, data, updated_at, created_at,

        customer_id, equipment_id, owner_company_id, branding_company_id,

        customers(name),

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



  const filteredReports = useMemo(() => {

    const query = search.trim().toLowerCase();

    if (!query) return reports;

    return reports.filter((report) => reportSearchText(report).includes(query));

  }, [reports, search]);



  const portalMode = isPortalUser(profile);

  const grouped = useMemo(() => {
    const drafts = portalMode ? [] : filteredReports.filter((r) => r.status === 'draft');
    const done = portalMode
      ? filteredReports.filter((r) => r.status === 'submitted')
      : filteredReports.filter((r) => r.status !== 'draft');
    return { drafts, done };
  }, [filteredReports, portalMode]);

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
              ? 'toimitetut huoltopöytäkirjat linkeistäsi kohteista'
              : 'laiterekisteri ja huoltolomake'}

          </p>

          {portalMode && (
            <p className="muted" style={{ marginTop: '0.5rem' }}>
              Näet vain tilan <strong>Toimitettu</strong> raportit. Luonnokset eivät näy tilaajalle. Varmista, että
              asiakaskohde on linkitetty tilaajaan ja raportti on merkitty toimitetuksi.
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

      ) : reports.length === 0 ? (

        <section className="panel">
          <p>
            {portalMode
              ? 'Ei toimitettuja huoltoraportteja vielä. Kun palveluyritys merkitsee raportin toimitetuksi ja kohde on linkitetty tilaajaan, raportti näkyy tässä.'
              : 'Ei huoltoraportteja. Aloita luomalla uusi raportti.'}
          </p>
        </section>

      ) : filteredReports.length === 0 ? (

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

              <h2>{portalMode ? 'Toimitetut huoltoraportit' : 'Valmiit'}</h2>

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

        <span className={`badge badge-${report.status === 'draft' ? 'scheduled' : 'completed'}`}>

          {getMaintenanceReportStatusLabel(report.status)}

        </span>

      </Link>

    </li>

  );

}


