import { useMemo } from 'react';
import { VILP_BRAND_OPTIONS } from '../../lib/quoteRequest/constants';
import {
  applyDeviceBrandDefaults,
  findDeviceById,
  formatDeviceLabel,
} from '../../lib/quoteRequest/deviceCatalog';
import type { QuoteRequestData } from '../../lib/quoteRequest/types';
import {
  getDaikinVilpOutdoorOptions,
  getDaikinVilpPackages,
  inventorVilpDeviceGroups,
  normalizeDaikinVilpSelection,
} from '../../lib/quoteRequest/vilpCompatibility';
import { vesiIlmaLampopumput } from '../../data/pumpDeviceCatalog';

type Props = {
  form: QuoteRequestData;
  canEdit: boolean;
  onChange: (patch: Partial<QuoteRequestData>) => void;
};

export default function QuoteVilpConfigSection({ form, canEdit, onChange }: Props) {
  const brand = (form.vilpBrandChoice || '').trim();
  const outdoorOptions = useMemo(() => getDaikinVilpOutdoorOptions(), []);

  const daikinContext = useMemo(() => {
    if (brand !== 'Daikin') return null;
    const outdoor = form.vilpOutdoorModel.trim();
    const byOutdoor = outdoor
      ? getDaikinVilpPackages().filter((d) => d.vilpOutdoorModel === outdoor)
      : [];
    const desiredIndoorType = (form.vilpIndoorConfig === 'integroitu' ? 'integrated' : 'hydrobox') as
      | 'integrated'
      | 'hydrobox';
    return {
      outdoorSelected: Boolean(outdoor),
      byOutdoor,
      indoorTypes: outdoor
        ? (Array.from(new Set(byOutdoor.map((d) => d.vilpIndoorType))).filter(Boolean) as Array<
            'integrated' | 'hydrobox'
          >)
        : (['hydrobox', 'integrated'] as Array<'integrated' | 'hydrobox'>),
      desiredIndoorType,
      zonesAvailable: outdoor
        ? (Array.from(
            new Set(
              byOutdoor
                .filter((d) => d.vilpIndoorType === desiredIndoorType)
                .map((d) => d.vilpZones),
            ),
          ).filter(Boolean) as Array<1 | 2>)
        : ([1, 2] as Array<1 | 2>),
      coolingAvailable: outdoor
        ? (Array.from(
            new Set(
              byOutdoor
                .filter(
                  (d) =>
                    d.vilpIndoorType === desiredIndoorType && d.vilpZones === form.vilpZones,
                )
                .map((d) => d.vilpCooling),
            ),
          ).filter((v) => typeof v === 'boolean') as boolean[])
        : ([true, false] as boolean[]),
      tankAvailable:
        outdoor && form.vilpIndoorConfig === 'integroitu'
          ? (Array.from(
              new Set(
                byOutdoor
                  .filter(
                    (d) =>
                      d.vilpIndoorType === desiredIndoorType &&
                      d.vilpZones === form.vilpZones &&
                      d.vilpCooling === form.vilpCooling,
                  )
                  .map((d) => d.vilpTankLiters),
              ),
            ).filter((v) => v === 180 || v === 230) as Array<180 | 230>)
          : ([180, 230] as Array<180 | 230>),
    };
  }, [brand, form]);

  const inventorGroups = useMemo(() => inventorVilpDeviceGroups(), []);
  const samsungDevices = useMemo(
    () => vesiIlmaLampopumput.filter((d) => (d.brand || '').toLowerCase() === 'samsung'),
    [],
  );

  function selectPrimaryDevice(deviceId: string) {
    const device = findDeviceById(deviceId);
    onChange({
      ...applyDeviceBrandDefaults(form, device),
      selectedDeviceId: deviceId,
    });
  }

  function applyDaikinPatch(patch: Partial<QuoteRequestData>) {
    const next = { ...form, ...patch };
    const normalized = normalizeDaikinVilpSelection(next);
    const merged: Partial<QuoteRequestData> = { ...patch, ...normalized.patch };
    if (normalized.selected) {
      merged.selectedDeviceId = normalized.selected.id;
      Object.assign(merged, applyDeviceBrandDefaults(next, normalized.selected));
    }
    onChange(merged);
  }

  return (
    <section className="form-section quote-vilp-config">
      <h2>Valmistaja ja paketti</h2>
      <p className="muted">
        Valitse ensin valmistaja. Daikin: ulkoyksikkö ja sisäyksikön toteutus rajaa automaattisesti sopivat
        mallit A/B/C-valinnoissa.
      </p>
      <label>
        Valmistaja
        <select
          value={form.vilpBrandChoice}
          disabled={!canEdit}
          onChange={(e) =>
            onChange({
              vilpBrandChoice: e.target.value,
              vilpOutdoorModel: '',
              selectedDeviceId: '',
              altDevice1Id: '',
              altDevice2Id: '',
            })
          }
        >
          {VILP_BRAND_OPTIONS.map((opt) => (
            <option key={opt.value || 'none'} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      {!brand && (
        <p className="quote-vilp-hint panel-inset muted">
          Valitse valmistaja nähdäksesi Daikin-paketin osavalinnat tai Inventor/Samsung-laitelistat.
        </p>
      )}

      {brand === 'Daikin' && daikinContext && (
        <div className="panel-inset quote-vilp-daikin">
          <strong>Daikin – ulkoyksikkö ja sisäyksikön toteutus</strong>
          <div className="line-form-grid">
            <label>
              Ulkoyksikkö (teholuokka)
              <select
                value={form.vilpOutdoorModel}
                disabled={!canEdit}
                onChange={(e) => applyDaikinPatch({ vilpOutdoorModel: e.target.value })}
              >
                <option value="">— Valitse ulkoyksikkö —</option>
                {outdoorOptions.map((d) => (
                  <option key={d.vilpOutdoorModel} value={d.vilpOutdoorModel}>
                    {d.vilpSeries ? `${d.vilpSeries} – ` : ''}
                    {d.vilpOutdoorModel} ({d.heatingPowerMax} kW)
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sisäyksikkö
              <select
                value={form.vilpIndoorConfig}
                disabled={!canEdit || !daikinContext.outdoorSelected}
                onChange={(e) =>
                  applyDaikinPatch({
                    vilpIndoorConfig: e.target.value as QuoteRequestData['vilpIndoorConfig'],
                  })
                }
              >
                {daikinContext.indoorTypes.includes('hydrobox') && (
                  <option value="ilman-varaa">Hydrobox (ei integroitua varaajaa)</option>
                )}
                {daikinContext.indoorTypes.includes('integrated') && (
                  <option value="integroitu">Integroitu varaaja (lattiamalli)</option>
                )}
              </select>
            </label>
            <label>
              Vyöhyke
              <select
                value={form.vilpZones}
                disabled={!canEdit || !daikinContext.outdoorSelected}
                onChange={(e) =>
                  applyDaikinPatch({ vilpZones: Number(e.target.value) as 1 | 2 })
                }
              >
                {daikinContext.zonesAvailable.map((z) => (
                  <option key={z} value={z}>
                    {z === 2 ? '2-vyöhyke' : '1-vyöhyke'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Jäähdytys
              <select
                value={form.vilpCooling ? 'cooling' : 'heating'}
                disabled={!canEdit || !daikinContext.outdoorSelected}
                onChange={(e) =>
                  applyDaikinPatch({ vilpCooling: e.target.value === 'cooling' })
                }
              >
                {daikinContext.coolingAvailable.includes(true) && (
                  <option value="cooling">Lämmitys + jäähdytys</option>
                )}
                {daikinContext.coolingAvailable.includes(false) && (
                  <option value="heating">Pelkkä lämmitys</option>
                )}
              </select>
            </label>
            {form.vilpIndoorConfig === 'integroitu' && (
              <label>
                Varaaja (integroitu)
                <select
                  value={form.vilpTankLiters}
                  disabled={!canEdit || !daikinContext.outdoorSelected}
                  onChange={(e) =>
                    applyDaikinPatch({
                      vilpTankLiters: Number(e.target.value) as 0 | 180 | 230,
                    })
                  }
                >
                  {daikinContext.tankAvailable.map((t) => (
                    <option key={t} value={t}>
                      {t} L
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {form.selectedDeviceId && (
            <p className="muted">
              Valittu paketti: {formatDeviceLabel(findDeviceById(form.selectedDeviceId)!)}
            </p>
          )}
        </div>
      )}

      {brand === 'Inventor' && (
        <div className="panel-inset">
          <label>
            Päälaite (Matrix Split / Zero)
            <select
              value={form.selectedDeviceId}
              disabled={!canEdit}
              onChange={(e) => selectPrimaryDevice(e.target.value)}
            >
              <option value="">— Valitse laite —</option>
              <optgroup label="Matrix Split – Hydrobox">
                {inventorGroups.hydrobox.map((device) => (
                  <option key={device.id} value={device.id}>
                    {formatDeviceLabel(device)} • list {device.listPrice.toLocaleString('fi-FI')} €
                  </option>
                ))}
              </optgroup>
              <optgroup label="Matrix Split – Integroitu varaaja">
                {inventorGroups.integrated.map((device) => (
                  <option key={device.id} value={device.id}>
                    {formatDeviceLabel(device)} • list {device.listPrice.toLocaleString('fi-FI')} €
                  </option>
                ))}
              </optgroup>
              <optgroup label="Matrix Zero R290 – Monoblock">
                {inventorGroups.monoblock.map((device) => (
                  <option key={device.id} value={device.id}>
                    {formatDeviceLabel(device)} • list {device.listPrice.toLocaleString('fi-FI')} €
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <p className="muted">
            Inventor-toimitusmaksu = €/yksikkö × postitusyksiköt (laiterekisteristä). Matrix Zero -hinnat EXW
            -50%.
          </p>
        </div>
      )}

      {brand === 'Samsung' && (
        <div className="panel-inset">
          <label>
            Päälaite (EHS Mono R290)
            <select
              value={form.selectedDeviceId}
              disabled={!canEdit}
              onChange={(e) => selectPrimaryDevice(e.target.value)}
            >
              <option value="">— Valitse laite —</option>
              {samsungDevices.map((device) => (
                <option key={device.id} value={device.id}>
                  {formatDeviceLabel(device)} • list {device.listPrice.toLocaleString('fi-FI')} €
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </section>
  );
}
