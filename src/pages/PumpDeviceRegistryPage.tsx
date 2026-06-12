import { useCallback, useEffect, useMemo, useState } from 'react';

import { Link } from 'react-router-dom';

import type { Session } from '@supabase/supabase-js';

import AppLayout from '../components/AppLayout';

import PumpDeviceRegistryAddDialog from '../components/quoteRequest/PumpDeviceRegistryAddDialog';
import PumpDeviceRegistryDetailDialog from '../components/quoteRequest/PumpDeviceRegistryDetailDialog';

import {
  customDeviceToHeatPump,
  isCustomPumpDeviceId,
} from '../data/customPumpDevices';
import type { CustomHeatPumpDeviceEntry } from '../data/deviceRegistryTypes';
import { ALL_PUMP_DEVICES, type HeatPumpDevice } from '../data/pumpDeviceCatalog';

import {

  computePurchaseNetAlv0,

  effectiveListAfterBrandBump,

  expandDeliveryFeesByCategoryToBrandKeys,

  getDefaultDiscountFromListPercent,

  getDeviceDeliveryFeeEuro,

  parseBrandDeliveryFeesFromMeta,

} from '../data/devicePricingShared';

import type { BrandDeliveryFeesByCategoryRow, DeviceRegistryOverride } from '../data/deviceRegistryTypes';

import { useProfile } from '../hooks/useProfile';

import {

  applyDeviceRegistryToSettings,

  setActiveDeviceRegistry,

  snapshotFromCompanySettings,

} from '../lib/quoteRequest/deviceRegistryState';

import { parseCompanySettings, type CompanySettings } from '../lib/management';

import { supabase } from '../lib/supabase';



interface Props {

  session: Session;

}



function effectiveDiscountPercent(device: HeatPumpDevice, override?: DeviceRegistryOverride | null): number {

  if (

    override?.discountFromListPercentOverride != null &&

    !Number.isNaN(Number(override.discountFromListPercentOverride))

  ) {

    return Number(override.discountFromListPercentOverride);

  }

  return getDefaultDiscountFromListPercent(device);

}



function effectiveListPriceEuro(

  device: HeatPumpDevice,

  brandBumps: Record<string, number>,

  override?: DeviceRegistryOverride | null,

): number {

  if (override?.listPriceOverride != null && Number(override.listPriceOverride) > 0) {

    return Math.round(Number(override.listPriceOverride) * 100) / 100;

  }

  const bump = Number(brandBumps[device.brand] ?? 0) || 0;

  return effectiveListAfterBrandBump(device.listPrice, bump);

}



