import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { useProfile } from '../hooks/useProfile';
import { getPortalSubscriberId } from '../lib/portalPreview';
import { supabase } from '../lib/supabase';

type Row = { id: string; name: string; address: string; devices: number; latest: string | null };

/** Tilaajaportaali: tilaajan omat asiakkaat (kohteet). */
export default function PortalCustomersPage({ session }: { session: Session }) {
  const { profile, loading } = useProfile(session);
  const subscriberId = getPortalSubscriberId(profile);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (loading || !subscriberId) return;
    void (async () => {
      const { data: cs } = await supabase
        .from('customers')
        .select('id, name, address, postal_code, city')
        .eq('subscriber_id', subscriberId)
        .order('name');
      const customers = (cs ?? []) as Array<{ id: string; name: string; address: string | null; postal_code: string | null; city: string | null }>;
      const ids = customers.map((c) => c.id);
      const [eq, mr] = ids.length
        ? await Promise.all([
            supabase.from('equipment').select('customer_id').in('customer_id', ids),
            supabase.from('maintenance_reports').select('customer_id, completed_at').in('customer_id', ids).not('completed_at', 'is', null),
          ])
        : [{ data: [] }, { data: [] }];
      const devices = new Map<string, number>();
      for (const r of (eq.data ?? []) as { customer_id: string }[]) devices.set(r.customer_id, (devices.get(r.customer_id) ?? 0) + 1);
      const latest = new Map<string, string>();
      for (const r of (mr.data ?? []) as { customer_id: string; completed_at: string }[]) {
        const prev = latest.get(r.customer_id);
        if (!prev || r.completed_at > prev) latest.set(r.customer_id, r.completed_at);
      }
      setRows(customers.map((c) => ({
        id: c.id,
        name: c.name,
        address: [c.address, [c.postal_code, c.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
        devices: devices.get(c.id) ?? 0,
        latest: latest.get(c.id) ?? null,
      })));
    })();
  }, [loading, subscriberId]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter((r) => !q || `${r.name} ${r.address}`.toLowerCase().includes(q));
  }, [rows, query]);

  if (!loading && !subscriberId) return <Navigate to="/laitteet" replace />;
  return (
    <AppLayout session={session}>
      <div className="page-header">
        <div>
          <h1>Asiakkaat</h1>
          <p className="muted">Omat kohteet ({rows?.length ?? 0})</p>
        </div>
      </div>
      <section className="panel">
        <input
          className="portal-customers-search"
          type="search"
          placeholder="Hae nimellä tai osoitteella"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {rows === null ? (
          <p className="muted">Ladataan…</p>
        ) : visible.length === 0 ? (
          <p className="muted">Ei asiakkaita.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Nimi</th><th>Osoite</th><th>Laitteet</th><th>Viimeisin huolto</th></tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id}>
                  <td><Link to={`/kohteet/${r.id}`}>{r.name}</Link></td>
                  <td>{r.address || '—'}</td>
                  <td>{r.devices}</td>
                  <td>{r.latest ? new Date(r.latest).toLocaleDateString('fi-FI') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </AppLayout>
  );
}
