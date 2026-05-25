import {
  computeIilpCoolingNeedKw,
  computeIilpHeatingNeedKw,
  computeIilpNeedKw,
  effectiveIilpPurpose,
} from '../../lib/quoteRequest/calculations';
import { IILP_PURPOSE_LABELS, VILP_BRAND_OPTIONS } from '../../lib/quoteRequest/constants';
import type { QuoteRequestData } from '../../lib/quoteRequest/types';

type Props = {
  form: QuoteRequestData;
  canEdit: boolean;
  onChange: (patch: Partial<QuoteRequestData>) => void;
};

export default function QuoteIilpConfigSection({ form, canEdit, onChange }: Props) {
  const purpose = effectiveIilpPurpose(form);
  const heatingKw = computeIilpHeatingNeedKw(form);
  const coolingKw = computeIilpCoolingNeedKw(form);
  const needKw = computeIilpNeedKw(form);

  return (
    <section className="form-section">
      <h2>Laitevalinta</h2>
      <div className="panel-inset quote-iilp-sizing">
        <p className="muted">
          Käyttötarkoitus: <strong>{IILP_PURPOSE_LABELS[purpose]}</strong> • Vaikutusalue:{' '}
          <strong>{form.heatedArea || 0} m²</strong> • Huonekorkeus:{' '}
          <strong>{form.roomHeight || 2.5} m</strong>
        </p>
        {purpose === 'cooling_heating' ? (
          <p>
            Lämmitystarve: <strong>{heatingKw} kW</strong> • Jäähdytystarve: <strong>{coolingKw} kW</strong> •
            Mitoitus: <strong>{needKw} kW</strong>
          </p>
        ) : (
          <p>
            Tavoiteteho (jäähdytys): <strong>{needKw} kW</strong>
          </p>
        )}
        <p className="muted">
          Valitse ensin valmistaja, sitten laite A/B/C -vaihtoehdoista alla.
        </p>
      </div>
      <label>
        Valmistaja
        <select
          value={form.vilpBrandChoice}
          disabled={!canEdit}
          onChange={(e) =>
            onChange({
              vilpBrandChoice: e.target.value as QuoteRequestData['vilpBrandChoice'],
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
      {!form.vilpBrandChoice && (
        <p className="muted">
          Valitse valmistaja nähdäksesi suodatetun ilmalämpöpumppulistan.
        </p>
      )}
      {form.vilpBrandChoice && form.buildingType === 'kerrostalo' && (
        <p className="muted quote-kerrostalo-note">
          Kerrostalossa näytetään oletuksena jäähdytykseen sopivat mallit.
        </p>
      )}
    </section>
  );
}
