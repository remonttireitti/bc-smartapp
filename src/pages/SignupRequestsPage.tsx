import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import PriceEstimateTable from '../components/PriceEstimateTable';
import CompanyMonthlyTotal from '../components/CompanyMonthlyTotal';
import { demoSummaryText } from '../components/OnboardingDemoPanel';
import {
  ADDON_MODULES,
  ADDON_MODULE_LABELS,
  HUOLTO_KEYS,
  HUOLTO_LABELS,
  SIGNUP_STATUS_LABELS,
  STAFF_ROLE_LABELS,
  approveSignup,
  estimateMonthly,
  formatEur,
  normalizeRoles,
  parsePriceList,
  rejectSignup,
  signupSelection,
  billingPeriodLabel,
  normalizeBillingPeriod,
  periodPrice,
  type BillingPeriod,
  type InviteResult,
  type PriceList,
  type SignupRequestRow,
} from '../lib/companySignup';
import {
  createOnboardingDemoData,
  deleteOnboardingDemoData,
  fetchOnboardingDemoStatus,
  type OnboardingDemoStatus,
} from '../lib/onboardingDemoData';
import { supabase } from '../lib/supabase';

const STATUS_COLORS: Record<SignupRequestRow['status'], string> = {
  pending: '#f59e0b',
  approved: '#16a34a',
  rejected: '#94a3b8',
};

const INVITE_LABELS: Record<InviteResult['status'], string> = {
  invited: 'Kutsuttu',
  exists: 'Tunnus on jo olemassa',
  error: 'Virhe',
};

function fiDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('fi-FI', { timeZone: 'Europe/Helsinki', dateStyle: 'short', timeStyle: 'short' });
}

function selectionText(r: SignupRequestRow): string {
  return [
    ...ADDON_MODULES.filter((k) => r.modules?.[k]).map((k) => ADDON_MODULE_LABELS[k]),
    ...HUOLTO_KEYS.filter((k) => r.huolto?.[k]).map((k) => HUOLTO_LABELS[k]),
  ].join(', ');
}

function requestPeriod(r: SignupRequestRow): BillingPeriod {
  return normalizeBillingPeriod((r.estimate as { billing_interval?: unknown } | null | undefined)?.billing_interval);
}

function requestEstimate(r: SignupRequestRow, prices: PriceList | null) {
  if (!prices) return null;
  return estimateMonthly(
    signupSelection({
      modules: r.modules ?? {},
      huolto: r.huolto ?? {},
      users: (r.users ?? []).map((u) => ({ ...u, roles: normalizeRoles(u.roles) })),
    } as never),
    prices,
  );
}

