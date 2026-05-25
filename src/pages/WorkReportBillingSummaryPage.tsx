import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  aggregateBillableByUser,
  formatEuro,
  type BillableCalculation,
} from '../lib/workReportBilling';
import type { Profile } from '../types';

type Context = { profile: Profile; session: Session };

type BillableRow = {
  work_report_id: string;
  partner_total: number;
  calculation: BillableCalculation;
  work_reports: {
    id: string;
    title: string;
    owner_company_id: string;
    created_at: string;
    owner_company: { name: string } | null;
  };
};

export default function WorkReportBillingSummaryPage() {
  const { profile } = useOutletContext<Context>();
  const [rows, setRows] = useState<BillableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (profile.company_id) void loadRows();
  }, [profile.company_id, fromDate, toDate]);

  async function loadRows() {
    setLoading(true);
    setError(null);

    const { data, error: loadError } = await supabase
      .from('work_report_billable')
      .select(`
        work_report_id, partner_total, calculation,
        work_reports!inner(
          id, title, owner_company_id, created_at, created_by_company_id,
          owner_company:companies!work_reports_owner_company_id_fkey(name)
        )
      `)
      .eq('work_reports.created_by_company_id', profile.company_id!)
      .neq('work_reports.owner_company_id', profile.company_id!)
      .gte('work_reports.created_at', `${fromDate}T00:00:00`)
      .lte('work_reports.created_at', `${toDate}T23:59:59`);

    if (loadError) {
      setError(loadError.message);
      setRows([]);
    } else {
      setRows((data as unknown as BillableRow[]) ?? []);
    }
    setLoading(false);
  }

  const aggregate = useMemo(
    () =>
      aggregateBillableByUser(
        rows.map((r) => ({
          reportId: r.work_report_id,
          reportTitle: r.work_reports.title,
          calculation: r.calculation,
        })),
      ),
    [rows],
  );

  const byPartner = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number }>();
    for (const row of rows) {
      const id = row.work_reports.owner_company_id;
      const name = row.work_reports.owner_company?.name ?? '—';
      const prev = map.get(id) ?? { name, total: 0, count: 0 };
      prev.total += Number(row.partner_total);
      prev.count += 1;
      map.set(id, prev);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'fi'));
  }, [rows]);

  return (
    <>
      <section className="panel">
        <h2>Kumppanilaskutus — yhteenveto</h2>
        <p className="muted">
          Näyttää mitä yrityksesi laskuttaa kumppaneilta työraporttien perusteella. Vain ylläpitäjä näkee
          kaikkien käyttäjien yhteenlasketun summan.
        </p>
        <div className="line-form-grid" style={{ maxWidth: '32rem' }}>
          <label>
            Alkaen
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </label>
          <label>
            Päättyen
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </label>
        </div>
      </section>

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p className="muted">Ladataan…</p>
      ) : (
        <>
          <section className="panel">
            <h3>Yhteensä henkilöittäin</h3>
            {aggregate.users.length === 0 ? (
              <p className="muted">Ei laskutettavia kumppanityöraportteja valitulla aikavälillä.</p>
            ) : (
              <>
                <table className="billing-table">
                  <thead>
                    <tr>
                      <th>Henkilö</th>
                      <th className="num">Raportteja</th>
                      <th className="num">Yhteensä</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aggregate.users.map((u) => (
                      <tr key={u.aggregateKey}>
                        <td>{u.userName}</td>
                        <td className="num">{u.reportCount}</td>
                        <td className="num">{formatEuro(u.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2}><strong>Kaikki yhteensä</strong></td>
                      <td className="num"><strong>{formatEuro(aggregate.grandTotal)}</strong></td>
                    </tr>
                  </tfoot>
                </table>
              </>
            )}
          </section>

          <section className="panel">
            <h3>Kumppaneittain</h3>
            {byPartner.length === 0 ? (
              <p className="muted">—</p>
            ) : (
              <table className="billing-table">
                <thead>
                  <tr>
                    <th>Kumppani (laskutettava)</th>
                    <th className="num">Raportteja</th>
                    <th className="num">Yhteensä</th>
                  </tr>
                </thead>
                <tbody>
                  {byPartner.map((p) => (
                    <tr key={p.name}>
                      <td>{p.name}</td>
                      <td className="num">{p.count}</td>
                      <td className="num">{formatEuro(p.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="panel">
            <h3>Raportit</h3>
            {rows.length === 0 ? (
              <p className="muted">—</p>
            ) : (
              <ul className="report-list">
                {rows.map((r) => (
                  <li key={r.work_report_id}>
                    <Link to={`/tyoraportit/${r.work_report_id}`} className="report-link">
                      <div className="report-link-main">
                        <strong>{r.work_reports.title}</strong>
                        <span className="muted">{r.work_reports.owner_company?.name ?? '—'}</span>
                      </div>
                      <span>{formatEuro(Number(r.partner_total))}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
