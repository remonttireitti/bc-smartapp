import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { QuoteRequestListItem } from '../components/quoteRequest/QuoteRequestListItem';
import { supabase } from '../lib/supabase';
import { quoteListTrail, withNavTrail } from '../lib/navigationTrail';
import { normalizeQuoteRequestData } from '../lib/quoteRequest/defaults';
import type { QuoteRequestRow } from '../lib/quoteRequest/types';
import { useProfile } from '../hooks/useProfile';

interface Props {
  session: Session;
}

function quoteSearchText(row: QuoteRequestRow): string {
  const data = normalizeQuoteRequestData(row.data);
  return [
    row.title,
    row.customers?.name,
    data.legacyCustomerName,
    row.equipment?.name,
    row.equipment?.tag,
    row.owner_company?.name,
    row.branding_company?.name,
    row.created_by_company?.name,
    data.notes,
    data.introText,
    ...(data.lines ?? []).map((line) => line.description),
    ...(data.workItems ?? []).map((item) => item.description),
    ...(data.materials ?? []).map((item) => item.name),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export default function QuoteRequestsPage({ session }: Props) {
  const { profile } = useProfile(session);
  const [rows, setRows] = useState<QuoteRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    void loadRows();
  }, [session.user.id]);

  async function loadRows() {
    setLoading(true);
    const { data, error } = await supabase
      .from('quote_requests')
      .select(`
        id, title, status, data, updated_at, created_at,
        customer_id, equipment_id, owner_company_id, branding_company_id, created_by_company_id,
        customers(name, address, city),
        equipment(name, tag),
        owner_company:companies!quote_requests_owner_company_id_fkey(name),
        branding_company:companies!quote_requests_branding_company_id_fkey(name),
        created_by_company:companies!quote_requests_created_by_company_id_fkey(name)
      `)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error(error);
      setRows([]);
    } else {
      setRows((data as unknown as QuoteRequestRow[]) ?? []);
    }
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => quoteSearchText(row).includes(query));
  }, [rows, search]);

  const grouped = useMemo(() => {
    const drafts = filtered.filter((row) => row.status === 'draft');
    const sent = filtered.filter((row) => row.status !== 'draft');
    return { drafts, sent };
  }, [filtered]);

  return (
    <AppLayout session={session}>
      <div className="page-header">
        <div>
          <p className="breadcrumb">
            <Link to="/">Etusivu</Link> / <Link to="/tarjouspyynnot">Tarjouspyyntö</Link> / Lista
          </p>
          <h1>Tallennetut tarjouspyynnöt</h1>
          <p className="muted">
            {profile?.companies?.name ?? '—'} • tarjoukset ja laskelmat
          </p>
        </div>
        <div className="page-header-actions">
          <Link to="/tarjouspyynnot/uusi" className="btn btn-primary" {...withNavTrail(quoteListTrail())}>
            + Uusi tarjouspyyntö
          </Link>
        </div>
      </div>

      <div className="toolbar">
        <label className="search-field-grow">
          Hae tarjouksia
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Asiakas, kumppani, rivi, huomautus…"
          />
        </label>
      </div>

      {loading ? (
        <p className="muted">Ladataan…</p>
      ) : rows.length === 0 ? (
        <section className="panel">
          <p>Ei tarjouspyyntöjä. Aloita luomalla uusi tarjous.</p>
        </section>
      ) : filtered.length === 0 ? (
        <section className="panel">
          <p>Ei tuloksia haulle “{search.trim()}”.</p>
        </section>
      ) : (
        <>
          {grouped.drafts.length > 0 && (
            <section className="panel">
              <h2>Luonnokset ({grouped.drafts.length})</h2>
              <ul className="report-list report-list-modern quote-request-list">
                {grouped.drafts.map((row) => (
                  <QuoteRequestListItem key={row.id} row={row} />
                ))}
              </ul>
            </section>
          )}

          {grouped.sent.length > 0 && (
            <section className="panel">
              <h2>Lähetetyt ({grouped.sent.length})</h2>
              <ul className="report-list report-list-modern quote-request-list">
                {grouped.sent.map((row) => (
                  <QuoteRequestListItem key={row.id} row={row} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </AppLayout>
  );
}
