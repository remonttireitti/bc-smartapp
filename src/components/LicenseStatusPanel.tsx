import { Link } from 'react-router-dom';
import { GLOBAL_ADMIN_SUPPORT } from '../lib/supportContacts';
import {
  formatLicenseMoney,
  LICENSE_MODULE_DESCRIPTIONS,
  LICENSE_MODULE_LABELS,
  trialDaysRemaining,
  type CompanyLicenseSnapshot,
  type LicenseModuleKey,
} from '../lib/companyLicense';

const ADDON_MODULES: Exclude<LicenseModuleKey, 'base'>[] = [
  'quotes',
  'billing',
  'remote_monitoring',
  'tools',
];

type Props = {
  license: CompanyLicenseSnapshot;
};

function formatDateFi(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fi-FI');
}

export default function LicenseStatusPanel({ license }: Props) {
  if (license.enrollment === 'legacy') return null;

  const daysLeft = trialDaysRemaining(license);
  const { pricing } = license;

  return (
    <section className="panel license-status-panel">
      <h2>Lisenssi ja tilaus</h2>

      {license.effective_status === 'pending_trial' && (
        <p className="license-status-lead">
          Kokeilujakso alkaa, kun yrityksen ensimmäinen käyttäjä kirjautuu sisään. Jakso on{' '}
          <strong>{license.trial_days} päivää</strong> ja sisältää kaikki moduulit.
        </p>
      )}

      {license.effective_status === 'trial' && (
        <p className="license-status-lead license-status-trial">
          Ilmainen kokeilujakso käynnissä —{' '}
          <strong>{daysLeft ?? 0} päivää jäljellä</strong> (päättyy {formatDateFi(license.trial_ends_at)}).
          Kaikki moduulit ovat käytössä kokeilun ajan.
        </p>
      )}

      {license.effective_status === 'expired' && (
        <p className="license-status-lead license-status-expired">
          Kokeilujakso on päättynyt ({formatDateFi(license.trial_ends_at)}). Sovellus vaatii tilauksen jatkamiseen.
          Ota yhteyttä BC Smartappiin.
        </p>
      )}

      {license.effective_status === 'active' && (
        <p className="license-status-lead">
          Tilaus voimassa. Arvioitu kuukausihinta:{' '}
          <strong>{formatLicenseMoney(pricing.estimated_monthly_total_eur)}</strong>
        </p>
      )}

      <div className="license-pricing-grid">
        <article className={`license-pricing-card${license.base_active ? ' is-active' : ''}`}>
          <h3>{LICENSE_MODULE_LABELS.base}</h3>
          <p className="muted">{LICENSE_MODULE_DESCRIPTIONS.base}</p>
          <p className="license-price">{formatLicenseMoney(pricing.base_monthly_eur)}</p>
          <p className="license-state">{license.base_active ? 'Tilattu' : 'Ei tilattu'}</p>
        </article>

        {ADDON_MODULES.map((moduleKey) => {
          const active = license.modules[moduleKey];
          const price = pricing.module_prices[moduleKey] ?? 0;
          return (
            <article key={moduleKey} className={`license-pricing-card${active ? ' is-active' : ''}`}>
              <h3>{LICENSE_MODULE_LABELS[moduleKey]}</h3>
              <p className="muted">{LICENSE_MODULE_DESCRIPTIONS[moduleKey]}</p>
              <p className="license-price">{formatLicenseMoney(price)}</p>
              <p className="license-state">{active ? 'Tilattu' : 'Ei tilattu'}</p>
            </article>
          );
        })}
      </div>

      {license.usage_this_month.length > 0 && (
        <div className="license-usage-block">
          <h3>Käyttö tässä kuussa</h3>
          <ul className="license-usage-list">
            {license.usage_this_month.map((row) => (
              <li key={row.module_key}>
                {LICENSE_MODULE_LABELS[row.module_key as LicenseModuleKey] ?? row.module_key}:{' '}
                <strong>{row.access_count}</strong> avausta
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="muted license-status-foot">
        Tilaus- ja maksuasiat: {GLOBAL_ADMIN_SUPPORT.email}.{' '}
        <a href="/BC-Smartapp-kayttoohje.pdf" target="_blank" rel="noreferrer">
          Lataa käyttöohje (PDF)
        </a>
        {' · '}
        <Link to="/hallinta/yritys">Yritystiedot</Link>
      </p>
    </section>
  );
}
