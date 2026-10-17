import { useEffect, useState } from 'react';
import HuoltoSettingsSection from '../../components/HuoltoSettingsSection';
import ToggleSwitch from '../../components/ToggleSwitch';
import { invalidateCompanyLicenseCache } from '../../hooks/useCompanyLicense';
import { notifyHuoltoSettingsChanged } from '../../hooks/useCompanyHuoltoSettings';
import {
  formatLicensePeriodMoney,
  LICENSE_BILLING_INTERVALS,
  LICENSE_MODULE_LABELS,
  LICENSE_PAYMENT_STATUS_LABELS,
  PRICED_ADDON_MODULES,
  parseCompanyLicenseSnapshot,
  trialDaysRemaining,
  type CompanyLicenseSnapshot,
  type LicenseBillingInterval,
  type LicensePaymentStatus,
} from '../../lib/companyLicense';
import { saveCompanyAdminPatch } from '../../lib/companyAdminSettings';
import { parseHuoltoSettings, serializeHuoltoSettings, type HuoltoSettings } from '../../lib/huoltoCategories';
import { companyBillingModuleEnabled, parseCompanySettings } from '../../lib/management';
import { supabase } from '../../lib/supabase';
import { licenseStatusText } from './utils';

type Props = {
  companyId: string;
  /** companies.settings */
  settings: unknown;
  ownCompanyId: string | null | undefined;
  onSaved: () => Promise<void> | void;
};

type Modules = { quotes: boolean; billing: boolean; remote_monitoring: boolean; tools: boolean };

/** Lisenssimoduulin avain kumppanuuksille (hinnoittelu/gating toisaalla); tehokas kytkin = settings.partnerships_enabled. */
export const PARTNERS_MODULE_KEY = 'partners';

function fmtDate(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleDateString('fi-FI') : '';
}

