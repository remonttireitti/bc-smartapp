import { FormEvent, useMemo, useState } from 'react';
import ToggleSwitch from './ToggleSwitch';
import {
  estimateOrderMonthlyTotal,
  estimateOrderPeriodTotal,
  formatLicenseMoney,
  formatLicensePeriodMoney,
  LICENSE_BILLING_INTERVALS,
  LICENSE_MODULE_DESCRIPTIONS,
  LICENSE_MODULE_LABELS,
  PRICED_ADDON_MODULES,
  remoteMonitoringModuleDisplayPrice,
  tempDeviceTypeLabel,
  type CompanyLicenseSnapshot,
  type LicenseBillingInterval,
} from '../lib/companyLicense';
import { supabase } from '../lib/supabase';

type Props = {
  license: CompanyLicenseSnapshot;
  onSubmitted: () => void;
};

export default function CompanySubscriptionOrderForm({ license, onSubmitted }: Props) {
  const [baseActive, setBaseActive] = useState(true);
  const [modules, setModules] = useState({
    quotes: false,
    billing: false,
    remote_monitoring: false,
    tools: false,
  });
  const [billingInterval, setBillingInterval] = useState<LicenseBillingInterval>('monthly');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const monthlyTotal = useMemo(
    () => estimateOrderMonthlyTotal(baseActive, modules, license.pricing),
    [baseActive, modules, license.pricing],
  );
  const periodTotal = useMemo(
    () => estimateOrderPeriodTotal(monthlyTotal, billingInterval),
    [monthlyTotal, billingInterval],
  );

  const hasSelection = baseActive || Object.values(modules).some(Boolean);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!hasSelection) {
      setError('Valitse vähintään yksi moduuli tai peruspaketti.');
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);

    const { error: submitError } = await supabase.rpc('submit_company_subscription_order', {
      p_base_active: baseActive,
      p_modules: modules,
      p_billing_interval: billingInterval,
    });

    setBusy(false);
    if (submitError) {
      setError(submitError.message);
      return;
    }

    setMessage('Tilaus lähetetty. Saat laskun ja aktivoinnin yhteydenotosta.');
    onSubmitted();
  }

  if (license.payment_status === 'awaiting_payment' && license.order) {
    const order = license.order;
    return (
      <div className="license-order-pending">
        <h3>Tilaus odottaa maksua</h3>
        <p className="muted">
          Lähetetty {new Date(order.submitted_at).toLocaleString('fi-FI')}. Arvio jakson hinnasta:{' '}
          <strong>{formatLicensePeriodMoney(order.estimated_period_eur, order.billing_interval)}</strong>
          {' '}(n. {formatLicenseMoney(order.estimated_monthly_eur)}).
        </p>
        <ul className="license-order-module-list">
          {order.base_active && <li>{LICENSE_MODULE_LABELS.base}</li>}
          {PRICED_ADDON_MODULES.filter((key) => order.modules[key]).map((key) => (
            <li key={key}>{LICENSE_MODULE_LABELS[key]}</li>
          ))}
        </ul>
        <p className="muted">Laskutusjakso: {license.billing_interval_label}</p>
      </div>
    );
  }

  return (
    <form className="license-order-form" onSubmit={(e) => void onSubmit(e)}>
      <h3>Tilaa moduulit</h3>
      <p className="muted">
        Valitse tarvitsemasi moduulit ja laskutusjakso. Tilaus aktivoidaan maksun jälkeen.
      </p>

      <div className="license-order-modules">
        <div className="license-order-module-row">
          <ToggleSwitch
            checked={baseActive}
            label={LICENSE_MODULE_LABELS.base}
            onChange={setBaseActive}
          />
          <span className="license-order-module-meta">
            {formatLicenseMoney(license.pricing.base_monthly_eur)}
            <span className="muted"> — {LICENSE_MODULE_DESCRIPTIONS.base}</span>
          </span>
        </div>
        {PRICED_ADDON_MODULES.map((moduleKey) => {
          const basePrice = license.pricing.module_prices[moduleKey] ?? 0;
          const displayPrice =
            moduleKey === 'remote_monitoring' && modules.remote_monitoring
              ? remoteMonitoringModuleDisplayPrice(license.pricing)
              : basePrice;
          const showDevices =
            moduleKey === 'remote_monitoring' && license.pricing.remote_monitoring_devices.billable_count > 0;
          return (
            <div key={moduleKey} className="license-order-module-row">
              <ToggleSwitch
                checked={modules[moduleKey]}
                label={LICENSE_MODULE_LABELS[moduleKey]}
                onChange={(checked) => setModules((current) => ({ ...current, [moduleKey]: checked }))}
              />
              <span className="license-order-module-meta">
                {formatLicenseMoney(displayPrice)}
                {moduleKey === 'remote_monitoring' && showDevices && (
                  <span className="muted">
                    {' '}
                    (moduuli {formatLicenseMoney(basePrice)} + {license.pricing.remote_monitoring_devices.billable_count}{' '}
                    laitetta)
                  </span>
                )}
                <span className="muted"> — {LICENSE_MODULE_DESCRIPTIONS[moduleKey]}</span>
                {moduleKey === 'remote_monitoring' && showDevices && (
                  <ul className="license-device-pricing-list">
                    {license.pricing.remote_monitoring_devices.by_type.map((row) => (
                      <li key={row.device_type}>
                        {tempDeviceTypeLabel(row.device_type)}: {row.count} ×{' '}
                        {formatLicenseMoney(row.unit_eur)}
                      </li>
                    ))}
                  </ul>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <label>
        Laskutusjakso
        <select
          value={billingInterval}
          onChange={(e) => setBillingInterval(e.target.value as LicenseBillingInterval)}
        >
          {LICENSE_BILLING_INTERVALS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      <p className="license-order-total">
        Arvio: <strong>{formatLicensePeriodMoney(periodTotal, billingInterval)}</strong>
        {billingInterval !== 'monthly' && (
          <span className="muted"> (n. {formatLicenseMoney(monthlyTotal)} / kk)</span>
        )}
      </p>

      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}

      <button type="submit" className="btn btn-primary" disabled={busy || !hasSelection}>
        {busy ? 'Lähetetään…' : 'Lähetä tilaus'}
      </button>
    </form>
  );
}
