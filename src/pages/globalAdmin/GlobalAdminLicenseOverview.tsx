import { useEffect, useState } from 'react';
import {
  formatLicensePeriodMoney,
  formatStoredModulesSummary,
  LICENSE_PAYMENT_STATUS_LABELS,
  licenseOverviewEnrollmentLabel,
  licenseOverviewLoginSummary,
  licenseOverviewTrialSummary,
  parseLicenseOverviewRows,
  trialDaysRemaining,
  type LicenseOverviewRow,
} from '../../lib/companyLicense';
import { LicenseSectionHeading } from '../../components/LicenseTermsHelp';
import { LICENSE_SECTION_TITLES } from '../../lib/licenseTermsFi';
import { supabase } from '../../lib/supabase';

function formatDateFi(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fi-FI');
}

function statusLabel(row: LicenseOverviewRow) {
  const { snapshot } = row;
  if (snapshot.enrollment === 'legacy') return 'Vanha sopimus';
  if (snapshot.effective_status === 'pending_trial') return 'Odottaa kokeilua';
  if (snapshot.effective_status === 'trial') return 'Kokeilujakso';
  if (snapshot.effective_status === 'active') return 'Maksava';
  if (snapshot.payment_status === 'awaiting_payment') return 'Odottaa maksua';
  return 'Ei aktiivinen';
}

type Props = {
  onSelectCompany?: (companyId: string) => void;
  onExtendTrial?: (companyId: string, days: number) => Promise<void>;
  extendTrialBusyId?: string | null;
};

export default function GlobalAdminLicenseOverview({
  onSelectCompany,
  onExtendTrial,
  extendTrialBusyId,
}: Props) {
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

  const legacyCount = rows.filter((r) => r.snapshot.enrollment === 'legacy').length;
  const subscriptionCount = rows.length - legacyCount;

  return (
    <section className="card global-admin-block">
      <div className="global-admin-block-head">
        <h2>
          <LicenseSectionHeading title={LICENSE_SECTION_TITLES.adminOverview} helpVariant="adminOverview" />
        </h2>
        <button type="button" className="btn btn-secondary btn-sm" disabled={loading} onClick={() => void load()}>
          {loading ? 'Päivitetään…' : 'Päivitä'}
        </button>
      </div>

      <p className="muted global-admin-license-summary">
        Vanhaa sopimusta {legacyCount}, tilaus-/kokeilumallia {subscriptionCount}. Tarkemmat selitteet info-ikonista
        otsikon vieressä.
      </p>

      {error && <p className="error">{error}</p>}

      {loading && rows.length === 0 ? (
        <p className="muted">Ladataan…</p>
      ) : (
        <div className="table-wrap global-admin-overview-wrap">
          <table className="data-table global-admin-overview-table global-admin-license-table">
            <thead>
              <tr>
                <th>Yritys</th>
                <th>Malli</th>
                <th>Tila</th>
                <th>Kirjautuminen</th>
                <th>Kokeilu / maksu</th>
                <th>Moduulit (hallinta)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const { snapshot } = row;
                const isLegacy = snapshot.enrollment === 'legacy';
                const canExtendTrial =
                  !isLegacy &&
                  (snapshot.effective_status === 'trial' ||
                    snapshot.effective_status === 'expired' ||
                    snapshot.effective_status === 'pending_trial');
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
                    : null;

                return (
                  <tr key={row.company_id}>
                    <td data-label="Yritys">
                      <strong>{row.company_name}</strong>
                      {row.company_slug && (
                        <span className="muted global-admin-slug">{row.company_slug}</span>
                      )}
                      <span className="muted global-admin-sub">
                        {row.user_count === 1
                          ? '1 sisäinen käyttäjä'
                          : `${row.user_count} sisäistä käyttäjää`}
                        {row.account_count > row.user_count
                          ? ` (${row.account_count} tiliä yhteensä)`
                          : ''}
                        {row.company_created_at
                          ? ` · luotu ${formatDateFi(row.company_created_at)}`
                          : ''}
                      </span>
                    </td>
                    <td data-label="Malli">
                      <span
                        className={
                          isLegacy
                            ? 'global-admin-badge global-admin-badge--legacy'
                            : 'global-admin-badge global-admin-badge--subscription'
                        }
                      >
                        {licenseOverviewEnrollmentLabel(snapshot.enrollment)}
                      </span>
                    </td>
                    <td data-label="Tila">
                      {statusLabel(row)}
                      {snapshot.effective_status === 'trial' && snapshot.trial_ends_at && (
                        <span className="muted global-admin-sub">
                          {' '}
                          · {formatDateFi(snapshot.trial_ends_at)}
                          {trialDaysRemaining(snapshot) != null &&
                            ` (${trialDaysRemaining(snapshot)} pv)`}
                        </span>
                      )}
                      {!isLegacy && snapshot.payment_status !== 'none' && (
                        <span className="muted global-admin-sub">
                          {' '}
                          · {LICENSE_PAYMENT_STATUS_LABELS[snapshot.payment_status]}
                        </span>
                      )}
                    </td>
                    <td data-label="Kirjautuminen">{licenseOverviewLoginSummary(row)}</td>
                    <td data-label="Kokeilu">
                      {licenseOverviewTrialSummary(row)}
                      {price && (
                        <span className="muted global-admin-sub"> · {price}</span>
                      )}
                    </td>
                    <td data-label="Moduulit">
                      {formatStoredModulesSummary(row.license_settings, snapshot)}
                    </td>
                    <td data-label="" className="global-admin-license-actions">
                      {onSelectCompany && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => onSelectCompany(row.company_id)}
                        >
                          Hallinta
                        </button>
                      )}
                      {onExtendTrial && canExtendTrial && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={extendTrialBusyId === row.company_id}
                          onClick={() => void onExtendTrial(row.company_id, 30)}
                        >
                          {extendTrialBusyId === row.company_id ? '…' : '+30 pv kokeilu'}
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