/** Yrityksen kaikki moduulikytkimet yhdessä paikassa (GBA): tilaus, moduulit, kumppanuudet, huoltolajit. */
export default function CompanyModulesEditor({ companyId, settings, ownCompanyId, onSaved }: Props) {
  const [snapshot, setSnapshot] = useState<CompanyLicenseSnapshot | null>(null);
  const [enrollment, setEnrollment] = useState<'legacy' | 'subscription'>('subscription');
  const [preserveLegacy, setPreserveLegacy] = useState(false);
  const [storedPreserve, setStoredPreserve] = useState(false);
  const [status, setStatus] = useState('pending_trial');
  const [billingInterval, setBillingInterval] = useState<LicenseBillingInterval>('monthly');
  const [payment, setPayment] = useState<LicensePaymentStatus>('none');
  const [baseActive, setBaseActive] = useState(false);
  const [modules, setModules] = useState<Modules>({ quotes: false, billing: false, remote_monitoring: false, tools: false });
  const [billingMenu, setBillingMenu] = useState(false);
  const [partnerships, setPartnerships] = useState(false);
  const [huolto, setHuolto] = useState<HuoltoSettings>(() => parseHuoltoSettings(settings));
  const [huoltoDirty, setHuoltoDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    const parsed = parseCompanySettings(settings);
    setBillingMenu(companyBillingModuleEnabled(parsed));
    setPartnerships(parsed.partnerships_enabled === true);
    setHuolto(parseHuoltoSettings(settings));
    setHuoltoDirty(false);
    const stored =
      settings && typeof settings === 'object' ? (settings as { license?: Record<string, unknown> }).license : null;
    setPreserveLegacy(stored?.preserve_legacy === true);
    setStoredPreserve(stored?.preserve_legacy === true);
    const { data, error: e } = await supabase.rpc('company_license_snapshot', { p_company_id: companyId });
    if (e) {
      setError(e.message);
      return;
    }
    const snap = parseCompanyLicenseSnapshot(data);
    setSnapshot(snap);
    if (!snap) return;
    setEnrollment(snap.enrollment === 'legacy' ? 'legacy' : 'subscription');
    setStatus(snap.status);
    setBillingInterval(snap.billing_interval);
    setPayment(snap.payment_status);
    const storedModules =
      stored?.modules && typeof stored.modules === 'object' ? (stored.modules as Record<string, boolean>) : null;
    if (stored) {
      setBaseActive(stored.base_active === true);
      setModules({
        quotes: storedModules?.quotes === true,
        billing: storedModules?.billing === true,
        remote_monitoring: storedModules?.remote_monitoring === true,
        tools: storedModules?.tools === true,
      });
    } else {
      setBaseActive(snap.base_active);
      setModules({ ...snap.modules });
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, settings]);

  async function save(opts: { activateOrder?: boolean } = {}) {
    if (!snapshot) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const wasLegacy = snapshot.enrollment === 'legacy';
      if ((enrollment === 'legacy') !== wasLegacy || (enrollment === 'legacy' && preserveLegacy !== storedPreserve)) {
        const { error: e } = await supabase.rpc('global_admin_set_company_enrollment', {
          p_company_id: companyId,
          p_enrollment: enrollment,
          p_preserve_legacy: enrollment === 'legacy' ? preserveLegacy : false,
        });
        if (e) throw new Error(e.message);
      }
      if (enrollment === 'subscription') {
        const { error: e } = await supabase.rpc('global_admin_set_company_license', {
          p_company_id: companyId,
          p_status: opts.activateOrder ? 'active' : status,
          p_base_active: baseActive,
          p_modules: { ...modules, [PARTNERS_MODULE_KEY]: partnerships },
          p_billing_interval: billingInterval,
          p_payment_status: opts.activateOrder ? 'paid' : payment,
          p_activate_pending_order: !!opts.activateOrder,
        });
        if (e) throw new Error(e.message);
      } else {
        const { error: e } = await supabase.rpc('global_admin_set_company_billing_module', {
          p_company_id: companyId,
          p_enabled: billingMenu,
        });
        if (e) throw new Error(e.message);
      }
      const parsed = parseCompanySettings(settings);
      const settingsPatch: Record<string, unknown> = {};
      if ((parsed.partnerships_enabled === true) !== partnerships) settingsPatch.partnerships_enabled = partnerships;
      if (huoltoDirty) settingsPatch.huolto = serializeHuoltoSettings(huolto);
      if (Object.keys(settingsPatch).length > 0) {
        await saveCompanyAdminPatch(supabase, companyId, { settings: settingsPatch }, ownCompanyId);
        if (huoltoDirty) notifyHuoltoSettingsChanged(companyId, serializeHuoltoSettings(huolto));
      }
      invalidateCompanyLicenseCache(companyId);
      setMessage(opts.activateOrder ? 'Tilaus aktivoitu.' : 'Tallennettu.');
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tallennus epäonnistui.');
    } finally {
      setBusy(false);
    }
  }

  async function extendTrial() {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc('global_admin_extend_company_trial', { p_company_id: companyId, p_extra_days: 30 });
    setBusy(false);
    if (e) {
      setError(e.message);
      return;
    }
    invalidateCompanyLicenseCache(companyId);
    setMessage('Kokeilua jatkettu 30 päivää.');
    await load();
  }

  if (!snapshot) return error ? <p className="error">{error}</p> : <p className="muted">Ladataan…</p>;

  const legacy = enrollment === 'legacy';
  const days = trialDaysRemaining(snapshot);
  const canExtend = !legacy && ['trial', 'expired', 'pending_trial'].includes(snapshot.effective_status);
  const statusLine = [
    licenseStatusText(snapshot),
    snapshot.trial_ends_at && snapshot.effective_status === 'trial' ? `kokeilu ${fmtDate(snapshot.trial_ends_at)}${days != null ? ` (${days} pv)` : ''}` : '',
    snapshot.paid_through ? `maksettu ${fmtDate(snapshot.paid_through)} asti` : '',
    snapshot.effective_status === 'active'
      ? formatLicensePeriodMoney(snapshot.pricing.estimated_period_total_eur, snapshot.billing_interval)
      : '',
  ].filter(Boolean).join(' · ');

  return (
    <div className="company-modules-editor">
      <section className="form-section">
        <h2>Tilaus</h2>
        <p className="muted">{statusLine}</p>
        <div className="line-form-grid">
          <label>
            Yritysmalli
            <select value={enrollment} disabled={busy} onChange={(e) => setEnrollment(e.target.value as 'legacy' | 'subscription')}>
              <option value="legacy">Vanha sopimus (kaikki moduulit)</option>
              <option value="subscription">Tilaus ja kokeilu</option>
            </select>
          </label>
          {!legacy && (
            <>
              <label>
                Tila
                <select value={status} disabled={busy} onChange={(e) => setStatus(e.target.value)}>
                  <option value="pending_trial">Odottaa ensimmäistä kirjautumista</option>
                  <option value="trial">Kokeilujakso</option>
                  <option value="active">Maksava asiakas</option>
                  <option value="expired">Päättynyt / maksamaton</option>
                </select>
              </label>
              <label>
                Laskutusjakso
                <select value={billingInterval} disabled={busy} onChange={(e) => setBillingInterval(e.target.value as LicenseBillingInterval)}>
                  {LICENSE_BILLING_INTERVALS.map((i) => (
                    <option key={i.value} value={i.value}>{i.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Maksutila
                <select value={payment} disabled={busy} onChange={(e) => setPayment(e.target.value as LicensePaymentStatus)}>
                  {(Object.keys(LICENSE_PAYMENT_STATUS_LABELS) as LicensePaymentStatus[]).map((k) => (
                    <option key={k} value={k}>{LICENSE_PAYMENT_STATUS_LABELS[k]}</option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>
        {legacy && (
          <ToggleSwitch checked={preserveLegacy} disabled={busy} label="Pidä vanha sopimus (ei massasiirtoa)" onChange={setPreserveLegacy} />
        )}
        {canExtend && (
          <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void extendTrial()}>
              Jatka kokeilua 30 pv
            </button>
          </div>
        )}
        {snapshot.order && (
          <div className="global-admin-pending-order panel">
            <strong>Odottava tilaus</strong>{' '}
            <span className="muted">
              {fmtDate(snapshot.order.submitted_at)} ·{' '}
              {formatLicensePeriodMoney(snapshot.order.estimated_period_eur, snapshot.order.billing_interval)} ·{' '}
              {[
                snapshot.order.base_active ? LICENSE_MODULE_LABELS.base : null,
                ...PRICED_ADDON_MODULES.filter((k) => snapshot.order?.modules[k]).map((k) => LICENSE_MODULE_LABELS[k]),
              ].filter(Boolean).join(', ')}
            </span>
            <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void save({ activateOrder: true })}>
                Merkitse maksetuksi ja aktivoi
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="form-section">
        <h2>Moduulit</h2>
        <div className="settings-toggle-list">
          {!legacy && (
            <>
              <ToggleSwitch checked={baseActive} disabled={busy} label="Peruspaketti (työ- ja huoltoraportit, asiakkaat, varasto)" onChange={setBaseActive} />
              <ToggleSwitch checked={modules.quotes} disabled={busy} label="Tarjoukset" onChange={(v) => setModules((m) => ({ ...m, quotes: v }))} />
            </>
          )}
          <ToggleSwitch
            checked={legacy ? billingMenu : modules.billing}
            disabled={busy}
            label="Laskutus"
            onChange={(v) => (legacy ? setBillingMenu(v) : setModules((m) => ({ ...m, billing: v })))}
          />
          {!legacy && (
            <>
              <ToggleSwitch checked={modules.remote_monitoring} disabled={busy} label="Etäseuranta" onChange={(v) => setModules((m) => ({ ...m, remote_monitoring: v }))} />
              <ToggleSwitch checked={modules.tools} disabled={busy} label="Työkalut" onChange={(v) => setModules((m) => ({ ...m, tools: v }))} />
            </>
          )}
          <ToggleSwitch checked={partnerships} disabled={busy} label="Kumppanuudet" onChange={setPartnerships} />
        </div>
        {!legacy && <p className="muted">Kokeilujaksolla kaikki moduulit ovat auki.</p>}
      </section>

      <section className="form-section">
        <h2>Huoltoraportit</h2>
        <HuoltoSettingsSection
          bare
          mode="toggles"
          companySettings={{ huolto }}
          onChange={(next) => {
            setHuolto(next);
            setHuoltoDirty(true);
          }}
        />
      </section>

      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
          {busy ? 'Tallennetaan…' : 'Tallenna'}
        </button>
      </div>
    </div>
  );
}
