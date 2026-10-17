import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { ManagementOutletContext } from '../lib/managementOutletContext';

type Row = { id: string; name: string; city: string | null; portalEmail: string | null };

/** Yrityksen ylläpitäjä: asiakasportaalien tunnukset ja esikatselu (tilaajakohteet → Tilaajaportaali). */
export default function CustomerPortalAdminPage() {
  const { profile } = useOutletContext<ManagementOutletContext>();
  const companyId = profile.company_id;
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [onlyWithUser, setOnlyWithUser] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      const [customers, users] = await Promise.all([
        supabase
          .from('customers')
          .select('id, name, city')
          .eq('owner_company_id', companyId)
          .is('subscriber_id', null)
          .order('name'),
        supabase.from('profiles').select('customer_id, email').eq('company_id', companyId).eq('role', 'customer'),
      ]);
      if (cancelled) return;
      if (customers.error) {
        setError(customers.error.message);
        setRows([]);
      } else {
        const emails = new Map<string, string>();
        for (const u of (users.data ?? []) as { customer_id: string | null; email: string | null }[]) {
          if (u.customer_id) emails.set(u.customer_id, u.email ?? '—');
        }
        setRows(
          ((customers.data ?? []) as { id: string; name: string; city: string | null }[]).map((c) => ({
            ...c,
            portalEmail: emails.get(c.id) ?? null,
          })),
        );
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!onlyWithUser || !!r.portalEmail)
        && (!q || r.name.toLowerCase().includes(q) || (r.city ?? '').toLowerCase().includes(q) || (r.portalEmail ?? '').toLowerCase().includes(q)),
    );
  }, [rows, search, onlyWithUser]);
  const withUser = rows.filter((r) => r.portalEmail).length;

  return (
    <section className="panel">
      <h2>Asiakasportaali</h2>
      <p className="muted">
        Asiakkaan portaalitunnus ja esikatselu. Tilaajien kohteet: <Link to="/hallinta/tilaajat">Tilaajaportaali</Link>.
      </p>
      <div className="inline-actions" style={{ flexWrap: 'wrap', margin: '.5rem 0' }}>
        <input type="search" placeholder="Hae asiakasta…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: '20rem' }} />
        <label className="signup-check">
          <input type="checkbox" checked={onlyWithUser} onChange={(e) => setOnlyWithUser(e.target.checked)} /> Vain tunnukselliset ({withUser})
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      {loading ? (
        <p className="muted">Ladataan…</p>
      ) : visible.length === 0 ? (
        <p className="muted">
          {onlyWithUser ? 'Ei portaalitunnuksia. Luo tunnus asiakkaan sivulta (Asiakasportaali).' : 'Ei asiakkaita.'}
        </p>
      ) : (
        <ul className="report-list compact">
          {visible.map((r) => (
            <li key={r.id} className="report-list-row-actions">
              <div>
                <strong>{r.name}</strong>
                <span className="muted">{[r.city, r.portalEmail ?? 'Ei portaalitunnusta'].filter(Boolean).join(' • ')}</span>
              </div>
              <div className="inline-actions">
                <Link to={`/esikatselu/asiakas/${r.id}`} target="_blank" rel="noopener" className="btn btn-primary btn-sm">
                  Esikatsele
                </Link>
                <Link to={`/asiakkaat/${r.id}#customer-portal`} className="btn btn-secondary btn-sm">
                  {r.portalEmail ? 'Hallitse tunnusta' : 'Luo tunnus'}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
