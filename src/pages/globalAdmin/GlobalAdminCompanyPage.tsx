import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import HuoltoSettingsSection from '../../components/HuoltoSettingsSection';
import { notifyHuoltoSettingsChanged } from '../../hooks/useCompanyHuoltoSettings';
import { saveCompanyAdminPatch } from '../../lib/companyAdminSettings';
import { parseHuoltoSettings, serializeHuoltoSettings, type HuoltoSettings } from '../../lib/huoltoCategories';
import type { ManagementOutletContext } from '../../lib/managementOutletContext';
import { parseCompanySettings } from '../../lib/management';
import { supabase } from '../../lib/supabase';
import type { Company } from '../../types';
import UsersPage from '../UsersPage';
import CompanyMonthlyTotal from '../../components/CompanyMonthlyTotal';
import CompanyModulesEditor from './CompanyModulesEditor';
import CompanyModuleTrialsEditor from './CompanyModuleTrialsEditor';
import GlobalAdminCompanyDeleteDialog from './GlobalAdminCompanyDeleteDialog';

const TABS = [
  { id: 'perustiedot', label: 'Perustiedot' },
  { id: 'moduulit', label: 'Moduulit' },
  { id: 'hinnasto', label: 'Huoltohinnasto' },
  { id: 'kayttajat', label: 'Käyttäjät' },
] as const;
type TabId = (typeof TABS)[number]['id'];

/** Yhteys- ja laskutustiedot (yritys muokkaa Oma yritys -sivulla). */
function CompanyContactFacts({ settings }: { settings: unknown }) {
  const s = parseCompanySettings(settings);
  const address = [s.address, `${s.postal_code ?? ''} ${s.city ?? ''}`.trim()].filter(Boolean).join(', ');
  const contact = [s.contact?.name, s.contact?.email, s.contact?.phone].filter((v) => v?.trim()).join(', ');
  const facts: [string, string | undefined][] = [
    ['Y-tunnus', s.billing?.business_id],
    ['Osoite', address],
    ['Yhteyshenkilö', contact],
    ['Yrityksen sähköposti', s.email],
    ['Yrityksen puhelin', s.phone],
    ['Laskutussähköposti', s.billing?.invoice_email],
  ];
  return (
    <dl className="signup-facts" style={{ marginTop: '1rem' }}>
      {facts.map(([k, v]) => (
        <Fragment key={k}>
          <dt>{k}</dt>
          <dd>{v?.trim() || '—'}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

/** /palvelu/yritykset/:companyId — yksi yritys GBA:lle. */
export default function GlobalAdminCompanyPage() {
  const { profile } = useOutletContext<ManagementOutletContext>();
  const { companyId } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const raw = params.get('osio');
  const tab: TabId = TABS.some((t) => t.id === raw) ? (raw as TabId) : 'perustiedot';
  const [company, setCompany] = useState<(Company & { created_at?: string | null }) | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState('');
  const [prices, setPrices] = useState<HuoltoSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [trialsVersion, setTrialsVersion] = useState(0);

  const load = useCallback(async () => {
    if (!companyId) return;
    const { data, error: e } = await supabase
      .from('companies')
      .select('id, name, slug, settings, created_at')
      .eq('id', companyId)
      .maybeSingle();
    if (e) {
      setError(e.message);
      return;
    }
    if (!data) {
      setNotFound(true);
      return;
    }
    setCompany(data as Company & { created_at?: string | null });
    setName(data.name ?? '');
    setPrices(null);
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  function selectTab(id: TabId) {
    setMessage(null);
    setError(null);
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.set('osio', id);
      return n;
    }, { replace: true });
  }

  async function saveName() {
    if (!company || !name.trim()) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await saveCompanyAdminPatch(supabase, company.id, { name }, profile.company_id);
      setMessage('Tallennettu.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tallennus epäonnistui.');
    } finally {
      setBusy(false);
    }
  }

  async function savePrices() {
    if (!company || !prices) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const huolto = serializeHuoltoSettings(prices);
      await saveCompanyAdminPatch(supabase, company.id, { settings: { huolto } }, profile.company_id);
      notifyHuoltoSettingsChanged(company.id, huolto);
      setMessage('Hinnasto tallennettu.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tallennus epäonnistui.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete(confirmSlug: string) {
    if (!company) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const { error: e } = await supabase.rpc('global_admin_delete_company', {
      p_company_id: company.id,
      p_confirm_slug: confirmSlug,
    });
    setDeleteBusy(false);
    if (e) {
      setDeleteError(e.message);
      return;
    }
    navigate('/palvelu/yritykset', { replace: true });
  }

  if (!companyId || notFound) return <Navigate to="/palvelu/yritykset" replace />;
  if (!company) return error ? <p className="error">{error}</p> : <p className="muted">Ladataan…</p>;

  return (
    <section className="panel">
      <p className="muted" style={{ margin: 0 }}>
        <Link to="/palvelu/yritykset">← Yritykset</Link>
      </p>
      <h2 style={{ marginTop: '.4rem' }}>{company.name}</h2>
      <div className="tabs company-settings-tabs">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={tab === t.id ? 'tab active' : 'tab'} onClick={() => selectTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'perustiedot' && (
        <div className="form-grid">
          <div className="line-form-grid">
            <label>
              Yrityksen nimi
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              Tunniste
              <input value={company.slug ?? ''} readOnly disabled />
            </label>
            {company.created_at && (
              <label>
                Luotu
                <input value={new Date(company.created_at).toLocaleDateString('fi-FI')} readOnly disabled />
              </label>
            )}
          </div>
          <CompanyContactFacts settings={company.settings} />
          {message && <p className="success">{message}</p>}
          {error && <p className="error">{error}</p>}
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                setDeleteError(null);
                setDeleteOpen(true);
              }}
            >
              Poista yritys
            </button>
            <button type="button" className="btn btn-primary" disabled={busy || name.trim() === company.name} onClick={() => void saveName()}>
              {busy ? 'Tallennetaan…' : 'Tallenna'}
            </button>
          </div>
        </div>
      )}

      {tab === 'moduulit' && (
        <>
          <CompanyModulesEditor companyId={company.id} settings={company.settings} ownCompanyId={profile.company_id} onSaved={load} />
          <CompanyModuleTrialsEditor companyId={company.id} onChanged={() => setTrialsVersion((v) => v + 1)} />
          <CompanyMonthlyTotal key={`${trialsVersion}:${JSON.stringify(company.settings ?? null)}`} companyId={company.id} />
        </>
      )}

      {tab === 'hinnasto' && (
        <div className="form-grid">
          <HuoltoSettingsSection
            bare
            mode="prices"
            companySettings={{ huolto: prices ?? parseHuoltoSettings(company.settings) }}
            onChange={setPrices}
          />
          {message && <p className="success">{message}</p>}
          {error && <p className="error">{error}</p>}
          <div className="form-actions">
            <button type="button" className="btn btn-primary" disabled={busy || !prices} onClick={() => void savePrices()}>
              {busy ? 'Tallennetaan…' : 'Tallenna'}
            </button>
          </div>
        </div>
      )}

      {tab === 'kayttajat' && <UsersPage fixedCompanyId={company.id} />}

      <GlobalAdminCompanyDeleteDialog
        company={company}
        open={deleteOpen}
        busy={deleteBusy}
        error={deleteError}
        onClose={() => {
          if (!deleteBusy) setDeleteOpen(false);
        }}
        onConfirm={(slug) => void confirmDelete(slug)}
      />
    </section>
  );
}
