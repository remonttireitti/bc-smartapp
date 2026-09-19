import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { useProfile } from '../hooks/useProfile';
import { quoteListTrail } from '../lib/navigationTrail';
import {
  aggregateQuoteRequestStats,
  collectQuoteStatsOwnerCompanies,
  quoteStatsPeriodLabel,
  type QuoteStatsCompanyOption,
  type QuoteStatsCompanyRow,
  type QuoteStatsPeriod,
} from '../lib/quoteRequest/quoteRequestStats';
import type { QuoteRequestRow } from '../lib/quoteRequest/types';
import { supabase } from '../lib/supabase';
import { formatEuro } from '../lib/workReportBilling';

interface Props {
  session: Session;
}

function CompanyStatsTable({
  title,
  hint,
  rows,
}: {
  title: string;
  hint: string;
  rows: QuoteStatsCompanyRow[];
}) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      <p className="muted">{hint}</p>
      {rows.length === 0 ? (
        <p className="muted">Ei tarjouksia valitulla jaksolla.</p>
      ) : (
        <div className="table-wrap">
          <table className="billing-table quote-stats-table">
            <thead>
              <tr>
                <th>Yritys</th>
                <th className="num">Avoinna</th>
                <th className="num">Avoinna €</th>
                <th className="num">Tilattu</th>
                <th className="num">Tilattu €</th>
                <th className="num">Tarjottu €</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.companyId}>
                  <td>{row.companyName}</td>
                  <td className="num">{row.sentCount}</td>
                  <td className="num">{formatEuro(row.sentTotal)}</td>
                  <td className="num">{row.orderedCount}</td>
                  <td className="num">{formatEuro(row.orderedTotal)}</td>
                  <td className="num">
                    <strong>{formatEuro(row.sentTotal + row.orderedTotal)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function QuoteRequestStatsPage({ session }: Props) {
  const { profile } = useProfile(session);
  const [rows, setRows] = useState<QuoteRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<QuoteStatsPeriod>('this_month');
  const [disabledOwnerCompanyIds, setDisabledOwnerCompanyIds] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    void loadRows();
  }, [session.user.id]);

  async function loadRows() {
    setLoading(true);
    const { data, error } = await supabase
      .from('quote_requests')
      .select(`
        id, title, status, data, updated_at, created_at,
        owner_company_id, branding_company_id, created_by_company_id,
        owner_company:companies!quote_requests_owner_company_id_fkey(name),
        branding_company:companies!quote_requests_branding_company_id_fkey(name),
        created_by_company:companies!quote_requests_created_by_company_id_fkey(name)
      `)
      .in('status', ['sent', 'ordered'])
      .order('updated_at', { ascending: false });

    if (error) {
      console.error(error);
      setRows([]);
    } else {
      setRows((data as unknown as QuoteRequestRow[]) ?? []);
    }
    setLoading(false);
  }

  const ownerCompanies = useMemo(() => collectQuoteStatsOwnerCompanies(rows), [rows]);
  const filters = useMemo(
    () => ({ disabledOwnerCompanyIds }),
    [disabledOwnerCompanyIds],
  );
  const summary = useMemo(
    () => aggregateQuoteRequestStats(rows, period, undefined, filters),
    [rows, period, filters],
  );
  const listTrail = quoteListTrail();

  function toggleOwnerCompany(companyId: string) {
    setDisabledOwnerCompanyIds((current) => {
      const next = new Set(current);
      if (next.has(companyId)) next.delete(companyId);
      else next.add(companyId);
      return next;
    });
  }

  function renderCompanyFilterPills(
    label: string,
    companies: QuoteStatsCompanyOption[],
    disabledIds: Set<string>,
    onToggle: (companyId: string) => void,
  ) {
    if (companies.length === 0) return null;
    return (
      <div className="quote-stats-filter-group">
        <span className="quote-stats-filter-label muted">{label}</span>
        <div className="billing-filter-pills">
          {companies.map((company) => {
            const enabled = !disabledIds.has(company.id);
            return (
              <button
                key={company.id}
                type="button"
                className={enabled ? 'billing-pill active' : 'billing-pill'}
                aria-pressed={enabled}
                title={enabled ? 'Mukana yhteenvedossa' : 'Ei mukana yhteenvedossa'}
                onClick={() => onToggle(company.id)}
              >
                {company.name} ({company.count})
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <AppLayout session={session}>
      <div className="page-header">
        <div>
          <p className="breadcrumb">
            <Link to="/">Etusivu</Link> / <Link to="/tarjouspyynnot">Tarjouspyyntö</Link> / Yhteenveto
          </p>
          <h1>Tarjouspyyntöjen yhteenveto</h1>
          <p className="muted">
            {profile?.companies?.name ?? '—'} • tarjottu ja tilattu kenen piikkiin
          </p>
        </div>
        <div className="page-header-actions">
          <Link to={listTrail.backTo} className="btn btn-secondary">
            Tarjouslista
          </Link>
        </div>
      </div>

      <div className="billing-summary-header quote-stats-summary-header">
        <p className="billing-summary-period-label muted">
          Yhteenveto · {quoteStatsPeriodLabel(period).toLowerCase()}
        </p>
        <div className="quote-stats-toolbar">
          <div className="billing-summary-period-pills">
            {(['this_week', 'this_month', 'this_year'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={period === value ? 'billing-pill active' : 'billing-pill'}
                onClick={() => setPeriod(value)}
              >
                {quoteStatsPeriodLabel(value)}
              </button>
            ))}
          </div>
          {!loading
            ? renderCompanyFilterPills(
                'Yritykset',
                ownerCompanies,
                disabledOwnerCompanyIds,
                toggleOwnerCompany,
              )
            : null}
        </div>
      </div>

      {loading ? (
        <p className="muted">Ladataan…</p>
      ) : (
        <>
          <div className="billing-summary-grid">
            <article className="billing-stat-card billing-stat-total">
              <span className="billing-stat-label">Tarjottu</span>
              <strong className="billing-stat-value">{formatEuro(summary.totalAmount)}</strong>
              <span className="billing-stat-count">{summary.totalCount} kpl</span>
            </article>
            <article className="billing-stat-card billing-stat-billed">
              <span className="billing-stat-label">Tilattu</span>
              <strong className="billing-stat-value">{formatEuro(summary.orderedTotal)}</strong>
              <span className="billing-stat-count">{summary.orderedCount} kpl</span>
            </article>
            <article className="billing-stat-card billing-stat-open">
              <span className="billing-stat-label">Avoinna (lähetetty)</span>
              <strong className="billing-stat-value">{formatEuro(summary.sentTotal)}</strong>
              <span className="billing-stat-count">{summary.sentCount} kpl</span>
            </article>
            <article className="billing-stat-card">
              <span className="billing-stat-label">Tilausaste</span>
              <strong className="billing-stat-value">
                {summary.conversionRate != null ? `${summary.conversionRate} %` : '—'}
              </strong>
              <span className="billing-stat-count">
                {summary.totalCount > 0
                  ? `${summary.orderedCount} / ${summary.totalCount} tarjouksesta`
                  : 'tilattu / tarjottu'}
              </span>
            </article>
          </div>

          <CompanyStatsTable
            title="Kenen piikkiin tarjottu"
            hint="Rekisterin omistaja — kenen asiakasrekisterissä tarjous on tehty. Tarjottu € = avoinna + tilattu."
            rows={summary.byCompany}
          />
        </>
      )}
    </AppLayout>
  );
}
