import { useMemo, useState } from 'react';
import { formatEuro } from '../lib/workReportBilling';
import type { BillingListRow, BillingModuleMode } from '../lib/workReportBillingCopy';
import {
  STATS_PERIOD_LABELS,
  collectBillingStatsEntries,
  formatPercent,
  statsPeriodRange,
  summarizeBillingStats,
  withVat,
  type StatsBasis,
  type StatsPeriodKey,
} from '../lib/billingStats';
import { toLocalYmd } from '../types';
import './BillingStatsPanel.css';

interface Props {
  rows: BillingListRow[];
  viewerCompanyId: string | null | undefined;
  pageMode: BillingModuleMode;
  partnershipsEnabled: boolean;
  loading: boolean;
}

const PERIODS: StatsPeriodKey[] = ['this_month', 'prev_month', 'last_3', 'this_year', 'custom'];
const BASES: Array<{ key: StatsBasis; label: string }> = [
  { key: 'billed', label: 'Laskutettu' },
  { key: 'open', label: 'Laskuttamatta' },
  { key: 'all', label: 'Molemmat' },
];

function ShareBar({ percent }: { percent: number }) {
  return (
    <div className="billing-stats-share" aria-hidden="true">
      <span style={{ width: `${Math.min(100, percent)}%` }} />
    </div>
  );
}

