import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { QuoteRequestListItem } from '../components/quoteRequest/QuoteRequestListItem';
import { canDeleteQuoteRequest } from '../lib/deletePermissions';
import { deleteQuoteRequestById } from '../lib/deleteQuoteRequest';
import { supabase } from '../lib/supabase';
import { clearLocalQuoteDraft, localQuoteDraftKey } from '../lib/quoteRequestDraftStorage';
import { quoteListTrail, withNavTrail } from '../lib/navigationTrail';
import { normalizeQuoteRequestData } from '../lib/quoteRequest/defaults';
import type { QuoteRequestRow } from '../lib/quoteRequest/types';
import { useProfile } from '../hooks/useProfile';

interface Props {
  session: Session;
}

type QuoteStatusFilter = 'draft' | 'sent' | 'ordered';

const STATUS_FILTER_OPTIONS: Array<{ id: QuoteStatusFilter; label: string }> = [
  { id: 'draft', label: 'Luonnokset' },
  { id: 'sent', label: 'Lähetetyt' },
  { id: 'ordered', label: 'Tilatut' },
];

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

function QuoteRequestGrid({
  rows,
  canDelete,
  deletingDraftId,
  onDelete,
}: {
  rows: QuoteRequestRow[];
  canDelete: (row: QuoteRequestRow) => boolean;
  deletingDraftId: string | null;
  onDelete: (row: QuoteRequestRow) => void;
}) {
  return (
    <div className="grid quote-request-grid">
      {rows.map((row) => (
        <QuoteRequestListItem
          key={row.id}
          row={row}
          onDelete={canDelete(row) ? () => onDelete(row) : undefined}
          deleteBusy={deletingDraftId === row.id}
        />
      ))}
    </div>
  );
}

export default function QuoteRequestsPage({ session }: Props) {
  const { profile } = useProfile(session);
  const [rows, setRows] = useState<QuoteRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [visibleStatuses, setVisibleStatuses] = useState<Set<QuoteStatusFilter>>(
    () => new Set(['draft', 'sent', 'ordered']),
  );
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);

  useEffect(() => {
    void loadRows();
  }, [session.user.id]);

  async function loadRows() {
    setLoading(true);
    const { data, error } = await supabase
      .from('quote_requests')
      .select(`
        id, title, status, data, updated_at, created_at, work_report_id,
        customer_id, equipment_id, owner_company_id, branding_company_id, created_by_company_id,
        customers(name, address, postal_code, city),
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

  function canDeleteQuote(row: QuoteRequestRow): boolean {
    return canDeleteQuoteRequest(
      row,
      profile?.company_id,
      profile?.role,
      profile?.is_global_admin,
    );
  }

  async function deleteQuote(row: QuoteRequestRow) {
    if (!canDeleteQuote(row)) return;
    const confirmMessage =
      row.status === 'sent'
        ? 'Poistetaanko lähetetty tarjouspyyntö pysyvästi? Tätä toimintoa ei voi perua.'
        : 'Poistetaanko tarjouspyynnön luonnos pysyvästi? Tätä toimintoa ei voi perua.';
    if (!window.confirm(confirmMessage)) {
      return;
    }
    setDeletingDraftId(row.id);
    const { error } = await deleteQuoteRequestById(supabase, row.id);
    setDeletingDraftId(null);
    if (error) {
      console.error(error);
      window.alert(error.message);
      return;
    }
    clearLocalQuoteDraft(localQuoteDraftKey(row.id, session.user.id));
    setRows((prev) => prev.filter((entry) => entry.id !== row.id));
  }

  function toggleStatus(status: QuoteStatusFilter) {
    setVisibleStatuses((current) => {
      const next = new Set(current);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => quoteSearchText(row).includes(query));
  }, [rows, search]);

  const grouped = useMemo(() => {
    const drafts = filtered.filter((row) => row.status === 'draft');
    const ordered = filtered.filter((row) => row.status === 'ordered');
    const sent = filtered.filter((row) => row.status === 'sent');
    return { drafts, sent, ordered };
  }, [filtered]);

  const statusCounts = useMemo(
    () => ({
      draft: grouped.drafts.length,
      sent: grouped.sent.length,
      ordered: grouped.ordered.length,
    }),
    [grouped],
  );

  const visibleRows = useMemo(() => {
    return filtered.filter((row) => visibleStatuses.has(row.status as QuoteStatusFilter));
  }, [filtered, visibleStatuses]);

  const sections = useMemo(() => {
    const items: Array<{ key: QuoteStatusFilter; title: string; rows: QuoteRequestRow[] }> = [];
    if (visibleStatuses.has('draft') && grouped.drafts.length > 0) {
      items.push({ key: 'draft', title: `Luonnokset (${grouped.drafts.length})`, rows: grouped.drafts });
    }
    if (visibleStatuses.has('sent') && grouped.sent.length > 0) {
      items.push({
        key: 'sent',
        title: `Lähetetyt — ei vielä tilattu (${grouped.sent.length})`,
        rows: grouped.sent,
      });
    }
    if (visibleStatuses.has('ordered') && grouped.ordered.length > 0) {
      items.push({ key: 'ordered', title: `Tilatut (${grouped.ordered.length})`, rows: grouped.ordered });
    }
    return items;
  }, [grouped, visibleStatuses]);

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
          <Link to="/tarjouspyynnot/yhteenveto" className="btn btn-secondary">
            Yhteenveto
          </Link>
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

      {!loading && rows.length > 0 && (
        <div className="quote-request-status-filters" role="group" aria-label="Näytettävät tilat">
          {STATUS_FILTER_OPTIONS.map((option) => {
            const active = visibleStatuses.has(option.id);
            const count = statusCounts[option.id];
            return (
              <button
                key={option.id}
                type="button"
                className={`btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}`}
                aria-pressed={active}
                onClick={() => toggleStatus(option.id)}
              >
                {option.label} ({count})
              </button>
            );
          })}
        </div>
      )}

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
      ) : visibleRows.length === 0 ? (
        <section className="panel">
          <p>Valitse vähintään yksi tila suodattimesta.</p>
        </section>
      ) : (
        sections.map((section) => (
          <section key={section.key} className="panel">
            <h2>{section.title}</h2>
            <QuoteRequestGrid
              rows={section.rows}
              canDelete={canDeleteQuote}
              deletingDraftId={deletingDraftId}
              onDelete={(row) => void deleteQuote(row)}
            />
          </section>
        ))
      )}
    </AppLayout>
  );
}
