import { Link } from 'react-router-dom';
import ToggleSwitch from './ToggleSwitch';
import { formatTrialEnd, moduleTrialLabel } from '../lib/moduleTrials';
import CompanySubscriptionOrderForm from './CompanySubscriptionOrderForm';
import ModuleDescription, { minDeviceFee } from './ModuleDescription';
import { useEffect, useState } from 'react';
import BillingPeriodPicker from './BillingPeriodPicker';
import { supabase } from '../lib/supabase';
import { DEFAULT_BILLING_DISCOUNTS, billingPeriodLabel, normalizeBillingPeriod, parsePriceList, type PriceList } from '../lib/companySignup';
import { GLOBAL_ADMIN_SUPPORT } from '../lib/supportContacts';
import {
  formatLicenseMoney,
  LICENSE_MODULE_DESCRIPTIONS,
  LICENSE_MODULE_LABELS,
  LICENSE_PAYMENT_STATUS_LABELS,
  offeredLicenseAddonModules,
  remoteMonitoringModuleDisplayPrice,
  tempDeviceTypeLabel,
  trialDaysRemaining,
  type CompanyLicenseSnapshot,
  type LicenseModuleKey,
} from '../lib/companyLicense';

type Props = {
  license: CompanyLicenseSnapshot;
  canManageOrder?: boolean;
  onRefresh?: () => void;
};

function formatDateFi(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fi-FI');
}

