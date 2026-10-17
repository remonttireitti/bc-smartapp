import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import DataTable, { type DataTableColumn } from '../../components/DataTable';
import { invalidateCompanyLicenseCache } from '../../hooks/useCompanyLicense';
import { parseLicenseOverviewRows, trialDaysRemaining, type LicenseOverviewRow } from '../../lib/companyLicense';
import { billingPeriodLabel, normalizeBillingPeriod } from '../../lib/companySignup';
import { HUOLTO_CATEGORIES, huoltoAccess, parseHuoltoSettings, type HuoltoCategoryKey } from '../../lib/huoltoCategories';
import type { ManagementOutletContext } from '../../lib/managementOutletContext';
import { supabase } from '../../lib/supabase';
import { formatTrialEnd } from '../../lib/moduleTrials';
import { licenseStatusText } from './utils';
import { useGlobalAdminMeta } from './useGlobalAdminMeta';
import './GlobalAdminCompaniesPage.css';

/** Lisenssin moduulit sarakkeina: avain settings.license.modules, lyhyt otsikko, työkaluvihje. */
const MODULE_COLUMNS: { key: string; short: string; label: string }[] = [
  { key: 'quotes', short: 'Tarj.', label: 'Tarjoukset' },
  { key: 'billing', short: 'Lask.', label: 'Laskutus' },
  { key: 'remote_monitoring', short: 'Etä', label: 'Etäseuranta' },
  { key: 'tools', short: 'Työk.', label: 'Työkalut' },
  { key: 'partners', short: 'Kump.', label: 'Kumppanuudet' },
  { key: 'inventory', short: 'Var.', label: 'Varasto' },
];

type Row = {
  id: string;
  name: string;
  slug: string;
  users: number;
  rows: number;
  status: string;
  trialDays: number | null;
  canExtend: boolean;
  base: boolean;
  modules: Record<string, boolean>;
  huolto: Record<HuoltoCategoryKey, boolean>;
  /** Aktiiviset moduulikokeilut: avain → päättymispäivä. */
  trials: Record<string, string>;
  monthly: number | null;
  period: string;
};

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function OnOff({ on, label, trialEnds }: { on: boolean; label: string; trialEnds?: string }) {
  if (trialEnds) {
    return (
      <span className="module-flag module-flag-trial" title={`${label}: kokeilu, päättyy ${formatTrialEnd(trialEnds)}`}>
        K
      </span>
    );
  }
  return (
    <span className={on ? 'module-flag module-flag-on' : 'module-flag'} title={`${label}: ${on ? 'päällä' : 'pois'}`}>
      {on ? '✓' : '–'}
    </span>
  );
}

const eur = (n: number) => n.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

/** /palvelu/yritykset: kaikki yritykset (GBA). Uudet yritykset syntyvät Tilaukset-sivun hyväksynnästä. */
export default function GlobalAdminCompaniesPage() {
  const { profile } = useOutletContext<ManagementOutletContext>();
  const { companies, counts, loading } = useGlobalAdminMeta(!!profile.is_global_admin);
  const [overview, setOverview] = useState<LicenseOverviewRow[]>([]);
  const [monthly, setMonthly] = useState<Record<string, number>>({});
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

  const companyIds = useMemo(() => companies.map((c) => c.id).join(','), [companies]);
  useEffect(() => {
    if (!companyIds) return;
    let cancelled = false;
    void Promise.all(
      companyIds.split(',').map(async (id) => {
        const { data } = await supabase.rpc('company_monthly_price_breakdown', { p_company_id: id });
        const net = Number(rec(data).net);
        return [id, Number.isFinite(net) ? net : null] as const;
      }),
    ).then((pairs) => {
      if (cancelled) return;
      const out: Record<string, number> = {};
      for (const [id, net] of pairs) if (net != null) out[id] = net;
      setMonthly(out);
    });
    return () => {
      cancelled = true;
    };
  }, [companyIds]);

  const rows: Row[] = useMemo(() => {
    const byId = new Map(overview.map((r) => [r.company_id, r]));
    return companies.map((c) => {
      const o = byId.get(c.id);
      const access = huoltoAccess(parseHuoltoSettings(c.settings));
      const s = o?.snapshot;
      const lic = rec(rec(c.settings).license);
      const licModules = rec(lic.modules);
      const legacy = lic.enrollment === 'legacy';
      const modules: Record<string, boolean> = {};
      for (const m of MODULE_COLUMNS) {
        // Varasto ennen varasto_module.sql-ajoa: kulkee peruspaketin mukana.
        modules[m.key] = m.key === 'inventory' && !('inventory' in licModules)
          ? legacy || lic.base_active === true
          : licModules[m.key] === true;
      }
      const huoltoOn = Object.fromEntries(HUOLTO_CATEGORIES.map((k) => [k.key, access.isCategoryEnabled(k.key)])) as Record<HuoltoCategoryKey, boolean>;
      // Kokeilun jälkeen jatkoon tilattu = tilattu.
      for (const t of s?.module_trials ?? []) {
        if (t.active || !t.keep_after) continue;
        if (t.module_key in huoltoOn) huoltoOn[t.module_key as HuoltoCategoryKey] = true;
        else modules[t.module_key] = true;
      }
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
        base: legacy || lic.base_active === true,
        modules,
        trials: Object.fromEntries((s?.module_trials ?? []).filter((t) => t.active).map((t) => [t.module_key, t.ends_at])),
        huolto: huoltoOn,
        monthly: monthly[c.id] ?? null,
        period: billingPeriodLabel(normalizeBillingPeriod(lic.billing_interval)),
      };
    });
  }, [companies, counts, overview, monthly]);

  const flagCol = (
    key: string,
    short: string,
    label: string,
    on: (r: Row) => boolean,
    trialKey?: string,
  ): DataTableColumn<Row> => ({
    key,
    label: short,
    title: label,
    className: 'module-flag-col',
    value: (r) => (trialKey && r.trials[trialKey] ? 0.5 : on(r) ? 1 : 0),
    render: (r) => <OnOff on={on(r)} label={label} trialEnds={trialKey ? r.trials[trialKey] : undefined} />,
  });

  const columns: DataTableColumn<Row>[] = [
    { key: 'name', label: 'Yritys', value: (r) => r.name, render: (r) => <strong>{r.name}</strong> },
    { key: 'slug', label: 'Tunniste', value: (r) => r.slug, className: 'muted' },
    {
      key: 'status',
      label: 'Tila',
      value: (r) => r.status,
      render: (r) => (r.trialDays != null ? `${r.status} (${r.trialDays} pv)` : r.status),
    },
    flagCol('base', 'Perus', 'Peruspaketti', (r) => r.base),
    ...MODULE_COLUMNS.map((m) => flagCol(`m:${m.key}`, m.short, m.label, (r) => r.modules[m.key] === true, m.key)),
    ...HUOLTO_CATEGORIES.map((k) => flagCol(`h:${k.key}`, k.short, k.label, (r) => r.huolto[k.key], k.key)),
    { key: 'period', label: 'Laskutus', value: (r) => r.period },
    { key: 'users', label: 'Käyttäjiä', value: (r) => r.users, className: 'num' },
    { key: 'rows', label: 'Rivejä', value: (r) => r.rows, className: 'num' },
    {
      key: 'monthly',
      label: '€/kk',
      title: 'Kuukausihinta alv 0 % (laskutusjakson alennus huomioitu)',
      className: 'num',
      value: (r) => r.monthly,
      render: (r) => (r.monthly == null ? '—' : eur(r.monthly)),
    },
  ];

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
