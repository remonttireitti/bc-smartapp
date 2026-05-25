import { computeHeatingNeedKw } from '../../lib/quoteRequest/calculations';
import {
  BUILDING_TYPE_OPTIONS,
  CURRENT_HEATING_OPTIONS,
  HEATING_SYSTEM_OPTIONS,
  QUOTE_PROJECT_TYPE_LABELS,
  QUOTE_REGION_LABELS,
} from '../../lib/quoteRequest/constants';
import type { QuoteRequestData } from '../../lib/quoteRequest/types';

type Props = {
  form: QuoteRequestData;
  canEdit: boolean;
  onChange: (patch: Partial<QuoteRequestData>) => void;
};

export default function QuoteVilpSiteSection({ form, canEdit, onChange }: Props) {
  const heatingNeedKw = computeHeatingNeedKw(form);
  const showCurrentHeating = form.projectType !== 'uudis';
  const showOilExtras = form.projectType === 'korjaus' && form.currentHeating === 'öljy';
  const showOilConsumption = showCurrentHeating && form.currentHeating === 'öljy';
  const showElectricConsumption = showCurrentHeating && form.currentHeating === 'sähkö';

  return (
    <>
      <section className="form-section">
        <h2>Kohteen tiedot</h2>
        <div className="line-form-grid">
          <label>
            Kiinteistön tyyppi
            <select
              value={form.buildingType}
              onChange={(e) => onChange({ buildingType: e.target.value })}
              disabled={!canEdit}
            >
              {BUILDING_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Sijainti
            <select
              value={form.region}
              onChange={(e) => onChange({ region: e.target.value as QuoteRequestData['region'] })}
              disabled={!canEdit}
            >
              {(Object.keys(QUOTE_REGION_LABELS) as QuoteRequestData['region'][]).map((key) => (
                <option key={key} value={key}>
                  {QUOTE_REGION_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Lämmitettävä pinta-ala (m²)
            <input
              type="number"
              min="0"
              value={form.heatedArea}
              onChange={(e) => onChange({ heatedArea: Number(e.target.value) })}
              disabled={!canEdit}
            />
            <span className="muted field-hint">
              Asuin-/päälämmitettävä pinta-ala. Autotalli ja muut tarkennukset voidaan lisätä myöhemmin.
            </span>
          </label>
          <label>
            Haluttu sisälämpötila (°C)
            <input
              type="number"
              value={form.desiredTemperature}
              onChange={(e) => onChange({ desiredTemperature: Number(e.target.value) })}
              disabled={!canEdit}
            />
          </label>
        </div>
      </section>

      <section className="form-section">
        <h2>Projektin tiedot</h2>
        <div className="line-form-grid">
          <label>
            Projektin tyyppi
            <select
              value={form.projectType}
              onChange={(e) =>
                onChange({ projectType: e.target.value as QuoteRequestData['projectType'] })
              }
              disabled={!canEdit}
            >
              {(Object.keys(QUOTE_PROJECT_TYPE_LABELS) as QuoteRequestData['projectType'][]).map(
                (key) => (
                  <option key={key} value={key}>
                    {QUOTE_PROJECT_TYPE_LABELS[key]}
                  </option>
                ),
              )}
            </select>
          </label>
          <label>
            Rakennusvuosi
            <input
              type="number"
              value={form.buildingYear}
              onChange={(e) => onChange({ buildingYear: Number(e.target.value) })}
              disabled={!canEdit}
            />
          </label>
          {showCurrentHeating && (
            <label>
              Nykyinen lämmitys
              <select
                value={form.currentHeating}
                onChange={(e) => onChange({ currentHeating: e.target.value })}
                disabled={!canEdit}
              >
                {CURRENT_HEATING_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
          )}
          {showOilConsumption && (
            <label>
              Öljyn kulutus (l/v)
              <input
                type="number"
                min="0"
                value={form.previousConsumption || ''}
                onChange={(e) =>
                  onChange({
                    previousConsumption: Number(e.target.value) || 0,
                    previousConsumptionUnit: 'litraa',
                  })
                }
                disabled={!canEdit}
              />
            </label>
          )}
          {showElectricConsumption && (
            <label>
              Sähkön kulutus (kWh/v)
              <input
                type="number"
                min="0"
                value={form.previousConsumption || ''}
                onChange={(e) =>
                  onChange({
                    previousConsumption: Number(e.target.value) || 0,
                    previousConsumptionUnit: 'kwh',
                  })
                }
                disabled={!canEdit}
              />
            </label>
          )}
        </div>
        {showOilExtras && (
          <div className="quote-checkbox-group">
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={form.oilBoilerRemoval}
                onChange={(e) => onChange({ oilBoilerRemoval: e.target.checked })}
                disabled={!canEdit}
              />
              Tarjous sisältää öljykattilan purun
            </label>
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={form.oilTankEmptying}
                onChange={(e) => onChange({ oilTankEmptying: e.target.checked })}
                disabled={!canEdit}
              />
              Tarjous sisältää öljysäiliön tyhjennyksen
            </label>
          </div>
        )}
      </section>

      <section className="form-section">
        <h2>Lämmitysverkosto</h2>
        <div className="line-form-grid">
          <label>
            Lämmitysverkoston tyyppi
            <select
              value={form.heatingSystemType}
              onChange={(e) => {
                const newType = e.target.value;
                let newTemp = form.heatingSystemTemp;
                if (newType === 'lattialammitys_45' || newType === 'patteri_45' || newType === 'monipiirinen') {
                  newTemp = 45;
                } else if (newType === 'patteri_65') {
                  newTemp = 65;
                }
                onChange({ heatingSystemType: newType, heatingSystemTemp: newTemp });
              }}
              disabled={!canEdit}
            >
              {HEATING_SYSTEM_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {form.heatingSystemType === 'monipiirinen'
              ? 'Korkeimman piirin max lämpötila (°C)'
              : 'Lämmityspiirin max lämpötila (°C)'}
            <input
              type="number"
              value={form.heatingSystemTemp}
              onChange={(e) => onChange({ heatingSystemTemp: Number(e.target.value) })}
              disabled={!canEdit}
            />
          </label>
        </div>
      </section>

      <section className="form-section">
        <h2>Käyttöveden lämmitys</h2>
        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={form.domesticHotWater}
            onChange={(e) => onChange({ domesticHotWater: e.target.checked })}
            disabled={!canEdit}
          />
          Käyttöveden lämmitys mukana laskennassa
        </label>
        {form.domesticHotWater && (
          <label>
            Henkilömäärä
            <input
              type="number"
              min="1"
              value={form.householdSize}
              onChange={(e) => onChange({ householdSize: Number(e.target.value) || 1 })}
              disabled={!canEdit}
            />
          </label>
        )}
        <p className="quote-summary-box">
          Laskettu huipputehotarve: <strong>{heatingNeedKw} kW</strong>
        </p>
      </section>
    </>
  );
}
