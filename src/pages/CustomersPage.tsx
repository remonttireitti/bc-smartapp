import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import ToggleSwitch from '../components/ToggleSwitch';
import { CustomerListItem } from '../components/CustomerListItem';
import { CUSTOMER_SELECT } from '../lib/customers';
import { quickSearchHitPath, type QuickSearchHit } from '../lib/quickSearch';
import { isPortalUser } from '../lib/portalWorkOrder';
import { supabase } from '../lib/supabase';
import { useProfile } from '../hooks/useProfile';
import type { Customer } from '../types';

interface Props {
  session: Session;
}

type SearchHit = QuickSearchHit;

export default function CustomersPage({ session }: Props) {
  const { profile, loading: profileLoading } = useProfile(session);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searchHitsFor, setSearchHitsFor] = useState('');
  const [ownOnly, setOwnOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (profileLoading) return;
    void load();
  }, [profile?.company_id, profileLoading]);

  const portalMode = isPortalUser(profile);
  const isSubscriberPortal = profile?.role === 'subscriber';

  useEffect(() => {
    const q = search.trim();
    if (portalMode || q.length < 2) {
      setSearchHits([]);
      setSearchHitsFor('');
      return;
    }

    const normalized = q.toLowerCase();
    const timer = setTimeout(() => {
      void supabase.rpc('company_search', { query: q, result_limit: 30 }).then(({ data, error }) => {
        if (error) {
          console.error('Asiakashaku epäonnistui:', error.message);
          setSearchHits([]);
          setSearchHitsFor('');
          return;
        }
        setSearchHits((data as SearchHit[]) ?? []);
        setSearchHitsFor(normalized);
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [search, portalMode]);

  async function load() {
    if (!profile?.company_id) {
      setCustomers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);

    const { data: customerRows, error } = await supabase
      .from('customers')
      .select(CUSTOMER_SELECT)
      .order('name');

    if (error) {
      console.error(error);
      setLoadError(error.message);
      setCustomers([]);
    } else {
      setCustomers((customerRows as unknown as Customer[]) ?? []);
    }
    setLoading(false);
  }

  const visibleCustomers = useMemo(() => {
    if (!ownOnly || !profile?.company_id) return customers;
    return customers.filter((c) => c.owner_company_id === profile.company_id);
  }, [customers, ownOnly, profile?.company_id]);

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return visibleCustomers;

    const localMatches = visibleCustomers.filter(
      (c) =>
        c.name.toLowerCase().includes(q)
        || (c.address ?? '').toLowerCase().includes(q)
        || (c.city ?? '').toLowerCase().includes(q)
        || (c.phone ?? '').toLowerCase().includes(q),
    );

    const activeSearchHits = searchHitsFor === q ? searchHits : [];
    if (q.length < 2 || activeSearchHits.length === 0) {
      return localMatches;
    }

    const rpcCustomerIds = new Set(
      activeSearchHits.filter((h) => h.entity_type === 'customer').map((h) => h.entity_id),
    );
    if (rpcCustomerIds.size === 0) {
      return localMatches;
    }

    const merged = new Map<string, Customer>();
    for (const customer of localMatches) merged.set(customer.id, customer);
    for (const customer of visibleCustomers) {
      if (rpcCustomerIds.has(customer.id)) merged.set(customer.id, customer);
    }
    return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name, 'fi'));
  }, [visibleCustomers, search, searchHits, searchHitsFor]);

  return (
    <AppLayout session={session}>
      <div className="page-header">
        <div>
          <p className="breadcrumb">
            <Link to="/">Etusivu</Link> / Asiakkaat
          </p>
          <h1>Asiakkaat</h1>
          <p className="muted">
            {portalMode ? (
              isSubscriberPortal ? (
                <>
                  {profile?.companies?.name ?? '—'} • kohteet, laitteet ja toimitetut raportit linkitettynä
                  tilaajanasi.
                </>
              ) : (
                <>
                  {profile?.companies?.name ?? '—'} • oman kohteen laitteet ja toimitetut raportit.
                </>
              )
            ) : (
              <>
                {profile?.companies?.name ?? '—'} • asiakasrekisteri, laitteet ja dokumentit. Uusi asiakas luodaan{' '}
                <Link to="/tyoraportit/uusi">työraportin</Link> yhteydessä.
              </>
            )}
          </p>
        </div>
      </div>

      <div className="toolbar">
        <label className="search-field-grow">
          Hae asiakasta
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nimi, osoite, kaupunki, puhelin…"
          />
        </label>
        {!portalMode && (
          <ToggleSwitch
            checked={ownOnly}
            onChange={setOwnOnly}
            label="Vain omat asiakkaat"
          />
        )}
      </div>

      {loadError && <p className="error">{loadError}</p>}

      {!portalMode && search.trim().length >= 2 && searchHitsFor === search.trim().toLowerCase() && searchHits.length > 0 && (
        <section className="panel search-hits">
          <h2>Hakutulokset</h2>
          <ul className="report-list compact">
            {searchHits.map((hit) => {
              const path = quickSearchHitPath(hit);
              return (
                <li key={`${hit.entity_type}-${hit.entity_id}`}>
                  {path ? (
                    <Link to={path} className="report-link">
                      <div className="report-link-body">
                        <strong>{hit.title}</strong>
                        <span className="muted">
                          {hit.entity_type === 'customer' ? 'Asiakas' : hit.entity_type === 'equipment' ? 'Laite' : hit.entity_type}
                          {hit.subtitle ? ` • ${hit.subtitle}` : ''}
                        </span>
                      </div>
                    </Link>
                  ) : (
                    <span className="muted">
                      {hit.title} {hit.subtitle ? `(${hit.subtitle})` : ''}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {loading ? (
        <p className="muted">Ladataan…</p>
      ) : (
        <section className="panel">
          <h2>{portalMode ? `Kohteet (${filteredCustomers.length})` : `Asiakasrekisteri (${filteredCustomers.length})`}</h2>
          {filteredCustomers.length === 0 ? (
            <p className="muted">
              {portalMode
                ? 'Ei linkitettyjä kohteita. Pyydä palveluyritystä linkittämään kohteet tilaajaasi.'
                : 'Ei asiakkaita valituilla suodattimilla.'}
            </p>
          ) : (
            <ul className="report-list">
              {filteredCustomers.map((c) => (
                <li key={c.id}>
                  <CustomerListItem
                    customer={c}
                    showPortalAction={
                      profile?.role === 'admin'
                      && c.owner_company_id === profile.company_id
                      && !c.subscriber_id
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </AppLayout>
  );
}
