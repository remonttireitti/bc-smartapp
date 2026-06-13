import {
  computeIilpCoolingNeedKw,
  computeIilpHeatingNeedKw,
  computeIilpNeedKw,
  computeIilpVolumeM3,
  effectiveIilpPurpose,
  IILP_COOLING_W_PER_M3,
  iilpHeatingWPerM3ForRegion,
} from '../../lib/quoteRequest/calculations';
import { IILP_PURPOSE_LABELS } from '../../lib/quoteRequest/constants';
import type { QuoteRequestData } from '../../lib/quoteRequest/types';
import QuoteIilpOptionsSection from './QuoteIilpOptionsSection';

type Props = {
  form: QuoteRequestData;
  canEdit: boolean;
  onChange: (patch: Partial<QuoteRequestData>) => void;
};

export default function QuoteIilpSiteSection({ form, canEdit, onChange }: Props) {
  const purpose = effectiveIilpPurpose(form);
  const volumeM3 = computeIilpVolumeM3(form);
  const heatingKw = computeIilpHeatingNeedKw(form);
  const coolingKw = computeIilpCoolingNeedKw(form);
  const needKw = computeIilpNeedKw(form);
  const heatingWPerM3 = iilpHeatingWPerM3ForRegion(form.region);

  return (
    <>
      <section className="form-section">
        <h2>Mitoitus</h2>
        <p className="muted">
          Teholaskenta perustuu vaikutusalueen tilavuuteen (m² × huonekorkeus), käyttötarkoitukseen ja
          sijaintiin. Tällä välilehdellä ei ole hintatietoja — vain mitoitus ja asennustapa.
        </p>
        <div className="quote-field-grid">
          <label>
            Ilmalämpöpumpun vaikutusalue (m²)
            <input
              type="number"
              min="0"
              value={form.heatedArea}
              onChange={(e) => onChange({ heatedArea: Number(e.target.value) })}
              disabled={!canEdit}
            />
          </label>
          <label>
            Huonekorkeus (m)
            <input
              type="number"
              min="2"
              step="0.1"
              value={form.roomHeight}
              onChange={(e) => onChange({ roomHeight: Number(e.target.value) || 2.5 })}
              disabled={!canEdit}
            />
          </label>
          <label>
            Käyttötarkoitus
            <select
              value={form.buildingType === 'kerrostalo' ? 'cooling' : form.iilpPurpose}
              disabled={!canEdit || form.buildingType === 'kerrostalo'}
              onChange={(e) =>
                onChange({ iilpPurpose: e.target.value as QuoteRequestData['iilpPurpose'] })
              }
            >
              {(Object.keys(IILP_PURPOSE_LABELS) as QuoteRequestData['iilpPurpose'][]).map((key) => (
                <option key={key} value={key}>
                  {IILP_PURPOSE_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted field-hint-block">
          Vaikutusalue = alue, johon pumpun ilma pääsee kiertämään (esim. olohuone + avoin käytävä).
          {form.buildingType === 'kerrostalo' && ' Kerrostalo: oletuksena jäähdytys / viilennys.'}
        </p>

        <div className="quote-summary-box">
          <p className="muted">
            Tilavuus: <strong>{volumeM3} m³</strong> ({form.heatedArea || 0} m² × {form.roomHeight || 2.5} m) •
            Käyttötarkoitus: <strong>{IILP_PURPOSE_LABELS[purpose]}</strong> • Sijainti:{' '}
            <strong>{form.region === 'pohjois' ? 'Pohjois-Suomi' : form.region === 'etela' ? 'Etelä-Suomi' : 'Keskisuomi'}</strong>
          </p>
          {purpose === 'cooling_heating' ? (
            <>
              <p>
                Lämmitys: {volumeM3} m³ × {heatingWPerM3.toFixed(1)} W/m³ ={' '}
                <strong>{heatingKw} kW</strong>
              </p>
              <p>
                Jäähdytys: {volumeM3} m³ × {IILP_COOLING_W_PER_M3.toFixed(1)} W/m³ ={' '}
                <strong>{coolingKw} kW</strong>
              </p>
              <p>
                Mitoitusteho: <strong>{needKw} kW</strong> (suurempi tarpeista)
              </p>
            </>
          ) : (
            <p>
              Jäähdytys: {volumeM3} m³ × {IILP_COOLING_W_PER_M3.toFixed(1)} W/m³ ={' '}
              <strong>{needKw} kW</strong>
            </p>
          )}
        </div>
      </section>

      <section className="form-section">
        <h2>Kohteen asennustiedot</h2>
        <p className="muted">
          Kohdekohtaiset tiedot näkyvät tarjouksen tulosteessa. Täytä ne, jotta tarjous näyttää yksilölliseltä.
        </p>
        <div className="quote-field-grid">
          <label>
            Sisäyksikön sijainti
            <input
              value={form.iilpIndoorPlacement}
              onChange={(e) => onChange({ iilpIndoorPlacement: e.target.value })}
              disabled={!canEdit}
              placeholder="Esim. olohuoneeseen"
            />
          </label>
          <label>
            Ulkoyksikön sijainti
            <input
              value={form.iilpOutdoorPlacement}
              onChange={(e) => onChange({ iilpOutdoorPlacement: e.target.value })}
              disabled={!canEdit}
              placeholder="Esim. maatelineelle"
            />
          </label>
          <label>
            Putkitus (m)
            <input
              type="number"
              min="0"
              step="0.5"
              value={form.iilpPipeLengthM || ''}
              onChange={(e) => onChange({ iilpPipeLengthM: Number(e.target.value) || 0 })}
              disabled={!canEdit}
              placeholder="Esim. 4"
            />
          </label>
          <label>
            Sähkösyöttö / liitäntä
            <input
              value={form.iilpElectricalNotes}
              onChange={(e) => onChange({ iilpElectricalNotes: e.target.value })}
              disabled={!canEdit}
              placeholder="Esim. olemassa olevasta turvakytkimestä"
            />
          </label>
          <label className="quote-field-grid-span-2">
            Kondenssiveden johto
            <input
              value={form.iilpCondensateNotes}
              onChange={(e) => onChange({ iilpCondensateNotes: e.target.value })}
              disabled={!canEdit}
              placeholder="Esim. johdetaan ulos"
            />
          </label>
        </div>
      </section>

      <QuoteIilpOptionsSection form={form} canEdit={canEdit} onChange={onChange} />
    </>
  );
}