export default function BillingStatsPanel({ rows, viewerCompanyId, pageMode, partnershipsEnabled, loading }: Props) {
  const [period, setPeriod] = useState<StatsPeriodKey>('this_month');
  const [basis, setBasis] = useState<StatsBasis>('billed');
  const [customFrom, setCustomFrom] = useState(() => toLocalYmd(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [customTo, setCustomTo] = useState(() => toLocalYmd(new Date()));

  const entries = useMemo(
    () => collectBillingStatsEntries(rows, viewerCompanyId, pageMode),
    [rows, viewerCompanyId, pageMode],
  );
  const range = useMemo(() => statsPeriodRange(period, new Date(), customFrom, customTo), [period, customFrom, customTo]);
  const stats = useMemo(() => (range ? summarizeBillingStats(entries, range, basis) : null), [entries, range, basis]);
  const maxMonth = useMemo(
    () => Math.max(0, ...(stats?.months ?? []).map((m) => m.billed + m.open)),
    [stats],
  );
  const showPartners = partnershipsEnabled && !!stats && stats.byPartner.length > 0;
  const basisLabel = BASES.find((b) => b.key === basis)!.label.toLowerCase();

  return (
    <section className="billing-stats">
      <div className="billing-stats-controls">
        <div className="billing-filter-pills">
          {PERIODS.map((key) => (
            <button
              key={key}
              type="button"
              className={period === key ? 'billing-pill active' : 'billing-pill'}
              onClick={() => setPeriod(key)}
            >
              {STATS_PERIOD_LABELS[key]}
            </button>
          ))}
        </div>
        <div className="billing-filter-pills">
          {BASES.map((b) => (
            <button
              key={b.key}
              type="button"
              className={basis === b.key ? 'billing-pill active' : 'billing-pill'}
              onClick={() => setBasis(b.key)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
      {period === 'custom' && (
        <div className="billing-stats-range">
          <label>
            Alku
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          </label>
          <label>
            Loppu
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </label>
        </div>
      )}

      {loading ? (
        <p className="muted panel">Ladataan…</p>
      ) : !stats ? (
        <p className="muted panel">Valitse aikaväli.</p>
      ) : (
        <>
          <div className="billing-summary-grid">
            <article className="billing-stat-card billing-stat-billed">
              <span className="billing-stat-label">Laskutettu alv 0 %</span>
              <strong className="billing-stat-value">{formatEuro(stats.billed)}</strong>
              <p className="billing-stat-meta">alv 25,5 %: {formatEuro(withVat(stats.billed))}</p>
              <span className="billing-stat-count">{stats.billedCount} raporttia</span>
            </article>
            <article className="billing-stat-card billing-stat-open">
              <span className="billing-stat-label">Laskuttamatta alv 0 %</span>
              <strong className="billing-stat-value">{formatEuro(stats.open)}</strong>
              <p className="billing-stat-meta">alv 25,5 %: {formatEuro(withVat(stats.open))}</p>
              <span className="billing-stat-count">{stats.openCount} raporttia</span>
            </article>
            {partnershipsEnabled && stats.incoming > 0.005 ? (
              <article className="billing-stat-card billing-stat-total">
                <span className="billing-stat-label">Kumppanit laskuttivat meiltä</span>
                <strong className="billing-stat-value">{formatEuro(stats.incoming)}</strong>
                <span className="billing-stat-count">{stats.incomingCount} raporttia</span>
              </article>
            ) : null}
          </div>

          <div className="billing-stats-tables">
            <div className="panel">
              <h3>Keneltä ({basisLabel})</h3>
              {stats.byCounterparty.length === 0 ? (
                <p className="muted">—</p>
              ) : (
                <table className="billing-table">
                  <tbody>
                    {stats.byCounterparty.map((r) => (
                      <tr key={r.key}>
                        <td>
                          {r.name}
                          {r.isPartner ? <span className="billing-stats-tag">kumppani</span> : null}
                        </td>
                        <td className="num">{formatEuro(r.amount)}</td>
                        <td className="num">{formatPercent(r.percent)}</td>
                        <td className="billing-stats-bar-cell"><ShareBar percent={r.percent} /></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td><strong>Yhteensä</strong></td>
                      <td className="num"><strong>{formatEuro(stats.basisTotal)}</strong></td>
                      <td className="num">100,0 %</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            <div className="panel">
              <h3>Tyypeittäin ({basisLabel})</h3>
              {stats.byCategory.length === 0 ? (
                <p className="muted">—</p>
              ) : (
                <table className="billing-table">
                  <tbody>
                    {stats.byCategory.map((r) => (
                      <tr key={r.key}>
                        <td>{r.label}</td>
                        <td className="num">{formatEuro(r.amount)}</td>
                        <td className="num">{formatPercent(r.percent)}</td>
                        <td className="billing-stats-bar-cell"><ShareBar percent={r.percent} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {showPartners ? (
              <div className="panel">
                <h3>Kumppaneittain ({basisLabel})</h3>
                <table className="billing-table">
                  <thead>
                    <tr>
                      <th>Kumppani</th>
                      <th className="num">Me → kumppani</th>
                      <th className="num">Kumppani → me</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.byPartner.map((p) => (
                      <tr key={p.key}>
                        <td>{p.name}</td>
                        <td className="num">
                          {p.outAmount > 0.005 ? `${formatEuro(p.outAmount)} · ${formatPercent(p.outPercent)}` : '—'}
                        </td>
                        <td className="num">
                          {p.inAmount > 0.005 ? `${formatEuro(p.inAmount)} · ${formatPercent(p.inPercent)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>

          <div className="panel">
            <h3 style={{ margin: 0, fontSize: '.95rem' }}>Kuukausittain</h3>
            <div className="billing-stats-trend">
              {stats.months.map((m) => {
                const total = m.billed + m.open;
                const height = maxMonth > 0 ? (total / maxMonth) * 100 : 0;
                return (
                  <div
                    key={m.key}
                    className="billing-stats-month"
                    title={`${m.label}: laskutettu ${formatEuro(m.billed)} · laskuttamatta ${formatEuro(m.open)}`}
                  >
                    <div className="billing-stats-month-area">
                      <div className="billing-stats-month-bar" style={{ height: `${height}%` }}>
                        <span className="billed" style={{ flexGrow: m.billed }} />
                        <span className="open" style={{ flexGrow: m.open }} />
                      </div>
                    </div>
                    <span className="billing-stats-month-label">{m.label}</span>
                  </div>
                );
              })}
            </div>
            <div className="billing-stats-legend">
              <span><i style={{ background: '#16a34a' }} />Laskutettu</span>
              <span><i style={{ background: '#fdba74' }} />Laskuttamatta</span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
