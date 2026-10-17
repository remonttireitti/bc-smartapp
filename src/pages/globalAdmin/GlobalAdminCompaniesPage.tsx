import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import DataTable, { type DataTableColumn } from '../../components/DataTable';
import { invalidateCompanyLicenseCache } from '../../hooks/useCompanyLicense';
import { parseLicenseOverviewRows, trialDaysRemaining, type LicenseOverviewRow } from '../../lib/companyLicense';
import { HUOLTO_CATEGORIES, huoltoAccess, parseHuoltoSettings } from '../../lib/huoltoCategories';
import type { ManagementOutletContext } from '../../lib/managementOutletContext';
import { companyBillingModuleEnabled, parseCompanySettings } from '../../lib/management';
import { supabase } from '../../lib/supabase';
import { licenseStatusText, suggestCompanySlug } from './utils';
import { useGlobalAdminMeta } from './useGlobalAdminMeta';

type Row = {
  id: string;
  name: string;
  slug: string;
  users: number;
  rows: number;
  status: string;
  trialDays: number | null;
  canExtend: boolean;
  huolto: string;
  billing: boolean;
};

/** /palvelu/yritykset: kaikki yritykset (GBA). Rivi avaa yrityksen sivun. */
export default function GlobalAdminCompaniesPage() {
  const { profile } = useOutletContext<ManagementOutletContext>();
  const { companies, counts, loading, loadMeta } = useGlobalAdminMeta(!!profile.is_global_admin);
  const [overview, setOverview] = useState<LicenseOverviewRow[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('global_admin_license_overview');
    if (e) setError(e.message);
    else setOverview(parseLicenseOverviewRows(data));
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const rows: Row[] = useMemo(() => {
    const byId = new Map(overview.map((r) => [r.company_id, r]));
    return companies.map((c) => {
      const o = byId.get(c.id);
      const access = huoltoAccess(parseHuoltoSettings(c.settings));
      const s = o?.snapshot;
      const canExtend = !!s && s.enrollment !== 'legacy' && ['trial', 'expired', 'pending_trial'].includes(s.effective_status);
      return {
        id: c.id,
        name: c.name,
        slug: c.slug ?? '',
        users: o?.user_count ?? 0,
        rows: counts[c.id] ?? 0,
        status: s ? licenseStatusText(s) : '—',
        trialDays: s ? trialDaysRemaining(s) : null,
        canExtend,
        huolto: access.moduleEnabled
          ? HUOLTO_CATEGORIES.filter((k) => access.isCategoryEnabled(k.key)).map((k) => k.short).join(', ')
          : 'Pois',
        billing: companyBillingModuleEnabled(parseCompanySettings(c.settings)),
      };
    });
  }, [companies, counts, overview]);

  const columns: DataTableColumn<Row>[] = [
    { key: 'name', label: 'Yritys', value: (r) => r.name, render: (r) => <strong>{r.name}</strong> },
    { key: 'slug', label: 'Tunniste', value: (r) => r.slug, className: 'muted' },
    {
      key: 'status',
      label: 'Tila',
      value: (r) => r.status,
      render: (r) => (r.trialDays != null ? `${r.status} (${r.trialDays} pv)` : r.status),
    },
    { key: 'huolto', label: 'Huoltolajit', value: (r) => r.huolto },
    { key: 'billing', label: 'Laskutus', value: (r) => (r.billing ? 'Päällä' : 'Pois') },
    { key: 'users', label: 'Käyttäjiä', value: (r) => r.users },
    { key: 'rows', label: 'Rivejä', value: (r) => r.rows },
  ];

  async function createCompany(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const { error: e2 } = await supabase.rpc('global_admin_create_company', {
      p_name: n,
      p_slug: (slugTouched ? slug : suggestCompanySlug(n)).trim() || null,
    });
    setBusy(false);
    if (e2) {
      setError(e2.message);
      return;
    }
    setMessage(`Yritys "${n}" luotu.`);
    setName('');
    setSlug('');
    setSlugTouched(false);
    setShowCreate(false);
    await Promise.all([loadMeta(), loadOverview()]);
  }

  async function extendTrial(companyId: string) {
    setBusyId(companyId);
    setError(null);
    const { error: e } = await supabase.rpc('global_admin_extend_company_trial', { p_company_id: companyId, p_extra_days: 30 });
    setBusyId(null);
    if (e) {
      setError(e.message);
      return;
    }
    invalidateCompanyLicenseCache(companyId);
    setMessage('Kokeilua jatkettu 30 päivää.');
    await loadOverview();
  }

  return (
    <section className="panel">
      <div className="form-actions" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-primary" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? 'Peruuta' : '+ Uusi yritys'}
        </button>
      </div>
      {showCreate && (
        <form className="line-form-grid" onSubmit={(e) => void createCompany(e)}>
          <label>
            Yrityksen nimi *
            <input
              value={name}
              required
              autoFocus
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(suggestCompanySlug(e.target.value));
              }}
            />
          </label>
          <label>
            Tunniste
            <input
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
            />
          </label>
          <div className="form-actions global-admin-form-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Luodaan…' : 'Luo yritys'}
            </button>
          </div>
        </form>
      )}
      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}
      {loading && rows.length === 0 ? (
        <p className="muted">Ladataan…</p>
      ) : (
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(r) => r.id}
          rowHref={(r) => `/palvelu/yritykset/${r.id}`}
          initialSort={{ key: 'name', dir: 'asc' }}
          filterPlaceholder="Hae yritystä…"
          ariaLabel="Yritykset"
          actions={(r) =>
            r.canExtend ? (
              <button type="button" className="btn btn-secondary btn-sm" disabled={busyId === r.id} onClick={() => void extendTrial(r.id)}>
                {busyId === r.id ? '…' : '+30 pv'}
              </button>
            ) : null
          }
        />
      )}
    </section>
  );
}
