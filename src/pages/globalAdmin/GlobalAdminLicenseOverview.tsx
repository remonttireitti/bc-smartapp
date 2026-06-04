import { useEffect, useState } from 'react';
import {
  formatLicensePeriodMoney,
  LICENSE_PAYMENT_STATUS_LABELS,
  parseLicenseOverviewRows,
  type LicenseOverviewRow,
} from '../../lib/companyLicense';
import { supabase } from '../../lib/supabase';

function formatDateFi(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fi-FI');
}

function statusLabel(row: LicenseOverviewRow) {
  const { snapshot } = row;
  if (snapshot.enrollment === 'legacy') return 'Legacy (kaikki)';
  if (snapshot.effective_status === 'pending_trial') return 'Odottaa kirjautumista';
  if (snapshot.effective_status === 'trial') return 'Kokeilu';
  if (snapshot.effective_status === 'active') return 'Aktiivinen';
  if (snapshot.payment_status === 'awaiting_payment') return 'Tilaus · odottaa maksua';
  return 'Päättynyt';
}

function modulesSummary(row: LicenseOverviewRow) {
  const { snapshot } = row;
  if (snapshot.order) {
    const parts: string[] = [];
    if (snapshot.order.base_active) parts.push('Perus');
    for (const key of ['quotes', 'billing', 'remote_monitoring', 'tools'] as const) {
      if (snapshot.order.modules[key]) {
        parts.push(key === 'remote_monitoring' ? 'Etä' : key.slice(0, 4));
      }
    }
    return parts.length ? `Tilaus: ${parts.join(', ')}` : 'Tilaus';
  }
  if (snapshot.effective_status === 'trial' || snapshot.effective_status === 'pending_trial') {
    return 'Kaikki kokeilussa';
  }
  const parts: string[] = [];
  if (snapshot.base_active) parts.push('Perus');
  if (snapshot.modules.quotes) parts.push('Tarj.');
  if (snapshot.modules.billing) parts.push('Lask.');
  if (snapshot.modules.remote_monitoring) parts.push('Etä');
  if (snapshot.modules.tools) parts.push('Työkalut');
  return parts.length ? parts.join(', ') : '—';
}

type Props = {
  onSelectCompany?: (companyId: string) => void;
};

export default function GlobalAdminLicenseOverview({ onSelectCompany }: Props) {
  const [rows, setRows] = useState<LicenseOverviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error: loadError } = await supabase.rpc('global_admin_license_overview');
    setLoading(false);
    if (loadError) {
      setError(loadError.message);
      return;
    }
    setRows(parseLicenseOverviewRows(data));
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="card global-admin-block">
      <div className="global-admin-block-head">
        <h2>Yritysten tilauskatsaus</h2>
        <button type="button" className="btn btn-secondary btn-sm" disabled={loading} onClick={() => void load()}>
          {loading ? 'Päivitetään…' : 'Päivitä'}
        </button>
      </div>
      <p className="muted">Kaikki yritykset: kokeilu, tilaus, maksu ja aktiiviset moduulit.</p>

      {error && <p className="error">{error}</p>}

      {loading && rows.length === 0 ? (
        <p className="muted">Ladataan…</p>
      ) : (
        <div className="table-wrap global-admin-overview-wrap">
          <table className="data-table global-admin-overview-table">
            <thead>
              <tr>
                <th>Yritys</th>
                <th>Tila</th>
                <th>Moduulit / tilaus</th>
                <th>Laskutus</th>
                <th>Maksu</th>
                <th>Summa</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const { snapshot } = row;
                const isLegacy = snapshot.enrollment === 'legacy';
                const price = snapshot.order
                  ? formatLicensePeriodMoney(
                      snapshot.order.estimated_period_eur,
                      snapshot.order.billing_interval,
                    )
                  : snapshot.effective_status === 'active'
                    ? formatLicensePeriodMoney(
                        snapshot.pricing.estimated_period_total_eur,
                        snapshot.billing_interval,
                      )
                    : '—';

                return (
                  <tr key={row.company_id}>
                    <td data-label="Yritys">
                      <strong>{row.company_name}</strong>
                      {row.company_slug && <span className="muted global-admin-slug">{row.company_slug}</span>}
                    </td>
                    <td data-label="Tila">
                      {statusLabel(row)}
                      {snapshot.effective_status === 'trial' && snapshot.trial_ends_at && (
                        <span className="muted global-admin-sub"> · {formatDateFi(snapshot.trial_ends_at)}</span>
                      )}
                    </td>
                    <td data-label="Moduulit">{modulesSummary(row)}</td>
                    <td data-label="Laskutus">{isLegacy ? '—' : snapshot.billing_interval_label}</td>
                    <td data-label="Maksu">{isLegacy ? '—' : (LICENSE_PAYMENT_STATUS_LABELS[snapshot.payment_status] ?? snapshot.payment_status)}</td>
                    <td data-label="Summa">{isLegacy ? '—' : price}</td>
                    <td data-label="">
                      {onSelectCompany && !isLegacy && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => onSelectCompany(row.company_id)}
                        >
                          Avaa
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