export default function LicenseStatusPanel({ license, canManageOrder, onRefresh }: Props) {
  const [discounts, setDiscounts] = useState<Pick<PriceList, 'billing_discounts'>>({ billing_discounts: DEFAULT_BILLING_DISCOUNTS });
  useEffect(() => {
    let alive = true;
    void supabase.from('license_catalog').select('*').eq('id', 1).maybeSingle().then(({ data }) => {
      if (alive && data) setDiscounts(parsePriceList(data));
    });
    return () => {
      alive = false;
    };
  }, []);
  const [trialBusy, setTrialBusy] = useState(false);
  const [trialError, setTrialError] = useState<string | null>(null);
  if (license.enrollment === 'legacy') return null;

  async function setKeep(moduleKey: string, keep: boolean) {
    setTrialBusy(true);
    setTrialError(null);
    const { error } = await supabase.rpc('company_set_module_trial_keep', { p_module_key: moduleKey, p_keep: keep });
    setTrialBusy(false);
    if (error) setTrialError(error.message);
    else onRefresh?.();
  }

  const daysLeft = trialDaysRemaining(license);
  // Moduulikokeilut vain maksavalla tilauksella; kokeilujaksolla kaikki on jo auki.
  const moduleTrials = license.effective_status === 'active' ? license.module_trials : [];
  const trialByKey = new Map(moduleTrials.map((t) => [t.module_key as string, t]));
  const shownTrials = moduleTrials.filter((t) => t.active || t.keep_after);
  const { pricing } = license;
  const showOrderForm =
    canManageOrder
    && license.effective_status === 'expired'
    && license.payment_status !== 'awaiting_payment';

  return (
    <section className="license-status-panel">
      {license.effective_status === 'pending_trial' && (
        <p className="license-status-lead">
          Maksuton kokeilujakso alkaa, kun yrityksen ensimmäinen käyttäjä kirjautuu sisään. Jakso on{' '}
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

      {license.effective_status === 'expired' && license.payment_status !== 'awaiting_payment' && (
        <p className="license-status-lead license-status-expired">
          Kokeilujakso on päättynyt ({formatDateFi(license.trial_ends_at)}). Valitse moduulit ja lähetä tilaus
          alla, tai ota yhteyttä BC Smartappiin.
        </p>
      )}

      {license.effective_status === 'active' && (
        <p className="license-status-lead">
          Tilaus on voimassa
          {license.paid_through && <> · maksettu {formatDateFi(license.paid_through)} asti</>}.
          {' '}{billingPeriodLabel(license.billing_interval)}.
        </p>
      )}

      {license.effective_status === 'active' && (
        <BillingPeriodPicker
          lines={[
            { key: 'sub', label: 'Tilaus', qty: 1, total: pricing.estimated_monthly_total_eur },
            ...moduleTrials
              .filter((t) => t.active)
              .map((t) => ({
                key: `trial:${t.module_key}`,
                label: `${moduleTrialLabel(t.module_key)} — kokeilu päättyy ${formatTrialEnd(t.ends_at)}`,
                qty: 1,
                total: 0,
              })),
          ]}
          monthlyNet={pricing.estimated_monthly_total_eur}
          value={normalizeBillingPeriod(license.billing_interval)}
          prices={discounts}
        />
      )}

      {license.payment_status !== 'none' && (
        <p className="muted license-status-meta">
          Maksutila: <strong>{LICENSE_PAYMENT_STATUS_LABELS[license.payment_status]}</strong>
          {license.next_billing_at && <> · seuraava laskutus {formatDateFi(license.next_billing_at)}</>}
        </p>
      )}

      <div className="license-pricing-grid">
        <article className={`license-pricing-card${license.base_active ? ' is-active' : ''}`}>
          <h3>{LICENSE_MODULE_LABELS.base}</h3>
          <p className="muted">{LICENSE_MODULE_DESCRIPTIONS.base}</p>
          <p className="license-price">{formatLicenseMoney(pricing.base_monthly_eur)}</p>
          <p className="license-state">{license.base_active ? 'Käytössä' : 'Ei tilauksessa'}</p>
        </article>

        {offeredLicenseAddonModules(pricing).map((moduleKey) => {
          const active = license.modules[moduleKey];
          const price =
            moduleKey === 'remote_monitoring'
              ? remoteMonitoringModuleDisplayPrice(pricing)
              : (pricing.module_prices[moduleKey] ?? 0);
          const devicePricing = pricing.remote_monitoring_devices;
          return (
            <article key={moduleKey} className={`license-pricing-card${active ? ' is-active' : ''}`}>
              <h3>{LICENSE_MODULE_LABELS[moduleKey]}</h3>
              <p className="muted"><ModuleDescription moduleKey={moduleKey} deviceFeeEur={minDeviceFee(pricing.temp_device_unit_prices)} /></p>
              <p className="license-price">{formatLicenseMoney(price)}</p>
              {moduleKey === 'remote_monitoring' && (
                <div className="license-device-pricing-detail muted">
                  <p>
                    Moduuli {formatLicenseMoney(pricing.module_prices.remote_monitoring ?? 0)}
                    {devicePricing.billable_count > 0 ? (
                      <>
                        {' '}
                        + laitteet {formatLicenseMoney(devicePricing.monthly_eur)} (
                        {devicePricing.billable_count} kpl)
                      </>
                    ) : (
                      <> · ei omia laitteita (demo ei laskuteta)</>
                    )}
                  </p>
                  {devicePricing.by_type.length > 0 && (
                    <ul className="license-device-pricing-list">
                      {devicePricing.by_type.map((row) => (
                        <li key={row.device_type}>
                          {tempDeviceTypeLabel(row.device_type)}: {row.count} ×{' '}
                          {formatLicenseMoney(row.unit_eur)} = {formatLicenseMoney(row.subtotal_eur)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <p className="license-state">
                {trialByKey.get(moduleKey)?.active
                  ? `Kokeilu — päättyy ${formatTrialEnd(trialByKey.get(moduleKey)!.ends_at, false)}`
                  : active ? 'Käytössä' : 'Ei tilauksessa'}
              </p>
            </article>
          );
        })}
      </div>

      {shownTrials.length > 0 && (
        <div className="license-trials-block">
          <h3>Moduulikokeilut</h3>
          <p className="muted">
            Kokeilussa oleva moduuli on käytössä maksutta. Kokeilun päätyttyä se lukittuu, ellei sitä tilata.
          </p>
          {shownTrials.map((t) => (
            <div key={t.module_key} className="license-trial-row">
              <strong>{moduleTrialLabel(t.module_key)}</strong>
              {t.active ? (
                <span className="module-trial-badge">Kokeilu — päättyy {formatTrialEnd(t.ends_at, false)}</span>
              ) : (
                <span className="module-trial-kept">Tilattu</span>
              )}
              {canManageOrder && t.active && (
                <ToggleSwitch
                  checked={t.keep_after}
                  disabled={trialBusy}
                  label={t.keep_after ? 'Tilaa — jatkuu kokeilun jälkeen' : 'Tilaa'}
                  onChange={(v) => void setKeep(t.module_key, v)}
                />
              )}
              {!canManageOrder && t.active && t.keep_after && <span className="muted">Jatkuu kokeilun jälkeen</span>}
            </div>
          ))}
          {trialError && <p className="error">{trialError}</p>}
        </div>
      )}

      {(showOrderForm || (canManageOrder && license.payment_status === 'awaiting_payment')) && (
        <CompanySubscriptionOrderForm
          license={license}
          onSubmitted={() => onRefresh?.()}
        />
      )}

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
        <a
          href="/BC-Smartapp-kayttoohje.pdf"
          download="BC-Smartapp-kayttoohje.pdf"
          target="_blank"
          rel="noopener noreferrer"
        >
          Lataa käyttöohje (PDF)
        </a>
        {' · '}
        <Link to="/hallinta/yritys">Oma yritys</Link>
      </p>
    </section>
  );
}
