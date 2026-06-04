import { FormEvent, useEffect, useState } from 'react';
import ToggleSwitch from '../../components/ToggleSwitch';
import {
  formatLicensePeriodMoney,
  LICENSE_BILLING_INTERVALS,
  LICENSE_MODULE_LABELS,
  LICENSE_PAYMENT_STATUS_LABELS,
  PRICED_ADDON_MODULES,
  parseCompanyLicenseSnapshot,
  type CompanyLicenseSnapshot,
  type LicenseBillingInterval,
  type LicensePaymentStatus,
} from '../../lib/companyLicense';
import GlobalAdminLicenseOverview from './GlobalAdminLicenseOverview';
import { companyBillingModuleEnabled, parseCompanySettings } from '../../lib/management';
import { supabase } from '../../lib/supabase';
import type { Company } from '../../types';

type Props = {
  companies: Company[];
  onCompaniesChange: (updater: (prev: Company[]) => Company[]) => void;
  onRefresh: () => Promise<Company[] | void>;
};

export default function GlobalAdminLicensesSection({
  companies,
  onCompaniesChange,
  onRefresh,
}: Props) {
  const [billingModuleCompanyId, setBillingModuleCompanyId] = useState('');
  const [billingModuleEnabled, setBillingModuleEnabled] = useState(false);
  const [billingModuleBusy, setBillingModuleBusy] = useState(false);
  const [billingModuleMessage, setBillingModuleMessage] = useState<string | null>(null);
  const [billingModuleError, setBillingModuleError] = useState<string | null>(null);
  const [licenseCompanyId, setLicenseCompanyId] = useState('');
  const [licenseSnapshot, setLicenseSnapshot] = useState<CompanyLicenseSnapshot | null>(null);
  const [licenseStatus, setLicenseStatus] = useState('pending_trial');
  const [licenseBillingInterval, setLicenseBillingInterval] = useState<LicenseBillingInterval>('monthly');
  const [licensePaymentStatus, setLicensePaymentStatus] = useState<LicensePaymentStatus>('none');
  const [licenseBaseActive, setLicenseBaseActive] = useState(false);
  const [licenseModules, setLicenseModules] = useState({
    quotes: false,
    billing: false,
    remote_monitoring: false,
    tools: false,
  });
  const [licenseBusy, setLicenseBusy] = useState(false);
  const [licenseMessage, setLicenseMessage] = useState<string | null>(null);
  const [licenseError, setLicenseError] = useState<string | null>(null);
  const [catalogTrialDays, setCatalogTrialDays] = useState(30);
  const [catalogBasePrice, setCatalogBasePrice] = useState(49);
  const [catalogModulePrices, setCatalogModulePrices] = useState({
    quotes: 19,
    billing: 19,
    remote_monitoring: 29,
    tools: 9,
  });
  const [catalogDevicePrices, setCatalogDevicePrices] = useState({
    jc3248: 5,
    esp32_ds18b20: 5,
    default: 5,
  });
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [catalogMessage, setCatalogMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadLicenseCatalog();
  }, []);

  function syncBillingModuleToggle(companyId: string) {
    const company = companies.find((row) => row.id === companyId);
    setBillingModuleEnabled(
      company ? companyBillingModuleEnabled(parseCompanySettings(company.settings)) : false,
    );
  }

  async function loadLicenseCatalog() {
    const { data } = await supabase.from('license_catalog').select('*').eq('id', 1).maybeSingle();
    if (!data) return;
    setCatalogTrialDays(Number(data.trial_days ?? 30));
    setCatalogBasePrice(Number(data.base_monthly_eur ?? 49));
    const prices = (data.module_prices as Record<string, number> | null) ?? {};
    setCatalogModulePrices({
      quotes: Number(prices.quotes ?? 19),
      billing: Number(prices.billing ?? 19),
      remote_monitoring: Number(prices.remote_monitoring ?? 29),
      tools: Number(prices.tools ?? 9),
    });
    const devicePrices =
      (data.temp_device_monthly_prices as Record<string, number> | null) ?? {};
    setCatalogDevicePrices({
      jc3248: Number(devicePrices.jc3248 ?? 5),
      esp32_ds18b20: Number(devicePrices.esp32_ds18b20 ?? 5),
      default: Number(devicePrices.default ?? 5),
    });
  }

  async function loadLicenseForCompany(companyId: string) {
    if (!companyId) {
      setLicenseSnapshot(null);
      return;
    }
    const { data, error: loadError } = await supabase.rpc('company_license_snapshot', {
      p_company_id: companyId,
    });
    if (loadError) {
      setLicenseError(loadError.message);
      return;
    }
    const snapshot = parseCompanyLicenseSnapshot(data);
    setLicenseSnapshot(snapshot);
    if (!snapshot) return;
    setLicenseStatus(snapshot.status);
    setLicenseBillingInterval(snapshot.billing_interval);
    setLicensePaymentStatus(snapshot.payment_status);
    setLicenseBaseActive(snapshot.base_active);
    setLicenseModules({ ...snapshot.modules });
  }

  async function saveLicenseForCompany() {
    if (!licenseCompanyId) return;
    setLicenseBusy(true);
    setLicenseMessage(null);
    setLicenseError(null);

    const { data, error: saveError } = await supabase.rpc('global_admin_set_company_license', {
      p_company_id: licenseCompanyId,
      p_status: licenseStatus,
      p_base_active: licenseBaseActive,
      p_modules: licenseModules,
      p_billing_interval: licenseBillingInterval,
      p_payment_status: licensePaymentStatus,
      p_activate_pending_order: false,
    });

    setLicenseBusy(false);
    if (saveError) {
      setLicenseError(saveError.message);
      return;
    }

    setLicenseSnapshot(parseCompanyLicenseSnapshot(data));
    setLicenseMessage('Lisenssi päivitetty.');
    await onRefresh();
  }

  async function activatePendingOrder() {
    if (!licenseCompanyId) return;
    setLicenseBusy(true);
    setLicenseMessage(null);
    setLicenseError(null);

    const { data, error: saveError } = await supabase.rpc('global_admin_set_company_license', {
      p_company_id: licenseCompanyId,
      p_status: 'active',
      p_base_active: licenseBaseActive,
      p_modules: licenseModules,
      p_billing_interval: licenseBillingInterval,
      p_payment_status: 'paid',
      p_activate_pending_order: true,
    });

    setLicenseBusy(false);
    if (saveError) {
      setLicenseError(saveError.message);
      return;
    }

    const snapshot = parseCompanyLicenseSnapshot(data);
    setLicenseSnapshot(snapshot);
    if (snapshot) {
      setLicenseStatus(snapshot.status);
      setLicenseBillingInterval(snapshot.billing_interval);
      setLicensePaymentStatus(snapshot.payment_status);
      setLicenseBaseActive(snapshot.base_active);
      setLicenseModules({ ...snapshot.modules });
    }
    setLicenseMessage('Tilaus merkitty maksetuksi ja moduulit aktivoitu.');
    await onRefresh();
  }

  async function saveLicenseCatalog(e: FormEvent) {
    e.preventDefault();
    setCatalogBusy(true);
    setCatalogMessage(null);

    const { error: saveError } = await supabase.rpc('global_admin_update_license_catalog', {
      p_trial_days: catalogTrialDays,
      p_base_monthly_eur: catalogBasePrice,
      p_module_prices: catalogModulePrices,
      p_temp_device_monthly_prices: catalogDevicePrices,
    });

    setCatalogBusy(false);
    if (saveError) {
      setLicenseError(saveError.message);
      return;
    }
    setCatalogMessage('Hinnoittelu päivitetty.');
    await loadLicenseCatalog();
  }

  async function saveBillingModuleForCompany(companyId: string, enabled: boolean) {
    setBillingModuleBusy(true);
    setBillingModuleMessage(null);
    setBillingModuleError(null);
    const { error } = await supabase.rpc('global_admin_set_company_billing_module', {
      p_company_id: companyId,
      p_enabled: enabled,
    });
    setBillingModuleBusy(false);
    if (error) {
      setBillingModuleError(error.message);
      return;
    }
    setBillingModuleEnabled(enabled);
    onCompaniesChange((prev) =>
      prev.map((company) => {
        if (company.id !== companyId) return company;
        const settings = parseCompanySettings(company.settings);
        return {
          ...company,
          settings: {
            ...settings,
            billing: {
              ...settings.billing,
              module_enabled: enabled,
            },
          },
        };
      }),
    );
    setBillingModuleMessage(
      enabled
        ? 'Laskutusmoduuli käytössä valitulle yritykselle.'
        : 'Laskutusmoduuli piilotettu valitulta yritykseltä.',
    );
  }

  return (
    <>
      <GlobalAdminLicenseOverview
        onSelectCompany={(companyId) => {
          setLicenseCompanyId(companyId);
          setLicenseMessage(null);
          setLicenseError(null);
          void loadLicenseForCompany(companyId);
        }}
      />

      <section className="card global-admin-block">
        <h2>Hinnoittelu (kaikki yritykset)</h2>
        <p className="muted global-admin-hint">
          Uudet yritykset saavat {catalogTrialDays} päivän kokeilujakson ensimmäisestä kirjautumisesta. Kokeilun jälkeen
          peruspaketti ja lisämoduulit aktivoidaan manuaalisesti maksun jälkeen.
        </p>

        <form className="line-form-grid" onSubmit={(e) => void saveLicenseCatalog(e)}>
          <label>
            Kokeilu (pv)
            <input
              type="number"
              min={1}
              value={catalogTrialDays}
              onChange={(e) => setCatalogTrialDays(Number(e.target.value))}
            />
          </label>
          <label>
            Peruspaketti €/kk
            <input
              type="number"
              min={0}
              step="0.01"
              value={catalogBasePrice}
              onChange={(e) => setCatalogBasePrice(Number(e.target.value))}
            />
          </label>
          <label>
            Tarjoukset €/kk
            <input
              type="number"
              min={0}
              step="0.01"
              value={catalogModulePrices.quotes}
              onChange={(e) => setCatalogModulePrices((m) => ({ ...m, quotes: Number(e.target.value) }))}
            />
          </label>
          <label>
            Laskutus €/kk
            <input
              type="number"
              min={0}
              step="0.01"
              value={catalogModulePrices.billing}
              onChange={(e) => setCatalogModulePrices((m) => ({ ...m, billing: Number(e.target.value) }))}
            />
          </label>
          <label>
            Etäseuranta (moduuli) €/kk
            <input
              type="number"
              min={0}
              step="0.01"
              value={catalogModulePrices.remote_monitoring}
              onChange={(e) =>
                setCatalogModulePrices((m) => ({ ...m, remote_monitoring: Number(e.target.value) }))
              }
            />
          </label>
          <label>
            Laite JC3248 €/kk
            <input
              type="number"
              min={0}
              step="0.01"
              value={catalogDevicePrices.jc3248}
              onChange={(e) =>
                setCatalogDevicePrices((m) => ({ ...m, jc3248: Number(e.target.value) }))
              }
            />
          </label>
          <label>
            Laite ESP32 €/kk
            <input
              type="number"
              min={0}
              step="0.01"
              value={catalogDevicePrices.esp32_ds18b20}
              onChange={(e) =>
                setCatalogDevicePrices((m) => ({ ...m, esp32_ds18b20: Number(e.target.value) }))
              }
            />
          </label>
          <label>
            Laite (oletus) €/kk
            <input
              type="number"
              min={0}
              step="0.01"
              value={catalogDevicePrices.default}
              onChange={(e) =>
                setCatalogDevicePrices((m) => ({ ...m, default: Number(e.target.value) }))
              }
            />
          </label>
          <label>
            Työkalut €/kk
            <input
              type="number"
              min={0}
              step="0.01"
              value={catalogModulePrices.tools}
              onChange={(e) => setCatalogModulePrices((m) => ({ ...m, tools: Number(e.target.value) }))}
            />
          </label>
          <div className="form-actions global-admin-form-actions">
            <button type="submit" className="btn btn-secondary" disabled={catalogBusy}>
              {catalogBusy ? 'Tallennetaan…' : 'Tallenna hinnoittelu'}
            </button>
          </div>
        </form>
        {catalogMessage && <p className="success">{catalogMessage}</p>}
      </section>

      <section className="card global-admin-block">
        <h2>Yrityksen lisenssi</h2>
        <div className="line-form-grid">
          <label>
            Yritys
            <select
              value={licenseCompanyId}
              onChange={(e) => {
                const nextId = e.target.value;
                setLicenseCompanyId(nextId);
                setLicenseMessage(null);
                setLicenseError(null);
                void loadLicenseForCompany(nextId);
              }}
            >
              <option value="">Valitse yritys…</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tila
            <select
              value={licenseStatus}
              disabled={!licenseCompanyId}
              onChange={(e) => setLicenseStatus(e.target.value)}
            >
              <option value="pending_trial">Odottaa ensimmäistä kirjautumista</option>
              <option value="trial">Kokeilujakso</option>
              <option value="active">Maksava asiakas</option>
              <option value="expired">Päättynyt / maksamaton</option>
            </select>
          </label>
          <label>
            Laskutusjakso
            <select
              value={licenseBillingInterval}
              disabled={!licenseCompanyId}
              onChange={(e) => setLicenseBillingInterval(e.target.value as LicenseBillingInterval)}
            >
              {LICENSE_BILLING_INTERVALS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label>
            Maksutila
            <select
              value={licensePaymentStatus}
              disabled={!licenseCompanyId}
              onChange={(e) => setLicensePaymentStatus(e.target.value as LicensePaymentStatus)}
            >
              {(Object.keys(LICENSE_PAYMENT_STATUS_LABELS) as LicensePaymentStatus[]).map((key) => (
                <option key={key} value={key}>{LICENSE_PAYMENT_STATUS_LABELS[key]}</option>
              ))}
            </select>
          </label>
        </div>

        {licenseSnapshot?.order && (
          <div className="global-admin-pending-order panel">
            <h3>Odottava yrityksen tilaus</h3>
            <p className="muted">
              Lähetetty {new Date(licenseSnapshot.order.submitted_at).toLocaleString('fi-FI')} ·{' '}
              {formatLicensePeriodMoney(
                licenseSnapshot.order.estimated_period_eur,
                licenseSnapshot.order.billing_interval,
              )}
            </p>
            <ul className="license-order-module-list">
              {licenseSnapshot.order.base_active && <li>{LICENSE_MODULE_LABELS.base}</li>}
              {PRICED_ADDON_MODULES.filter((key) => licenseSnapshot.order?.modules[key]).map((key) => (
                <li key={key}>{LICENSE_MODULE_LABELS[key]}</li>
              ))}
            </ul>
            <button
              type="button"
              className="btn btn-primary"
              disabled={licenseBusy}
              onClick={() => void activatePendingOrder()}
            >
              {licenseBusy ? 'Aktivoidaan…' : 'Merkitse maksetuksi ja aktivoi tilaus'}
            </button>
          </div>
        )}

        {licenseSnapshot && licenseSnapshot.enrollment === 'legacy' && (
          <p className="muted">Legacy-yritys — kaikki moduulit vapaasti (ei tilausmallia).</p>
        )}

        {licenseCompanyId && licenseSnapshot && licenseSnapshot.enrollment !== 'legacy' && (
          <>
            <p className="muted">
              Tehokas tila: <strong>{licenseSnapshot.effective_status}</strong>
              {licenseSnapshot.trial_ends_at
                ? ` · kokeilu päättyy ${new Date(licenseSnapshot.trial_ends_at).toLocaleDateString('fi-FI')}`
                : ''}
              {licenseSnapshot.effective_status === 'active'
                ? ` · ${formatLicensePeriodMoney(
                    licenseSnapshot.pricing.estimated_period_total_eur,
                    licenseSnapshot.billing_interval,
                  )}`
                : ''}
              {licenseSnapshot.paid_through
                ? ` · maksettu ${new Date(licenseSnapshot.paid_through).toLocaleDateString('fi-FI')} asti`
                : ''}
            </p>
            <div className="form-field-toggle">
              <ToggleSwitch
                checked={licenseBaseActive}
                disabled={licenseBusy}
                label="Peruspaketti (työraportit, varasto, huolto, asiakkaat)"
                onChange={setLicenseBaseActive}
              />
            </div>
            <div className="license-admin-module-toggles">
              <ToggleSwitch
                checked={licenseModules.quotes}
                disabled={licenseBusy}
                label="Tarjoukset"
                onChange={(checked) => setLicenseModules((m) => ({ ...m, quotes: checked }))}
              />
              <ToggleSwitch
                checked={licenseModules.billing}
                disabled={licenseBusy}
                label="Laskutus"
                onChange={(checked) => setLicenseModules((m) => ({ ...m, billing: checked }))}
              />
              <ToggleSwitch
                checked={licenseModules.remote_monitoring}
                disabled={licenseBusy}
                label="Etäseuranta"
                onChange={(checked) => setLicenseModules((m) => ({ ...m, remote_monitoring: checked }))}
              />
              <ToggleSwitch
                checked={licenseModules.tools}
                disabled={licenseBusy}
                label="Työkalut"
                onChange={(checked) => setLicenseModules((m) => ({ ...m, tools: checked }))}
              />
            </div>
            {licenseSnapshot.usage_this_month.length > 0 && (
              <ul className="license-usage-list">
                {licenseSnapshot.usage_this_month.map((row) => (
                  <li key={row.module_key}>
                    {row.module_key}: {row.access_count} avausta tässä kuussa
                  </li>
                ))}
              </ul>
            )}
            <div className="form-actions global-admin-form-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!licenseCompanyId || licenseBusy}
                onClick={() => void saveLicenseForCompany()}
              >
                {licenseBusy ? 'Tallennetaan…' : 'Tallenna yrityksen lisenssi'}
              </button>
            </div>
          </>
        )}
        {licenseMessage && <p className="success">{licenseMessage}</p>}
        {licenseError && <p className="error">{licenseError}</p>}
      </section>

      <section className="card global-admin-block">
        <h2>Laskutusmoduuli (yritys)</h2>
        <p className="muted global-admin-hint">
          Määrittää näkeekö yrityksen käyttäjät Laskutus-moduulin. Oletus on pois päältä. Ei näy yrityksen
          ylläpitäjän hallinnassa — vain globaali admin.
        </p>
        <div className="line-form-grid">
          <label>
            Yritys
            <select
              value={billingModuleCompanyId}
              onChange={(e) => {
                const nextId = e.target.value;
                setBillingModuleCompanyId(nextId);
                syncBillingModuleToggle(nextId);
                setBillingModuleMessage(null);
                setBillingModuleError(null);
              }}
            >
              <option value="">Valitse yritys…</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
          </label>
          <div className="form-field-toggle">
            <ToggleSwitch
              checked={billingModuleEnabled}
              disabled={!billingModuleCompanyId || billingModuleBusy}
              label="Laskutusmoduuli käytössä"
              onChange={(checked) => {
                if (!billingModuleCompanyId) return;
                void saveBillingModuleForCompany(billingModuleCompanyId, checked);
              }}
            />
          </div>
        </div>
        {billingModuleMessage && <p className="success">{billingModuleMessage}</p>}
        {billingModuleError && <p className="error">{billingModuleError}</p>}
      </section>
    </>
  );
}