export default function PumpDeviceRegistryPage({ session }: Props) {

  const { profile } = useProfile(session);

  const [loading, setLoading] = useState(true);

  const [savingMeta, setSavingMeta] = useState(false);

  const [savingDeviceId, setSavingDeviceId] = useState<string | null>(null);

  const [settings, setSettings] = useState<CompanySettings | null>(null);

  const [brandBumps, setBrandBumps] = useState<Record<string, number>>({});

  const [brandDeliveryFees, setBrandDeliveryFees] = useState<Record<string, BrandDeliveryFeesByCategoryRow>>({});

  const [overrides, setOverrides] = useState<Record<string, DeviceRegistryOverride>>({});

  const [customDevices, setCustomDevices] = useState<Record<string, CustomHeatPumpDeviceEntry>>({});

  const [draftRow, setDraftRow] = useState<Record<string, Partial<DeviceRegistryOverride>>>({});

  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const [search, setSearch] = useState('');

  const [category, setCategory] = useState<'all' | 'ilmalampopumppu' | 'vesi-ilmalampopumppu'>('all');

  const [detailId, setDetailId] = useState<string | null>(null);

  const [message, setMessage] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);



  const brands = useMemo(() => {

    const set = new Set<string>();

    ALL_PUMP_DEVICES.forEach((device) => set.add(device.brand));

    return [...set].sort((a, b) => a.localeCompare(b, 'fi'));

  }, []);



  const load = useCallback(async () => {

    if (!profile?.company_id) {

      setLoading(false);

      return;

    }

    setLoading(true);

    setError(null);

    const { data, error: loadError } = await supabase

      .from('companies')

      .select('settings')

      .eq('id', profile.company_id)

      .single();



    if (loadError || !data) {

      setError(loadError?.message ?? 'Asetusten lataus epäonnistui.');

      setLoading(false);

      return;

    }



    const parsed = parseCompanySettings(data.settings);

    setSettings(parsed);

    const reg = parsed.device_registry;

    setBrandBumps({ ...(reg?.brand_price_bumps ?? {}) });

    const feeParsed = parseBrandDeliveryFeesFromMeta(

      reg

        ? {

            brandDeliveryFeesByCategory: reg.brand_delivery_fees_by_category,

            brandDeliveryFeePerUnit: reg.brand_delivery_fee_per_unit,

          }

        : null,

    );

    setBrandDeliveryFees(expandDeliveryFeesByCategoryToBrandKeys(feeParsed, brands));

    const nextOverrides: Record<string, DeviceRegistryOverride> = {};

    for (const [id, row] of Object.entries(reg?.overrides ?? {})) {

      const merged = { ...row, deviceId: id };

      if (merged.imageUrl && !merged.imageUrlIndoor) merged.imageUrlIndoor = merged.imageUrl;

      nextOverrides[id] = merged;

    }

    setOverrides(nextOverrides);

    setCustomDevices({ ...(reg?.custom_devices ?? {}) });

    setDraftRow({});

    const snapshot = snapshotFromCompanySettings(parsed);

    setActiveDeviceRegistry(snapshot);

    setLoading(false);

  }, [profile?.company_id, brands]);



  useEffect(() => {

    void load();

  }, [load]);



  const effectiveOverrides = useMemo(() => {
    const ids = new Set([...Object.keys(overrides), ...Object.keys(draftRow)]);
    const out: Record<string, DeviceRegistryOverride> = {};
    for (const id of ids) {
      if (!overrides[id] && !draftRow[id]) continue;
      out[id] = { ...overrides[id], ...draftRow[id], deviceId: id };
    }
    return out;
  }, [overrides, draftRow]);

  useEffect(() => {
    setActiveDeviceRegistry({
      brandBumps,
      feeMap: parseBrandDeliveryFeesFromMeta({
        brandDeliveryFeesByCategory: Object.fromEntries(
          Object.entries(brandDeliveryFees).map(([brand, row]) => [brand.toLowerCase(), row]),
        ),
      }),
      overrides: effectiveOverrides,
      customDevices,
    });
  }, [brandBumps, brandDeliveryFees, effectiveOverrides, customDevices]);

  const allDevices = useMemo(
    () => [...ALL_PUMP_DEVICES, ...Object.values(customDevices).map(customDeviceToHeatPump)],
    [customDevices],
  );

  const mergedOverride = (id: string): DeviceRegistryOverride | undefined => effectiveOverrides[id];



  const rows = useMemo(() => {

    const q = search.trim().toLowerCase();

    return allDevices.filter((device) => {

      if (category !== 'all' && device.category !== category) return false;

      if (!q) return true;

      return [device.brand, device.name, device.model, device.id].join(' ').toLowerCase().includes(q);

    });

  }, [search, category, allDevices]);



  async function persistSettings(nextSettings: CompanySettings) {

    if (!profile?.company_id) return false;

    const { error: saveError } = await supabase

      .from('companies')

      .update({ settings: nextSettings })

      .eq('id', profile.company_id);

    if (saveError) {

      setError(saveError.message);

      return false;

    }

    setSettings(nextSettings);

    setActiveDeviceRegistry(snapshotFromCompanySettings(nextSettings));

    return true;

  }



  async function saveBrandSettings() {

    if (!settings) return;

    setSavingMeta(true);

    setError(null);

    setMessage(null);

    const next = applyDeviceRegistryToSettings(settings, { brandBumps });

    const ok = await persistSettings(next);

    if (ok) setMessage('Brändiasetukset tallennettu.');

    setSavingMeta(false);

  }



  async function saveCustomDevice(entry: CustomHeatPumpDeviceEntry): Promise<boolean> {
    if (!settings) return false;
    setSavingDeviceId(entry.id);
    setError(null);
    setMessage(null);
    const nextCustom = { ...customDevices, [entry.id]: entry };
    const next = applyDeviceRegistryToSettings(settings, { customDevices: nextCustom });
    const ok = await persistSettings(next);
    if (ok) {
      setCustomDevices(nextCustom);
      setAddDialogOpen(false);
      setMessage(`Oma laite “${entry.name}” lisätty.`);
    }
    setSavingDeviceId(null);
    return ok;
  }

  async function deleteCustomDevice(deviceId: string): Promise<void> {
    if (!settings || !isCustomPumpDeviceId(deviceId)) return;
    if (!window.confirm('Poistetaanko oma laite rekisteristä?')) return;
    setSavingDeviceId(deviceId);
    setError(null);
    setMessage(null);
    const nextCustom = { ...customDevices };
    delete nextCustom[deviceId];
    const nextOverrides = { ...overrides };
    delete nextOverrides[deviceId];
    const next = applyDeviceRegistryToSettings(settings, {
      customDevices: nextCustom,
      overrides: nextOverrides,
    });
    const ok = await persistSettings(next);
    if (ok) {
      setCustomDevices(nextCustom);
      setOverrides(nextOverrides);
      setMessage('Oma laite poistettu.');
    }
    setSavingDeviceId(null);
  }

  async function saveDeviceOverride(deviceId: string): Promise<boolean> {
    if (!settings) return false;
    setSavingDeviceId(deviceId);
    setError(null);
    setMessage(null);
    const base = overrides[deviceId] || { deviceId };
    const draft = draftRow[deviceId] || {};
    const merged: DeviceRegistryOverride = { ...base, ...draft, deviceId };
    const nextOverrides = { ...overrides, [deviceId]: merged };
    const next = applyDeviceRegistryToSettings(settings, { overrides: nextOverrides });
    const ok = await persistSettings(next);
    if (ok) {
      setOverrides(nextOverrides);
      setDraftRow((prev) => {
        const copy = { ...prev };
        delete copy[deviceId];
        return copy;
      });
      setMessage(`Laite ${deviceId} tallennettu.`);
    }
    setSavingDeviceId(null);
    return ok;
  }



  const detailDevice = detailId ? allDevices.find((device) => device.id === detailId) : null;



  return (

    <AppLayout session={session}>

      <div className="page-header">

        <div>

          <p className="breadcrumb">

            <Link to="/">Etusivu</Link> / <Link to="/tarjouspyynnot">Tarjouspyyntö</Link> / Laiterekisteri

          </p>

          <h1>Lämpöpumppujen rekisteri</h1>

          <p className="muted">

            {profile?.companies?.name ?? '—'} • {rows.length} / {allDevices.length} mallia

          </p>

        </div>

        <div className="page-header-actions">

          <Link to="/tarjouspyynnot" className="btn btn-secondary">

            Tarjouspyyntöihin

          </Link>

        </div>

      </div>



      {error && <p className="error">{error}</p>}

      {message && <p className="muted">{message}</p>}



      <p className="muted panel-inset">

        Yrityskohtaiset hinnat ja ominaisuudet tarjouspyyntöä varten. Listahinta = katalogi × tukkurikorotus (tai

        rivikohtainen yliajo). Alennus %, kuvat, VILP-vaiheet ja IILP-myyntitapa vaikuttavat suoraan tarjouksen

        laskentaan ja tulosteeseen.

      </p>



      {loading ? (

        <p className="muted">Ladataan…</p>

      ) : (

        <>

          <section className="panel form-section">

            <div className="section-header-row">

              <h2>Brändikohtaiset tukkurikorotukset</h2>

              <button

                type="button"

                className="btn btn-primary"

                disabled={savingMeta}

                onClick={() => void saveBrandSettings()}

              >

                {savingMeta ? 'Tallennetaan…' : 'Tallenna brändit'}

              </button>

            </div>

            <p className="muted">

              Tukkurikorotus % sovelletaan katalogilistahintaan ennen alennusta. Toimitusmaksut (IILP/VILP €/yksikkö)

              muokataan{' '}

              <Link to="/hallinta/yritys">yrityksen asetuksissa</Link>.

            </p>

            <div className="device-registry-brand-grid">

              {brands.map((brand) => (

                <label key={brand} className="device-registry-brand-row">

                  <span>{brand}</span>

                  <input

                    type="number"

                    step="0.1"

                    placeholder="0"

                    value={brandBumps[brand] ?? ''}

                    onChange={(e) => {

                      const value = e.target.value;

                      setBrandBumps((prev) => {

                        const next = { ...prev };

                        if (value === '') delete next[brand];

                        else next[brand] = Number(value);

                        return next;

                      });

                    }}

                  />

                  <span className="muted">%</span>

                </label>

              ))}

            </div>

          </section>



          <section className="panel">

            <div className="section-header-row">
              <h2>Laitteet</h2>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setAddDialogOpen(true)}
              >
                + Lisää oma laite
              </button>
            </div>

            <p className="muted">
              Katalogilaitteiden lisäksi voit kirjoittaa oman laitteen käsin. Omat laitteet tallentuvat
              yrityskohtaisesti ja näkyvät tarjouspyynnöissä.
            </p>

            <div className="toolbar">

              <input

                type="search"

                placeholder="Hae brändi, malli, id…"

                value={search}

                onChange={(e) => setSearch(e.target.value)}

              />

              <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>

                <option value="all">Kaikki tyypit</option>

                <option value="ilmalampopumppu">IILP (ilmalämpöpumppu)</option>

                <option value="vesi-ilmalampopumppu">VILP (vesi-ilmalämpöpumppu)</option>

              </select>

            </div>



            <div className="table-wrap">

              <table className="data-table pump-device-registry-table">

                <thead>

                  <tr>

                    <th>Laite</th>

                    <th>Lista katalogi</th>

                    <th>Tukkur %</th>

                    <th>Lista käytössä</th>

                    <th>Alennus %</th>

                    <th>Hankinta €</th>

                    <th>Lista yliajo</th>

                    <th></th>

                  </tr>

                </thead>

                <tbody>

                  {rows.map((device) => {

                    const override = mergedOverride(device.id);

                    const bump = Number(brandBumps[device.brand] ?? 0) || 0;

                    const listUse = effectiveListPriceEuro(device, brandBumps, override ?? null);

                    const disc = effectiveDiscountPercent(device, override ?? null);

                    const feeMap = parseBrandDeliveryFeesFromMeta({

                      brandDeliveryFeesByCategory: Object.fromEntries(

                        Object.entries(brandDeliveryFees).map(([brand, row]) => [brand.toLowerCase(), row]),

                      ),

                    });

                    const purchase = computePurchaseNetAlv0(device, listUse, disc, feeMap);

                    const draft = draftRow[device.id] || {};

                    const listOv = override?.listPriceOverride;



                    return (

                      <tr key={device.id}>

                        <td>

                          <strong>{device.name}</strong>
                          {isCustomPumpDeviceId(device.id) ? (
                            <span className="badge badge-muted">Oma laite</span>
                          ) : null}

                          <div className="muted">{device.model}</div>

                          <div className="muted">{device.brand} • {device.category === 'ilmalampopumppu' ? 'IILP' : 'VILP'}</div>

                          <div className="muted">{device.id}</div>

                        </td>

                        <td>
                          {isCustomPumpDeviceId(device.id)
                            ? '—'
                            : device.listPrice.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })}
                        </td>

                        <td>{bump ? `${bump} %` : '—'}</td>

                        <td>{listUse.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })}</td>

                        <td>

                          {disc.toLocaleString('fi-FI')}

                          {getDefaultDiscountFromListPercent(device) !== disc && (

                            <span className="muted"> (yliajo)</span>

                          )}

                        </td>

                        <td>

                          {purchase.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })}

                          {getDeviceDeliveryFeeEuro(device, feeMap) > 0 && (

                            <div className="muted">

                              sis. toimitus{' '}

                              {getDeviceDeliveryFeeEuro(device, feeMap).toLocaleString('fi-FI', {

                                style: 'currency',

                                currency: 'EUR',

                              })}

                            </div>

                          )}

                        </td>

                        <td>

                          <input

                            type="number"

                            min="0"

                            step="0.01"

                            className="input-compact"

                            placeholder="—"

                            value={

                              draft.listPriceOverride !== undefined

                                ? draft.listPriceOverride == null

                                  ? ''

                                  : String(draft.listPriceOverride)

                                : listOv != null

                                  ? String(listOv)

                                  : ''

                            }

                            onChange={(e) =>

                              setDraftRow((prev) => ({

                                ...prev,

                                [device.id]: {

                                  ...prev[device.id],

                                  listPriceOverride: e.target.value === '' ? null : Number(e.target.value),

                                },

                              }))

                            }

                          />

                        </td>

                        <td className="table-actions">

                          <button

                            type="button"

                            className="btn btn-secondary btn-sm"

                            onClick={() => setDetailId(device.id)}

                          >

                            Laajenna

                          </button>

                          <button

                            type="button"

                            className="btn btn-primary btn-sm"

                            disabled={savingDeviceId === device.id}

                            onClick={() => void saveDeviceOverride(device.id)}

                          >

                            {savingDeviceId === device.id ? '…' : 'Tallenna'}

                          </button>

                          {isCustomPumpDeviceId(device.id) ? (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={savingDeviceId === device.id}
                              onClick={() => void deleteCustomDevice(device.id)}
                            >
                              Poista
                            </button>
                          ) : null}

                        </td>

                      </tr>

                    );

                  })}

                </tbody>

              </table>

            </div>

          </section>

        </>

      )}



      <PumpDeviceRegistryAddDialog
        open={addDialogOpen}
        busy={savingDeviceId != null}
        onClose={() => setAddDialogOpen(false)}
        onSave={(entry) => void saveCustomDevice(entry)}
      />

      {detailDevice && (

        <PumpDeviceRegistryDetailDialog

          device={detailDevice}

          override={overrides[detailDevice.id]}

          draft={draftRow[detailDevice.id] ?? {}}

          busy={savingDeviceId === detailDevice.id}

          onDraftChange={(patch) =>

            setDraftRow((prev) => ({

              ...prev,

              [detailDevice.id]: { ...prev[detailDevice.id], ...patch },

            }))

          }

          onClose={() => setDetailId(null)}

          onSave={() =>
            void saveDeviceOverride(detailDevice.id).then((ok) => {
              if (ok) setDetailId(null);
            })
          }

        />

      )}

    </AppLayout>

  );

}


