import { mlpNestOptions } from '../../lib/huoltoRaportti/constants';
import type { LauhdutuspiiriData, NestepiiriData } from '../../lib/huoltoRaportti/types';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';

type Data = NestepiiriData | LauhdutuspiiriData;

function isLauhdutuspiiri(data: Data): data is LauhdutuspiiriData {
  return 'painesäätimenTarkistettu' in data;
}

interface Props {
  data: Data;
  onChange: (patch: Partial<Data>) => void;
  /** Näytä painesäädin ja virtaus (ulkoinen nestelauhdutin). */
  showLauhdutinTarkistukset?: boolean;
}

export function NestepiiriFields({ data, onChange, showLauhdutinTarkistukset }: Props) {
  const lauhdutus = showLauhdutinTarkistukset && isLauhdutuspiiri(data) ? data : null;

  return (
    <>
      <div className="line-form-grid">
        <label>
          Neste
          <select value={data.neste} onChange={(e) => onChange({ neste: e.target.value })}>
            <option value="">Valitse…</option>
            {mlpNestOptions.map((opt) => (
              <option key={opt.label} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <FormInput label="Virtaus (m³/h)" value={data.virtaus} onChange={(v) => onChange({ virtaus: v })} type="number" />
        <FormInput label="Meno (°C)" value={data.meno} onChange={(v) => onChange({ meno: v })} type="number" />
        <FormInput label="Paluu (°C)" value={data.tulo} onChange={(v) => onChange({ tulo: v })} type="number" />
      </div>

      <FormCheckbox
        label="Pumppu tarkastettu"
        checked={data.pumppuTarkastettu}
        onChange={(v) => onChange({ pumppuTarkastettu: v })}
      />
      {data.pumppuTarkastettu && (
        <div className="line-form-grid">
          <FormInput
            label="Pumpun valmistaja"
            value={data.pumppuValmistaja}
            onChange={(v) => onChange({ pumppuValmistaja: v })}
          />
          <FormInput label="Pumpun malli" value={data.pumppuMalli} onChange={(v) => onChange({ pumppuMalli: v })} />
        </div>
      )}

      <FormCheckbox
        label="Paisunta-astia tarkastettu"
        checked={data.paisuntaAstiaTarkistettu}
        onChange={(v) => onChange({ paisuntaAstiaTarkistettu: v })}
      />
      {data.paisuntaAstiaTarkistettu && (
        <div className="line-form-grid">
          <FormInput
            label="Paisunta-astia koko"
            value={data.paisuntaAstiaKoko}
            onChange={(v) => onChange({ paisuntaAstiaKoko: v })}
            className="huolto-span-all"
          />
          <FormInput
            label="Esipaine (bar)"
            value={data.paisuntaAstiaEsipaine}
            onChange={(v) => onChange({ paisuntaAstiaEsipaine: v })}
            type="number"
          />
        </div>
      )}

      {lauhdutus && (
        <div className="huolto-submodule">
          <div className="line-form-grid">
            <FormCheckbox
              label="Painesäädin tarkistettu"
              checked={lauhdutus.painesäätimenTarkistettu}
              onChange={(v) => onChange({ painesäätimenTarkistettu: v })}
            />
            {lauhdutus.painesäätimenTarkistettu && (
              <FormInput
                label="Painesäätimen malli/koko"
                value={lauhdutus.painesäätimenMalli}
                onChange={(v) => onChange({ painesäätimenMalli: v })}
              />
            )}
            <FormCheckbox
              label="Virtaus riittävä"
              checked={lauhdutus.virtausRiittävä !== false}
              onChange={(v) => onChange({ virtausRiittävä: v, ...(v ? { virtausOngelma: '' } : {}) })}
            />
            {lauhdutus.virtausRiittävä === false && (
              <FormInput
                label="Kuvaile virtausongelma"
                value={lauhdutus.virtausOngelma}
                onChange={(v) => onChange({ virtausOngelma: v })}
                className="huolto-span-all"
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
