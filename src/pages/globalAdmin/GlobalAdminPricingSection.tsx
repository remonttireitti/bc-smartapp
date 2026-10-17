import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import SubscriptionPriceEditor from '../../components/SubscriptionPriceEditor';

/** Kaikkien yritysten hinnoittelu: kokeilujakso, peruspaketti, moduulit ja laitteet. */
export default function GlobalAdminPricingSection() {
  const [catalogTrialDays, setCatalogTrialDays] = useState(30);
  const [catalogBasePrice, setCatalogBasePrice] = useState(49);
  const [catalogModulePrices, setCatalogModulePrices] = useState({ quotes: 19, billing: 19, remote_monitoring: 29, tools: 9 });
  const [catalogDevicePrices, setCatalogDevicePrices] = useState({ jc3248: 5, esp32_ds18b20: 5, default: 5 });
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [catalogMessage, setCatalogMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadLicenseCatalog();
  }, []);

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
    const devicePrices = (data.temp_device_monthly_prices as Record<string, number> | null) ?? {};
    setCatalogDevicePrices({
      jc3248: Number(devicePrices.jc3248 ?? 5),
      esp32_ds18b20: Number(devicePrices.esp32_ds18b20 ?? 5),
      default: Number(devicePrices.default ?? 5),
    });
  }

  async function saveLicenseCatalog(e: FormEvent) {
    e.preventDefault();
    setCatalogBusy(true);
    setCatalogMessage(null);
    setError(null);
    const { error: saveError } = await supabase.rpc('global_admin_update_license_catalog', {
      p_trial_days: catalogTrialDays,
      p_base_monthly_eur: catalogBasePrice,
      p_module_prices: catalogModulePrices,
      p_temp_device_monthly_prices: catalogDevicePrices,
    });
    setCatalogBusy(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setCatalogMessage('Hinnoittelu päivitetty.');
    await loadLicenseCatalog();
  }

  return (
    <section className="panel">
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
        {error && <p className="error">{error}</p>}
        <h3>Kumppanuudet, huoltolajit ja käyttäjät</h3>
        <SubscriptionPriceEditor />
    </section>
  );
}
