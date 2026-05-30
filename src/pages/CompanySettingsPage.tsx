import { FormEvent, useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  COMPANY_LOGO_MAX_BYTES,
  isStorageLogoPath,
  removeCompanyLogo,
  resolveCompanyLogoUrl,
  saveCompanyLogo,
  validateCompanyLogoFile,
} from '../lib/companyLogo';
import { emptyCompanySettings, parseCompanySettings, type CompanySettings } from '../lib/management';
import type { ManagementOutletContext } from '../lib/managementOutletContext';
import PartnerBillingRatesFields from '../components/PartnerBillingRatesFields';
import DeviceRegistrySettingsFields from '../components/quoteRequest/DeviceRegistrySettingsFields';
import ToggleSwitch from '../components/ToggleSwitch';
import TripDestinationsSettingsSection from '../components/TripDestinationsSettingsSection';

export default function CompanySettingsPage() {
  const { profile, billingModuleEnabled } = useOutletContext<ManagementOutletContext>();
  const showBillingSettings = billingModuleEnabled !== false;
  const [name, setName] = useState('');
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [settings, setSettings] = useState<CompanySettings>(emptyCompanySettings());
  const [partnershipDiscoverable, setPartnershipDiscoverable] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const logoPreviewRequestRef = useRef(0);
  const localPreviewRef = useRef<string | null>(null);
  const canManageLogo = profile.role === 'admin';

  function revokeLocalPreview() {
    if (localPreviewRef.current) {
      URL.revokeObjectURL(localPreviewRef.current);
      localPreviewRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      revokeLocalPreview();
    };
  }, []);
  useEffect(() => {
    if (profile.company_id) void load();
  }, [profile.company_id]);

  async function loadLogoPreview(path: string | null, requestId?: number) {
    const activeRequest = requestId ?? ++logoPreviewRequestRef.current;
    revokeLocalPreview();

    if (!path) {
      if (activeRequest === logoPreviewRequestRef.current) setLogoPreviewUrl(null);
      return;
    }

    if (activeRequest === logoPreviewRequestRef.current) setLogoPreviewUrl(null);

    try {
      const url = await resolveCompanyLogoUrl(path);
      if (activeRequest === logoPreviewRequestRef.current) setLogoPreviewUrl(url);
    } catch {
      if (activeRequest === logoPreviewRequestRef.current) setLogoPreviewUrl(null);
    }
  }
  async function load() {
    const requestId = ++logoPreviewRequestRef.current;
    revokeLocalPreview();
    setLogoPreviewUrl(null);
    setLogoPath(null);

    const { data, error: loadError } = await supabase
      .from('companies')
      .select('name, logo_url, settings, partnership_discoverable')
      .eq('id', profile.company_id!)
      .single();
    if (loadError || !data) {
      setError(loadError?.message ?? 'Yrityksen lataus epäonnistui');
      return;
    }
    setName(data.name);
    setSettings(parseCompanySettings(data.settings));
    setPartnershipDiscoverable(data.partnership_discoverable ?? true);
    setLogoPath(data.logo_url ?? null);
    await loadLogoPreview(data.logo_url ?? null, requestId);
  }
  async function onLogoSelected(files: FileList | null) {
    const file = files?.[0];
    if (!file || !profile.company_id || !canManageLogo) return;

    const validationError = validateCompanyLogoFile(file);
    if (validationError) {
      setError(validationError);
      if (logoInputRef.current) logoInputRef.current.value = '';
      return;
    }

    setLogoBusy(true);
    setError(null);
    setMessage(null);

    revokeLocalPreview();
    localPreviewRef.current = URL.createObjectURL(file);
    setLogoPreviewUrl(localPreviewRef.current);

    try {
      const path = await saveCompanyLogo(profile.company_id, file, logoPath);
      revokeLocalPreview();
      setLogoPath(path);
      await loadLogoPreview(path);
      setMessage('Logo tallennettu.');
    } catch (err) {
      revokeLocalPreview();
      await loadLogoPreview(logoPath);
      setError(err instanceof Error ? err.message : 'Logon lataus epäonnistui');
    } finally {
      if (logoInputRef.current) logoInputRef.current.value = '';
      setLogoBusy(false);
    }
  }
  async function onRemoveLogo() {
    if (!profile.company_id || !logoPath) return;
    setLogoBusy(true);
    setError(null);
    setMessage(null);

    try {
      await removeCompanyLogo(profile.company_id, logoPath);
      setLogoPath(null);
      setLogoPreviewUrl(null);
      setMessage('Logo poistettu.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Logon poisto epäonnistui');
    } finally {
      setLogoBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    const { error: updateError } = await supabase
      .from('companies')
      .update({
        name: name.trim(),
        settings,
        partnership_discoverable: partnershipDiscoverable,
      })
      .eq('id', profile.company_id!);

    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMessage('Yritystiedot tallennettu.');
  }

  function setBilling(field: keyof NonNullable<CompanySettings['billing']>, value: string) {
    setSettings((s) => ({ ...s, billing: { ...s.billing, [field]: value } }));
  }

  return (
    <form className="panel form-grid" onSubmit={onSubmit}>
      <section className="form-section">
        <h2>Perustiedot</h2>
        <label>
          Yrityksen nimi
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>

        <div className="logo-upload-section">
          <span className="field-label">Logo</span>
          {logoPreviewUrl && (
            <div className="logo-preview">
              <img src={logoPreviewUrl} alt="Yrityksen logo" />
            </div>
          )}
          {canManageLogo ? (
            <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
              <label className="btn btn-secondary image-upload-btn">
                {logoBusy ? 'Ladataan…' : logoPath ? 'Vaihda logo' : 'Lataa logo'}
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  hidden
                  disabled={logoBusy}
                  onChange={(e) => void onLogoSelected(e.target.files)}
                />
              </label>
              {logoPath && isStorageLogoPath(logoPath) && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={logoBusy}
                  onClick={() => void onRemoveLogo()}
                >
                  Poista logo
                </button>
              )}
            </div>
          ) : (
            <p className="muted">Vain yrityksen ylläpitäjä voi vaihtaa logon.</p>
          )}
          <p className="muted">PNG, JPG, WebP tai GIF. Max {(COMPANY_LOGO_MAX_BYTES / (1024 * 1024)).toFixed(0)} MB.</p>
        </div>      </section>

      <section className="form-section">
        <h2>Yhteystiedot</h2>
        <div className="line-form-grid">
          <label>Osoite<input value={settings.address ?? ''} onChange={(e) => setSettings((s) => ({ ...s, address: e.target.value }))} /></label>
          <label>Postinumero<input value={settings.postal_code ?? ''} onChange={(e) => setSettings((s) => ({ ...s, postal_code: e.target.value }))} /></label>
          <label>Kaupunki<input value={settings.city ?? ''} onChange={(e) => setSettings((s) => ({ ...s, city: e.target.value }))} /></label>
          <label>Puhelin<input value={settings.phone ?? ''} onChange={(e) => setSettings((s) => ({ ...s, phone: e.target.value }))} /></label>
          <label>Sähköposti<input type="email" value={settings.email ?? ''} onChange={(e) => setSettings((s) => ({ ...s, email: e.target.value }))} /></label>
          <label>Verkkosivu<input value={settings.website ?? ''} onChange={(e) => setSettings((s) => ({ ...s, website: e.target.value }))} /></label>
        </div>
      </section>

      <section className="form-section">
        <h2>Laskutustiedot</h2>
        <div className="line-form-grid">
          <label>Y-tunnus<input value={settings.billing?.business_id ?? ''} onChange={(e) => setBilling('business_id', e.target.value)} /></label>
          <label>ALV-numero<input value={settings.billing?.vat_id ?? ''} onChange={(e) => setBilling('vat_id', e.target.value)} /></label>
          <label>IBAN<input value={settings.billing?.iban ?? ''} onChange={(e) => setBilling('iban', e.target.value)} /></label>
          <label>Laskutusosoite<input value={settings.billing?.billing_address ?? ''} onChange={(e) => setBilling('billing_address', e.target.value)} /></label>
          <label>Maksuehto<input value={settings.billing?.payment_terms ?? ''} onChange={(e) => setBilling('payment_terms', e.target.value)} /></label>
          <label>Laskutus sähköposti<input type="email" value={settings.billing?.invoice_email ?? ''} onChange={(e) => setBilling('invoice_email', e.target.value)} /></label>
        </div>
      </section>

      <DeviceRegistrySettingsFields settings={settings} onChange={setSettings} />

      <section className="form-section">
        <h2>Ajomatkat</h2>
        <p className="muted">
          Km-korvauksen hintaa käytetään työkirjauksen automaattiseen km-korvausriviin ajomatkojen yhteiskilometrien
          perusteella.
        </p>
        <div className="line-form-grid">
          <label>
            Km-korvauksen hinta (€/km)
            <input
              type="number"
              step="0.01"
              min="0"
              value={settings.trip_km_rate ?? ''}
              onChange={(e) => {
                const raw = e.target.value.trim();
                setSettings((current) => ({
                  ...current,
                  trip_km_rate: raw ? Number(raw) : undefined,
                }));
              }}
              placeholder="Esim. 0,53"
            />
          </label>
        </div>
      </section>

      {profile.company_id && <TripDestinationsSettingsSection companyId={profile.company_id} />}

      <section className="form-section">
        <h2>Kumppanuudet</h2>
        <ToggleSwitch
          label="Salli kumppanuuskutsut"
          checked={partnershipDiscoverable}
          onChange={setPartnershipDiscoverable}
        />
        <p className="muted">
          Kun sallittu, muut sovellusta käyttävät yritykset voivat löytää yrityksesi kumppanikutsua varten
          (Hallinta → Kumppanuudet). Kun estetty, yritystä ei näy kutsulistalla eikä uusia kumppanuuksia voi
          luoda — olemassa olevat kumppanuudet säilyvät.
        </p>
      </section>

      {showBillingSettings ? (
        <>
          <section className="form-section">
            <h2>Laskutus</h2>
            <ToggleSwitch
              label="Seurataan laskutuksia asiakkailta"
              checked={settings.billing?.track_customer_invoicing ?? false}
              onChange={(track_customer_invoicing) =>
                setSettings((s) => ({
                  ...s,
                  billing: { ...s.billing, track_customer_invoicing },
                }))
              }
            />
            <p className="muted">
              Kun päällä, työraportissa näkyy asiakaslaskutuksen tila erillään kumppanilaskutuksesta. Voit merkitä
              asiakkaan laskutetuksi vaikka kumppanilaskutus olisi yhä auki — ja päinvastoin. Kumppanilaskutus
              hallitaan Laskutus-moduulissa ja käyttäjien laskutusasetuksista (Hallinta → Käyttäjät).
            </p>
          </section>

          <section className="form-section">
            <h2>Asiakaslaskutuksen oletustuntihinnat</h2>
            <p className="muted">
              Oletustuntihinnat omien työraporttien asiakaslaskutuksessa. Voit poiketa yksittäisessä päiväkirjauksessa
              tai raporttikohtaisilla hinnoilla. Tarvikkeiden ja varaosien asiakashinta syötetään kuluriville.
            </p>
            <PartnerBillingRatesFields
              rates={settings.billing?.customer_rates ?? {}}
              onChange={(customer_rates) =>
                setSettings((s) => ({
                  ...s,
                  billing: { ...s.billing, customer_rates: { ...s.billing?.customer_rates, ...customer_rates } },
                }))
              }
            />
          </section>

          <section className="form-section">
            <h2>Kumppanilaskutuksen oletushinnat</h2>
            <p className="muted">
              Oletushinnat, joilla yrityksesi laskuttaa, kun teette työtä toisen yrityksen nimissä. Kumppanuus-sivulla
              kumppani voi määrittää eri hinnan teille; raportin laatija voi poiketa yksittäisessä työraportissa.
              Kulut lasketaan päiväkirjauksen riveiltä sellaisenaan.
            </p>
            <PartnerBillingRatesFields
              rates={settings.billing?.partner_rates ?? {}}
              onChange={(partner_rates) =>
                setSettings((s) => ({
                  ...s,
                  billing: { ...s.billing, partner_rates: { ...s.billing?.partner_rates, ...partner_rates } },
                }))
              }
            />
          </section>
        </>
      ) : (
        <section className="form-section">
          <p className="muted">
            Laskutusmoduuli ei ole käytössä tälle yritykselle. Kumppani- ja asiakaslaskutuksen asetukset on piilotettu.
          </p>
        </section>
      )}

      {error && <p className="error">{error}</p>}
      {message && <p className="muted">{message}</p>}

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Tallennetaan…' : 'Tallenna yritystiedot'}
        </button>
      </div>
    </form>
  );
}
