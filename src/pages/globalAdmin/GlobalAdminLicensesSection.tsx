import { FormEvent, useEffect, useState } from 'react';
import ToggleSwitch from '../../components/ToggleSwitch';
import {
  formatLicenseMoney,
  parseCompanyLicenseSnapshot,
  type CompanyLicenseSnapshot,
} from '../../lib/companyLicense';
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

  async function saveLicenseCatalog(e: FormEvent) {
    e.preventDefault();
    setCatalogBusy(true);
    setCatalogMessage(null);

    const { error: saveError } = await supabase.rpc('global_admin_update_license_catalog', {
      p_trial_days: catalogTrialDays,
      p_base_monthly_eur: catalogBasePrice,
      p_module_prices: catalogModulePrices,
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
            Etäseuranta €/kk
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
        </div>

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
                ? ` · arvio ${formatLicenseMoney(licenseSnapshot.pricing.estimated_monthly_total_eur)}`
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
