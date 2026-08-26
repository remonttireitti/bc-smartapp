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
import { emptyCompanySettings, parseCompanySettings, canEditCompanySettings, canManageCompanyLogo, type CompanySettings } from '../lib/management';
import type { ManagementOutletContext } from '../lib/managementOutletContext';
import PartnerBillingRatesFields from '../components/PartnerBillingRatesFields';
import DeviceRegistrySettingsFields from '../components/quoteRequest/DeviceRegistrySettingsFields';
import ToggleSwitch from '../components/ToggleSwitch';
import TripDestinationsSettingsSection from '../components/TripDestinationsSettingsSection';

export default function CompanySettingsPage() {
  const { profile, billingModuleEnabled, partnershipsEnabled } = useOutletContext<ManagementOutletContext>();
  const showBillingSettings = billingModuleEnabled !== false;
  const showPartnershipSettings = partnershipsEnabled !== false;
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
  const canManageLogo = canManageCompanyLogo(profile.role);
  const canEditSettings = canEditCompanySettings(profile.role);

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
    if (!profile.company_id || !logoPath || !canManageLogo) return;
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
    if (!canEditSettings) return;
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
          <input value={name} onChange={(e) => setName(e.target.value)} required disabled={!canEditSettings} />
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
            <p className="muted">Vain ylläpitäjä tai esimies voi vaihtaa logon.</p>
          )}
          <p className="muted">PNG, JPG, WebP tai GIF. Max {(COMPANY_LOGO_MAX_BYTES / (1024 * 1024)).toFixed(0)} MB.</p>
        </div>      </section>

      {canEditSettings ? (
        <>
          <section className="form-section">
            <h2>Yhteystiedot</h2>
        <div className="line-form-grid">
          <label>Osoite<input value={settings.address ?? ''} onChange={(e) => setSettings((s) => ({ ...s, address: e.target.value }))} /></label>
          <label>Postinumero<input value={settings.postal_code ?? ''} onChange={(e) => setSettings((s) => ({ ...s, postal_code: e.target.value }))} /></label>
          <label>Kaupunki<input value={settings.city ?? ''} onChange={(e) => setSettings((s) => ({ ...s, city: e.target.value }))} /></label>
          <label>Puhelin<input value={settings.phone ?? ''} onChange={(e) => setSettings((s) => ({ ...s, phone: e.target.value }))} /></label>
          <label>Sähköposti<input type="email" value={settings.email ?? ''} onChange={(e) => setSettings((s) => ({ ...s, email: e.target.value }))} /></label>
          <label>Verkkosivu<input value={settings.website ?? ''} onChange={(e) => setSettings((s) => ({ ...s, website: e.target.value }))} /></label>
          <label>Tukes-pätevyys (kylmälaiteasennukset)<input value={settings.tukes_number ?? ''} onChange={(e) => setSettings((s) => ({ ...s, tukes_number: e.target.value }))} placeholder="Esim. TUKES123456" /></label>
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
        <h2>Tarjouspyynnöt</h2>
        <p className="muted">
          Oletusarvot asennustarvikke-laskurin sisäiseen hinnoitteluun (Työt → Asennus tarvikkeet). Voit
          muuttaa arvoja myös tarjouskohtaisesti.
        </p>
        <div className="line-form-grid">
          <label>
            Työn hankintahinta (€/h, alv 0)
            <input
              type="number"
              step="0.01"
              min="0"
              value={settings.quotes?.installation_labor_purchase_rate ?? ''}
              onChange={(e) => {
                const raw = e.target.value.trim();
                setSettings((current) => ({
                  ...current,
                  quotes: {
                    ...current.quotes,
                    installation_labor_purchase_rate: raw ? Number(raw) : undefined,
                  },
                }));
              }}
              placeholder="50"
            />
          </label>
          <label>
            Huoltoautokorvaus (€, alv 0)
            <input
              type="number"
              step="0.01"
              min="0"
              value={settings.quotes?.installation_vehicle_allowance ?? ''}
              onChange={(e) => {
                const raw = e.target.value.trim();
                setSettings((current) => ({
                  ...current,
                  quotes: {
                    ...current.quotes,
                    installation_vehicle_allowance: raw ? Number(raw) : undefined,
                  },
                }));
              }}
              placeholder="50"
            />
          </label>
          <label>
            Tunnit per korvausjakso
            <input
              type="number"
              step="1"
              min="1"
              value={settings.quotes?.installation_vehicle_hours_per_block ?? ''}
              onChange={(e) => {
                const raw = e.target.value.trim();
                setSettings((current) => ({
                  ...current,
                  quotes: {
                    ...current.quotes,
                    installation_vehicle_hours_per_block: raw ? Number(raw) : undefined,
                  },
                }));
              }}
              placeholder="8"
            />
          </label>
        </div>
      </section>

      <section className="form-section">
        <h2>Ajomatkat</h2>
        <p className="muted">
          Km-hintoja käytetään työkirjauksen automaattiseen km-korvausriviin. Oma hinta on kustannus tai
          kumppanille kirjattava summa; asiakashinta erikseen asiakaslaskutuksessa.
        </p>
        <div className="line-form-grid">
          <label>
            Km-korvaus — oma hinta (€/km)
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
          <label>
            Km-korvaus — asiakkaalle (€/km)
            <input
              type="number"
              step="0.01"
              min="0"
              value={settings.trip_km_customer_rate ?? ''}
              onChange={(e) => {
                const raw = e.target.value.trim();
                setSettings((current) => ({
                  ...current,
                  trip_km_customer_rate: raw ? Number(raw) : undefined,
                }));
              }}
              placeholder="Esim. 0,80"
            />
          </label>
        </div>
      </section>

      {profile.company_id && <TripDestinationsSettingsSection companyId={profile.company_id} />}

      <section className="form-section">
        <h2>Kumppanuus- ja moniyritystoiminnot</h2>
        <ToggleSwitch
          label="Käytössä"
          checked={settings.partnerships_enabled === true}
          onChange={(partnerships_enabled) =>
            setSettings((current) => ({
              ...current,
              partnerships_enabled,
            }))
          }
        />
        <p className="muted">
          Kun pois päältä, sovellus toimii yksinyrityksenä: kumppanuudet, toimeksiannot kumppanille ja
          kumppanilaskutus piilotetaan. Voit ottaa toiminnot käyttöön myöhemmin, kun tarvitset niitä.
        </p>
      </section>

      {showPartnershipSettings && (
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
      )}

      <section className="form-section">
        <h2>Asiakaslaskutuksen seuranta</h2>
        <ToggleSwitch
          label="Seurataan laskutusta asiakkaalta"
          checked={settings.billing?.track_customer_invoicing ?? false}
          onChange={(track_customer_invoicing) =>
            setSettings((s) => ({
              ...s,
              billing: { ...s.billing, track_customer_invoicing },
            }))
          }
        />
        <p className="muted">
          Koskee työraportteja ja tarjouspyyntöjä. Ei liity Laskutus-moduuliin (kumppanilaskutus). Työraportissa näkyy
          asiakkaalle laskutettava summa ja tila erillään kumppanilaskutuksesta. Kumppanin tulosteessa voidaan näyttää
          myös asiakkaalta laskutettava.
        </p>
      </section>

      <section className="form-section">
        <h2>Asiakaslaskutuksen oletustuntihinnat</h2>
        <p className="muted">
          Oletustuntihinnat työraportin asiakaslaskutuksessa. Kulurivillä oma hinta (ostohinta) ja erillinen asiakashinta.
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

      {showBillingSettings && showPartnershipSettings ? (
        <>
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
            Laskutusmoduuli (kumppanilaskutus) ei ole käytössä. Kumppanilaskutuksen oletushinnat on piilotettu — ota
            moduuli käyttöön globaalissa hallinnassa tarvittaessa.
          </p>
        </section>
      )}

        </>
      ) : null}

      {error && <p className="error">{error}</p>}
      {message && <p className="muted">{message}</p>}

      {canEditSettings && (
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Tallennetaan…' : 'Tallenna yritystiedot'}
          </button>
        </div>
      )}

      {!canEditSettings && (
        <p className="muted">
          Esimies voi vaihtaa vain yrityksen logon. Muut yritystiedot muokkaa ylläpitäjä.
        </p>
      )}
    </form>
  );
}
