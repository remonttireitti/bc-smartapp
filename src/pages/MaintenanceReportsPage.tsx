import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { emitDataChanged, useRefetchOnDataChange } from '../lib/dataRefresh';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { MaintenanceReportListTable } from '../components/MaintenanceReportListTile';
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
} from '../lib/portalWorkOrder';
import { getPortalSubscriberId } from '../lib/portalPreview';
import { usePortalPreview } from '../hooks/usePortalPreview';
import { supabase } from '../lib/supabase';
import { canDeleteMaintenanceReport } from '../lib/deletePermissions';
import { useCompanyHuoltoSettings } from '../hooks/useCompanyHuoltoSettings';
import { HUOLTO_CATEGORIES, newHuoltoReportHref, reportCategoryOf, type HuoltoCategoryKey } from '../lib/huoltoCategories';

interface Props {
  session: Session;
}

type MaintenanceReportListRow = MaintenanceReportListItem & {
  created_at: string;
  customer_id: string | null;
  subscriber_id: string | null;
  equipment_id: string | null;
  branding_company_id: string;
  created_by_company_id: string;
  assigned_user_id: string | null;
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
  const [categoryFilter, setCategoryFilter] = useState<HuoltoCategoryKey | ''>('');
  const huolto = useCompanyHuoltoSettings(profile?.company_id, session);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);
  const portalMode = isPortalUser(profile);

  useRefetchOnDataChange(() => void loadReports({ silent: true }));

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

  async function loadReports(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true);

    const { data, error } = await supabase
      .from('maintenance_reports')
      .select(`
        id, status, title, data, updated_at, created_at,
        customer_id, subscriber_id, subscriber_portal_visibility, equipment_id,
        owner_company_id, created_by_company_id, assigned_user_id, branding_company_id,
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
    const all = portalMode ? portalVisibleReports : reports;
    const base = categoryFilter ? all.filter((r) => reportCategoryOf(r.data) === categoryFilter) : all;
    const query = search.trim().toLowerCase();
    if (!query) return base;
    return base.filter((report) => maintenanceReportSearchText(report).includes(query));
  }, [reports, portalMode, portalVisibleReports, search, categoryFilter]);

  // Suodatin vain, kun lajeja on useampi (käytössä olevat + listassa esiintyvät).
  const filterCategories = useMemo(() => {
    const present = new Set((portalMode ? portalVisibleReports : reports).map((r) => reportCategoryOf(r.data)));
    return HUOLTO_CATEGORIES.filter((c) => present.has(c.key) || (!portalMode && huolto.access.isCategoryEnabled(c.key)));
  }, [reports, portalVisibleReports, portalMode, huolto.access]);

  const grouped = useMemo(() => {
    const drafts = portalMode ? [] : filteredReports.filter((r) => r.status === 'draft');
    const done = portalMode ? filteredReports : filteredReports.filter((r) => r.status !== 'draft');
    return { drafts, done };
  }, [filteredReports, portalMode]);

  async function deleteDraftReport(report: MaintenanceReportListRow) {
    if (!window.confirm('Poistetaanko huoltoraportin luonnos pysyvästi? Tätä toimintoa ei voi perua.')) {
      return;
    }
    setDeletingDraftId(report.id);
    const { error } = await supabase.from('maintenance_reports').delete().eq('id', report.id);
    if (!error) emitDataChanged();
    setDeletingDraftId(null);
    if (error) {
      console.error(error);
      window.alert(error.message);
      return;
    }
    setReports((prev) => prev.filter((row) => row.id !== report.id));
  }

  function canDeleteDraft(report: MaintenanceReportListRow): boolean {
    return canDeleteMaintenanceReport(
      report,
      session.user.id,
      profile?.company_id,
      profile?.role,
      profile?.is_global_admin,
    );
  }

  const myCompanyId = profile?.company_id ?? null;

  function reportHref(report: MaintenanceReportListRow): string {
    return portalMode ? `/huoltoraportit/${report.id}/tuloste` : `/huoltoraportit/${report.id}`;
  }

  return (
    <AppLayout session={session}>
      <div className="page-header">
        <div>
          <p className="breadcrumb breadcrumb-home-only">
            <Link to="/">Etusivu</Link> / {portalMode ? 'Huoltopöytäkirjat' : 'Huoltoraportit'}
          </p>
          <h1>{portalMode ? 'Huoltopöytäkirjat' : 'Huoltoraportit'}</h1>
          <p className="muted">
            {profile?.companies?.name ?? '—'} •{' '}
            {portalMode
              ? 'valmiit huoltopöytäkirjat'
              : 'laiterekisteri ja huoltolomake'}
          </p>
        </div>

        {!portalMode && (
          <div className="page-header-actions">
            {huolto.access.isTypeEnabled('konvektorit') ? (
              <Link
                to="/huoltoraportit/esimerkki-konvektori/tuloste"
                className="btn btn-secondary"
                target="_blank"
                rel="noopener noreferrer"
              >
                Konvektorin esimerkkituloste
              </Link>
            ) : null}
            <Link to={newHuoltoReportHref(huolto.access)} className="btn btn-primary" {...withNavTrail(maintenanceListTrail())}>
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
        {filterCategories.length > 1 ? (
          <label>
            Laji
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as HuoltoCategoryKey | '')}>
              <option value="">Kaikki</option>
              {filterCategories.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {loading ? (
        <p className="muted">Ladataan…</p>
      ) : portalMode && grouped.done.length === 0 ? (
        <section className="panel">
          <p>
            {search.trim() ? `Ei tuloksia haulle "${search.trim()}".` : 'Ei valmiita huoltopöytäkirjoja vielä.'}
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
              <MaintenanceReportListTable
                reports={grouped.drafts}
                myCompanyId={myCompanyId}
                linkTo={reportHref}
                canDelete={canDeleteDraft}
                onDelete={(report) => void deleteDraftReport(report)}
                deletingId={deletingDraftId}
              />
            </section>
          )}

          {grouped.done.length > 0 && (
            <section className="panel">
              <h2>{portalMode ? 'Valmiit' : 'Valmiit huoltoraportit'}</h2>
              <MaintenanceReportListTable reports={grouped.done} myCompanyId={myCompanyId} linkTo={reportHref} portal={portalMode} />
            </section>
          )}
        </>
      )}
    </AppLayout>
  );
}
