import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { useProfile } from '../hooks/useProfile';
import { supabase } from '../lib/supabase';
import {
  ensureCompanyToolsBookingToken,
  fetchCompanyToolBookings,
  toolsBookingStaffPath,
  toolsBookingUrl,
  updateToolBookingStatus,
} from '../lib/toolBookingShares';
import {
  buildMonthGrid,
  dateYmdOverlapsBusy,
  formatLoanRangeFi,
  formatToolEuro,
  loanEffectiveEnd,
  shiftMonth,
} from '../lib/toolInventory';
import {
  TOOL_BOOKING_DELIVERY_LABELS,
  TOOL_BOOKING_STATUS_LABELS,
  TOOL_STATUS_LABELS,
  type Tool,
  type ToolBooking,
  type ToolLoan,
} from '../types/inventory';

interface Props {
  session: Session;
}

const WEEKDAYS = ['Ma', 'Ti', 'Ke', 'To', 'Pe', 'La', 'Su'];

const TOOL_SELECT = `
  id, company_id, tag_id, serial_number, name, category, status, assigned_user_id,
  is_loanable, rate_day_eur, rate_weekend_eur, rate_week_eur, rate_month_eur,
  created_at, updated_at
`;

const LOAN_SELECT = `
  id, tool_id, user_id, work_report_id, loaned_at, returned_at, expected_return_at, notes,
  user:profiles!tool_loans_user_id_fkey(display_name, email),
  tool:tools!tool_loans_tool_id_fkey(name, tag_id, serial_number)
`;

