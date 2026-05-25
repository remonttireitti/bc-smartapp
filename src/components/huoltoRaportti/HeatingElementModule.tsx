import type { HeatingElementData } from '../../lib/huoltoRaportti/types';
import { sahkoVastusOhjaustapaOptions } from '../../lib/huoltoRaportti/constants';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';

interface Props {
  index: number;
  data: HeatingElementData;
  onChange: (data: HeatingElementData) => void;
  onRemove: () => void;
}

export function HeatingElementModule({ index, data, onChange, onRemove }: Props) {
  return (
    <div className="huolto-submodule">
      <div className="huolto-circuit-header">
        <h5>Sähkövastus {index + 1}</h5>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRemove}>
          Poista
        </button>
      </div>
      <div className="line-form-grid">
        <FormInput
          label="Tunnus"
          value={data.tunnus}
          onChange={(v) => onChange({ ...data, tunnus: v })}
          placeholder="V1, V2…"
        />
        <FormInput
          label="Teho (kW)"
          value={data.teho}
          onChange={(v) => onChange({ ...data, teho: v })}
          type="number"
        />
        <label>
          Jännite
          <select value={data.jannite} onChange={(e) => onChange({ ...data, jannite: e.target.value })}>
            <option value="">Valitse…</option>
            <option value="230V">230 V</option>
            <option value="400V">400 V</option>
          </select>
        </label>
        <FormInput
          label="Asetusarvo (°C)"
          value={data.asetusarvo}
          onChange={(v) => onChange({ ...data, asetusarvo: v })}
          type="number"
        />
        <label className="huolto-span-all">
          Ohjaustapa
          <select value={data.ohjaustapa} onChange={(e) => onChange({ ...data, ohjaustapa: e.target.value })}>
            {sahkoVastusOhjaustapaOptions.map((opt) => (
              <option key={opt.value || 'empty'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <FormCheckbox
          label="Toiminta testattu"
          checked={data.toimintaTestattu}
          onChange={(v) => onChange({ ...data, toimintaTestattu: v })}
        />
      </div>
    </div>
  );
}
