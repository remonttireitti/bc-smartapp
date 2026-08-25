import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { MaintenanceReportListGrid, MaintenanceReportListTile } from '../components/MaintenanceReportListTile';
import {
  maintenanceReportSearchText,
  type MaintenanceReportListItem,
} from '../lib/maintenanceReportListHelpers';
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
import { supabase } from '../lib/supabase';

interface Props {
  session: Session;
}

type MaintenanceReportListRow = MaintenanceReportListItem & {
  created_at: string;
  customer_id: string | null;
  subscriber_id: string | null;
  equipment_id: string | null;
  branding_company_id: string;
  customers: { name: string; subscriber_id: string | null } | null;
};

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
        id, status, title, data, updated_at, created_at,
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
    return base.filter((report) => maintenanceReportSearchText(report).includes(query));
  }, [reports, portalMode, portalVisibleReports, search]);

  const grouped = useMemo(() => {
    const drafts = portalMode ? [] : filteredReports.filter((r) => r.status === 'draft');
    const done = portalMode ? filteredReports : filteredReports.filter((r) => r.status !== 'draft');
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

  const myCompanyId = profile?.company_id ?? null;

  function reportHref(report: MaintenanceReportListRow): string {
    return portalMode ? `/huoltoraportit/${report.id}/tuloste` : `/huoltoraportit/${report.id}`;
  }

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
              <MaintenanceReportListGrid>
                {grouped.drafts.map((report) => (
                  <MaintenanceReportListTile
                    key={report.id}
                    report={report}
                    myCompanyId={myCompanyId}
                    linkTo={reportHref(report)}
                  />
                ))}
              </MaintenanceReportListGrid>
            </section>
          )}

          {grouped.done.length > 0 && (
            <section className="panel">
              <h2>Valmiit huoltoraportit</h2>
              <MaintenanceReportListGrid>
                {grouped.done.map((report) => (
                  <MaintenanceReportListTile
                    key={report.id}
                    report={report}
                    myCompanyId={myCompanyId}
                    linkTo={reportHref(report)}
                  />
                ))}
              </MaintenanceReportListGrid>
            </section>
          )}
        </>
      )}
    </AppLayout>
  );
}