export default function ToolBookingCalendarPage({ session }: Props) {
  const { profile } = useProfile(session);
  const [tools, setTools] = useState<Tool[]>([]);
  const [loans, setLoans] = useState<ToolLoan[]>([]);
  const [bookings, setBookings] = useState<ToolBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filterToolId, setFilterToolId] = useState('');
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), monthIndex0: now.getMonth() };
  });

  useEffect(() => {
    if (profile?.company_id) void load();
  }, [profile?.company_id]);

  async function load() {
    if (!profile?.company_id) return;
    setLoading(true);
    setError(null);
    try {
      const [{ data: toolRows, error: toolError }, { data: loanRows }, bookingRows, token] =
        await Promise.all([
          supabase
            .from('tools')
            .select(TOOL_SELECT)
            .eq('company_id', profile.company_id)
            .eq('is_loanable', true)
            .neq('status', 'retired')
            .order('name'),
          supabase
            .from('tool_loans')
            .select(LOAN_SELECT)
            .is('returned_at', null)
            .order('loaned_at', { ascending: false })
            .limit(500),
          fetchCompanyToolBookings(profile.company_id),
          ensureCompanyToolsBookingToken().catch(() => null),
        ]);
      if (toolError) throw new Error(toolError.message);
      setTools((toolRows as unknown as Tool[]) ?? []);
      setLoans((loanRows as unknown as ToolLoan[]) ?? []);
      setBookings(bookingRows);
      if (token) setPublicUrl(toolsBookingUrl(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lataus epäonnistui');
    } finally {
      setLoading(false);
    }
  }

  const busyRanges = useMemo(() => {
    const fromLoans = loans.map((l) => ({
      tool_id: l.tool_id,
      starts_at: l.loaned_at,
      ends_at: loanEffectiveEnd(l),
      source: 'loan',
      status: 'active',
    }));
    const fromBookings = bookings
      .filter((b) => b.status === 'pending' || b.status === 'confirmed')
      .map((b) => ({
        tool_id: b.tool_id,
        starts_at: b.starts_at,
        ends_at: b.ends_at,
        source: 'booking',
        status: b.status,
      }));
    return [...fromLoans, ...fromBookings];
  }, [loans, bookings]);

  const filteredBusy = useMemo(
    () => (filterToolId ? busyRanges.filter((b) => b.tool_id === filterToolId) : busyRanges),
    [busyRanges, filterToolId],
  );

  const grid = useMemo(
    () => buildMonthGrid(cursor.year, cursor.monthIndex0),
    [cursor.year, cursor.monthIndex0],
  );

  const monthLabel = useMemo(
    () =>
      new Date(cursor.year, cursor.monthIndex0, 1).toLocaleDateString('fi-FI', {
        month: 'long',
        year: 'numeric',
      }),
    [cursor.year, cursor.monthIndex0],
  );

  const pending = bookings.filter((b) => b.status === 'pending');

  async function copyLink() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setMessage('Ulkoinen varauslinkki kopioitu.');
    } catch {
      setError('Kopiointi epäonnistui.');
    }
  }

  async function setStatus(id: string, status: 'confirmed' | 'cancelled') {
    setBusy(true);
    setError(null);
    try {
      await updateToolBookingStatus(id, status);
      setMessage(status === 'confirmed' ? 'Varaus vahvistettu.' : 'Varaus peruttu.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Päivitys epäonnistui');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppLayout session={session}>
      <div className="page-header">
        <div>
          <p className="breadcrumb">
            <Link to="/">Etusivu</Link> / <Link to="/tyokalut">Työkalut</Link> / Varauskalenteri
          </p>
          <h1>Varauskalenteri</h1>
          <p className="muted">Lainattavat työkalut, lainat ja ulkoiset varaukset samassa näkymässä.</p>
        </div>
        <div className="page-header-actions" style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <Link to="/tyokalut" className="btn btn-secondary btn-sm">
            ← Työkalut
          </Link>
          <button type="button" className="btn btn-primary btn-sm" disabled={!publicUrl} onClick={() => void copyLink()}>
            Kopioi ulkoinen linkki
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {message && <p className="muted">{message}</p>}

      {publicUrl && (
        <section className="panel tool-booking-link-panel">
          <h2 style={{ marginTop: 0 }}>Ulkoinen varauslinkki</h2>
          <p className="muted" style={{ margin: '0 0 .5rem' }}>
            Jaa linkki asiakkaille — he näkevät vain lainattavat työkalut ja voivat lähettää varauspyynnön.
          </p>
          <div className="tool-booking-link-row">
            <input readOnly value={publicUrl} className="tool-booking-link-input" onFocus={(e) => e.target.select()} />
            <a className="btn btn-secondary btn-sm" href={publicUrl} target="_blank" rel="noreferrer">
              Avaa
            </a>
          </div>
        </section>
      )}

      {loading ? (
        <section className="panel">Ladataan…</section>
      ) : (
        <>
          <section className="panel">
            <div className="tool-booking-cal-nav">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setCursor((c) => shiftMonth(c.year, c.monthIndex0, -1))}
              >
                ←
              </button>
              <h2 style={{ margin: 0, textTransform: 'capitalize', fontSize: '1.1rem' }}>{monthLabel}</h2>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setCursor((c) => shiftMonth(c.year, c.monthIndex0, 1))}
              >
                →
              </button>
            </div>
            <label style={{ display: 'block', margin: '0.65rem 0' }}>
              Suodata työkalu
              <select value={filterToolId} onChange={(e) => setFilterToolId(e.target.value)}>
                <option value="">Kaikki lainattavat</option>
                {tools.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="tool-booking-cal-weekdays">
              {WEEKDAYS.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="tool-booking-cal-grid">
              {grid.map((cell) => {
                const busyDay = dateYmdOverlapsBusy(cell.ymd, filteredBusy);
                return (
                  <div
                    key={cell.ymd}
                    className={`tool-booking-cal-day ${cell.inMonth ? '' : 'is-outside'} ${
                      busyDay ? 'is-busy' : 'is-free'
                    }`}
                  >
                    <span className="tool-booking-cal-day-num">{cell.date.getDate()}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="panel">
            <h2>Lainattavat työkalut ({tools.length})</h2>
            {tools.length === 0 ? (
              <p className="muted">Ei lainattavia työkaluja. Merkitse työkalu lainattavaksi Työkalut-sivulla.</p>
            ) : (
              <ul className="tool-card-grid">
                {tools.map((tool) => (
                  <li key={tool.id} className="tool-card">
                    <div className="tool-card-body">
                      <strong>{tool.name}</strong>
                      <p className="muted" style={{ margin: '.25rem 0 0' }}>
                        {TOOL_STATUS_LABELS[tool.status] ?? tool.status}
                        {tool.serial_number ? ` · SN ${tool.serial_number}` : ''}
                      </p>
                      {tool.rate_day_eur != null && (
                        <p style={{ margin: '.35rem 0 0' }}>{formatToolEuro(tool.rate_day_eur)}/pv</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <h2>Odottavat varaukset ({pending.length})</h2>
            {pending.length === 0 ? (
              <p className="muted">Ei odottavia varauksia.</p>
            ) : (
              <ul className="daily-log-list">
                {pending.map((b) => (
                  <li key={b.id} className="panel" style={{ marginBottom: '.65rem', padding: '.75rem' }}>
                    <strong>{b.tool?.name ?? 'Työkalu'}</strong>
                    <p className="muted" style={{ margin: '.25rem 0' }}>
                      {formatLoanRangeFi(b.starts_at, b.ends_at)} · {b.guest_name}
                      {b.guest_phone ? ` · ${b.guest_phone}` : ''}
                      {b.guest_email ? ` · ${b.guest_email}` : ''}
                    </p>
                    <p style={{ margin: '0 0 .5rem' }}>
                      <span className="badge badge-scheduled">{TOOL_BOOKING_STATUS_LABELS[b.status]}</span>{' '}
                      <span className="badge">{TOOL_BOOKING_DELIVERY_LABELS[b.delivery_mode]}</span>
                      {b.delivery_fee_eur != null && (
                        <span className="badge">Kuljetus {formatToolEuro(b.delivery_fee_eur)}</span>
                      )}
                    </p>
                    <div className="form-actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={busy}
                        onClick={() => void setStatus(b.id, 'confirmed')}
                      >
                        Vahvista
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={busy}
                        onClick={() => void setStatus(b.id, 'cancelled')}
                      >
                        Peruuta
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <h2>Kaikki varaukset</h2>
            {bookings.length === 0 ? (
              <p className="muted">Ei varauksia vielä. Julkinen linkki: {toolsBookingStaffPath()}</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {bookings.slice(0, 40).map((b) => (
                  <li key={b.id} style={{ marginBottom: '.35rem' }}>
                    <strong>{b.tool?.name ?? '—'}</strong> · {formatLoanRangeFi(b.starts_at, b.ends_at)} ·{' '}
                    {b.guest_name} · {TOOL_BOOKING_STATUS_LABELS[b.status]}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </AppLayout>
  );
}