function DemoDataTool() {
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [status, setStatus] = useState<OnboardingDemoStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void supabase
      .from('companies')
      .select('id, name')
      .order('name')
      .then(({ data }) => setCompanies((data as { id: string; name: string }[]) ?? []));
  }, []);

  async function refresh(id: string) {
    setStatus(null);
    setError(null);
    if (!id) return;
    try {
      setStatus(await fetchOnboardingDemoStatus(supabase, id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tilan lataus epäonnistui');
    }
  }

  async function run(kind: 'create' | 'delete') {
    if (kind === 'delete' && !window.confirm('Poistetaanko yrityksen esimerkkitiedot?')) return;
    setBusy(true);
    setError(null);
    try {
      if (kind === 'create') await createOnboardingDemoData(supabase, companyId);
      else await deleteOnboardingDemoData(supabase, companyId);
      await refresh(companyId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Toiminto epäonnistui');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="signup-demo-tool">
      <label>
        Yritys
        <select
          value={companyId}
          onChange={(e) => {
            setCompanyId(e.target.value);
            void refresh(e.target.value);
          }}
        >
          <option value="">Valitse…</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </label>
      {status ? (
        <p className="muted">{status.hasDemo ? demoSummaryText(status) : 'Ei esimerkkitietoja'}</p>
      ) : null}
      {error && <p className="error">{error}</p>}
      {companyId && status ? (
        status.hasDemo ? (
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void run('delete')}>
            Poista esimerkkitiedot
          </button>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void run('create')}>
            Luo esimerkkitiedot
          </button>
        )
      ) : null}
    </div>
  );
}

function RequestDetail({ row, prices, onChanged }: { row: SignupRequestRow; prices: PriceList | null; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const estimate = useMemo(() => requestEstimate(row, prices), [row, prices]);
  const invites = row.invite_results?.users ?? [];
  const failedInvites = invites.filter((i) => i.status !== 'invited').length;

  async function approve() {
    if (!window.confirm(`Hyväksytäänkö ${row.company_name}? Yritys luodaan ja ${row.users.length} käyttäjää kutsutaan.`)) return;
    setBusy(true);
    setError(null);
    try {
      await approveSignup(row.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hyväksyntä epäonnistui');
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    setBusy(true);
    setError(null);
    try {
      const res = await rejectSignup(row.id, reason);
      if (!res.mail_sent) setError('Hylätty, mutta ilmoitusviesti ei lähtenyt.');
      setRejecting(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hylkäys epäonnistui');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="signup-detail">
      <div className="signup-detail-grid">
        <dl className="signup-facts">
          <dt>Tila</dt>
          <dd>
            <span className="badge" style={{ background: STATUS_COLORS[row.status], color: '#fff' }}>
              {SIGNUP_STATUS_LABELS[row.status]}
            </span>
            {row.decided_at ? <span className="muted"> {fiDateTime(row.decided_at)}</span> : null}
          </dd>
          <dt>Saapunut</dt>
          <dd>{fiDateTime(row.created_at)}</dd>
          <dt>Y-tunnus</dt>
          <dd>{row.business_id}</dd>
          <dt>Osoite</dt>
          <dd>{[row.address, `${row.postal_code} ${row.city}`.trim()].filter(Boolean).join(', ')}</dd>
          <dt>Yhteyshenkilö</dt>
          <dd>{row.contact_name}, <a href={`mailto:${row.email}`}>{row.email}</a>, {row.phone}</dd>
          <dt>Moduulit</dt>
          <dd>Peruspaketti{selectionText(row) ? `, ${selectionText(row)}` : ''}</dd>
          <dt>Laskutusjakso</dt>
          <dd>
            {billingPeriodLabel(requestPeriod(row))}
            {requestPeriod(row) !== 'monthly' && estimate && prices ? (() => {
              const p = periodPrice(estimate.net, requestPeriod(row), prices);
              return (
                <span className="muted">
                  {' '}— {formatEur(p.net)} alv 0 % ({formatEur(p.gross)} sis. alv 25,5 %), alennus {p.discount_pct.toLocaleString('fi-FI')} %
                </span>
              );
            })() : null}
          </dd>
          {row.message ? (
            <>
              <dt>Lisätietoja</dt>
              <dd className="signup-message">{row.message}</dd>
            </>
          ) : null}
          {row.reject_reason ? (
            <>
              <dt>Hylkäyksen syy</dt>
              <dd>{row.reject_reason}</dd>
            </>
          ) : null}
        </dl>
        {row.status === 'approved' && row.company_id ? (
          <CompanyMonthlyTotal companyId={row.company_id} title="Yrityksen kuukausihinta" />
        ) : estimate ? (
          <PriceEstimateTable estimate={estimate} />
        ) : null}
      </div>

      <table className="signup-users-table">
        <thead>
          <tr>
            <th>Nimi</th>
            <th>Sähköposti</th>
            <th>Puhelin</th>
            <th>Roolit</th>
            {invites.length ? <th>Kutsu</th> : null}
          </tr>
        </thead>
        <tbody>
          {row.users.map((u) => {
            const inv = invites.find((i) => i.email === u.email.toLowerCase());
            return (
              <tr key={u.email}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.phone}</td>
                <td>{normalizeRoles(u.roles).map((r) => STAFF_ROLE_LABELS[r]).join(', ')}</td>
                {invites.length ? <td title={inv?.error}>{inv ? INVITE_LABELS[inv.status] : ''}</td> : null}
              </tr>
            );
          })}
        </tbody>
      </table>

      {error && <p className="error">{error}</p>}

      <div className="signup-actions">
        {row.status === 'pending' && !rejecting ? (
          <>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void approve()}>
              {busy ? 'Käsitellään…' : 'Hyväksy'}
            </button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setRejecting(true)}>
              Hylkää
            </button>
          </>
        ) : null}
        {row.status === 'approved' && failedInvites > 0 ? (
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void approve()}>
            Kutsu uudelleen
          </button>
        ) : null}
      </div>

      {rejecting ? (
        <div className="signup-reject">
          <label>
            Syy (lähtee asiakkaalle, valinnainen)
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="signup-actions">
            <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void reject()}>
              {busy ? 'Lähetetään…' : 'Hylkää ja lähetä ilmoitus'}
            </button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setRejecting(false)}>
              Peruuta
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function SignupRequestsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [rows, setRows] = useState<SignupRequestRow[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [prices, setPrices] = useState<PriceList | null>(null);

  async function load() {
    const { data, error } = await supabase
      .from('company_signup_requests')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      setMissing(true);
      setRows([]);
      return;
    }
    setRows((data as SignupRequestRow[]) ?? []);
  }

  useEffect(() => {
    void load();
    void supabase
      .from('license_catalog')
      .select('*')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => setPrices(parsePriceList(data)));
  }, []);

  const columns: DataTableColumn<SignupRequestRow>[] = useMemo(
    () => [
      { key: 'created', label: 'Saapunut', value: (r) => r.created_at, render: (r) => fiDateTime(r.created_at) },
      { key: 'company', label: 'Yritys', value: (r) => r.company_name },
      { key: 'bid', label: 'Y-tunnus', value: (r) => r.business_id },
      { key: 'contact', label: 'Yhteyshenkilö', value: (r) => r.contact_name },
      { key: 'users', label: 'Käyttäjiä', value: (r) => r.users?.length ?? 0 },
      {
        key: 'price',
        label: '€/kk alv 0 %',
        className: 'num',
        value: (r) => requestEstimate(r, prices)?.net ?? r.estimate?.net ?? null,
        render: (r) => {
          const n = requestEstimate(r, prices)?.net ?? r.estimate?.net;
          return n == null ? '' : formatEur(n);
        },
      },
      { key: 'period', label: 'Laskutus', value: (r) => billingPeriodLabel(requestPeriod(r)) },
      { key: 'status', label: 'Tila', value: (r) => SIGNUP_STATUS_LABELS[r.status] },
    ],
    [prices],
  );

  const selected = id ? rows?.find((r) => r.id === id) ?? null : null;

  if (rows === null) return <p className="muted">Ladataan…</p>;

  if (missing) {
    return (
      <div className="signup-requests-page">
        <p className="muted">Tilaukset eivät ole vielä käytössä (tietokantapäivitys ajamatta).</p>
      </div>
    );
  }

  if (id) {
    return (
      <div className="signup-requests-page">
        <p className="muted" style={{ margin: 0 }}>
          <Link to="/palvelu/tilaukset">← Tilaukset</Link>
        </p>
        {selected ? (
          <>
            <h2>{selected.company_name}</h2>
            <RequestDetail row={selected} prices={prices} onChanged={() => void load()} />
          </>
        ) : (
          <p className="muted">Tilausta ei löydy.</p>
        )}
      </div>
    );
  }

  return (
    <div className="signup-requests-page">
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/palvelu/tilaukset/${r.id}`)}
        rowAccent={(r) => STATUS_COLORS[r.status]}
        initialSort={{ key: 'created', dir: 'desc' }}
        emptyText="Ei tilauksia"
        ariaLabel="Tilaukset"
      />

      <section className="form-section">
        <h2>Esimerkkitiedot</h2>
        <DemoDataTool />
      </section>
    </div>
  );
}
