import {
  computeIilpCoolingNeedKw,
  computeIilpHeatingNeedKw,
  computeIilpNeedKw,
  effectiveIilpPurpose,
} from '../../lib/quoteRequest/calculations';
import {
  BUILDING_TYPE_OPTIONS,
  IILP_PURPOSE_LABELS,
  QUOTE_REGION_LABELS,
} from '../../lib/quoteRequest/constants';
import type { QuoteRequestData } from '../../lib/quoteRequest/types';
import QuoteIilpOptionsSection from './QuoteIilpOptionsSection';

type Props = {
  form: QuoteRequestData;
  canEdit: boolean;
  onChange: (patch: Partial<QuoteRequestData>) => void;
};

export default function QuoteIilpSiteSection({ form, canEdit, onChange }: Props) {
  const purpose = effectiveIilpPurpose(form);
  const heatingKw = computeIilpHeatingNeedKw(form);
  const coolingKw = computeIilpCoolingNeedKw(form);
  const needKw = computeIilpNeedKw(form);

  return (
    <>
      <section className="form-section">
        <h2>Kohteen tiedot</h2>
        <p className="muted">
          Ilmalämpöpumpun tarjous perustuu vaikutusalueeseen, huonekorkeuteen ja käyttötarkoitukseen — ei
          lämmitysverkostoon tai käyttöveteen.
        </p>
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
            Ilmalämpöpumpun vaikutusalue (m²)
            <input
              type="number"
              min="0"
              value={form.heatedArea}
              onChange={(e) => onChange({ heatedArea: Number(e.target.value) })}
              disabled={!canEdit}
            />
            <span className="muted field-hint">
              Alue, johon pumpun ilma pääsee kiertämään (esim. olohuone + avoin käytävä).
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
            {form.buildingType === 'kerrostalo' && (
              <span className="muted field-hint">Kerrostalo: oletuksena jäähdytys / viilennys.</span>
            )}
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
            <span className="muted field-hint">Poikkeava korkeus vaikuttaa tilavuusmitoitukseen.</span>
          </label>
        </div>

        <div className="quote-summary-box">
          <p className="muted">
            Käyttötarkoitus: <strong>{IILP_PURPOSE_LABELS[purpose]}</strong> • Vaikutusalue:{' '}
            <strong>{form.heatedArea || 0} m²</strong> • Huonekorkeus:{' '}
            <strong>{form.roomHeight || 2.5} m</strong>
          </p>
          {purpose === 'cooling_heating' ? (
            <p>
              Lämmitystarve (arvio): <strong>{heatingKw} kW</strong> • Jäähdytystarve (arvio):{' '}
              <strong>{coolingKw} kW</strong> • Mitoitus: <strong>{needKw} kW</strong>
            </p>
          ) : (
            <p>
              Tavoiteteho (jäähdytys): <strong>{needKw} kW</strong>
            </p>
          )}
        </div>
      </section>

      <QuoteIilpOptionsSection form={form} canEdit={canEdit} onChange={onChange} />
    </>
  );
}
