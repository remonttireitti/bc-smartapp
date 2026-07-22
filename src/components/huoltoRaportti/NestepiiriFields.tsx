import {
  LAUHDUTIN_PAINEVENTTIILI_HELP,
  LAUHDUTIN_PAINEVENTTIILI_LABEL,
  LAUHDUTIN_PAINEVENTTIILI_MALLI_LABEL,
  mlpNestOptions,
} from '../../lib/huoltoRaportti/constants';
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
  /** Paine, ilmaus, mutapussi, toimilaitteet (VJ nestepiirit). */
  showPiiriTarkistukset?: boolean;
}

export function NestepiiriFields({ data, onChange, showLauhdutinTarkistukset, showPiiriTarkistukset }: Props) {
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

      {showPiiriTarkistukset && (
        <div className="checkbox-grid huolto-toggle-grid">
          <FormCheckbox
            label="Paine tarkastettu"
            checked={data.paineTarkastettu}
            onChange={(v) => onChange({ paineTarkastettu: v, ...(v ? {} : { paineBar: '' }) })}
          />
          <FormCheckbox
            label="Automaattinen ilmaus tarkistettu"
            checked={data.automaattinenIlmausTarkistettu}
            onChange={(v) => onChange({ automaattinenIlmausTarkistettu: v })}
          />
          <FormCheckbox
            label="Mutapussi puhdistettu"
            checked={data.mutapussiPuhdistettu}
            onChange={(v) => onChange({ mutapussiPuhdistettu: v })}
          />
          <FormCheckbox
            label="Toimilaitteet OK"
            checked={data.toimilaitteetOK}
            onChange={(v) => onChange({ toimilaitteetOK: v })}
          />
        </div>
      )}
      {showPiiriTarkistukset && data.paineTarkastettu && (
        <FormInput
          label="Mitattu paine (bar)"
          value={data.paineBar}
          onChange={(v) => onChange({ paineBar: v })}
          type="number"
        />
      )}

      {lauhdutus && (
        <div className="huolto-submodule">
          <p className="muted huolto-help">{LAUHDUTIN_PAINEVENTTIILI_HELP}</p>
          <div className="line-form-grid">
            <FormCheckbox
              label={LAUHDUTIN_PAINEVENTTIILI_LABEL}
              checked={lauhdutus.painesäätimenTarkistettu}
              onChange={(v) => onChange({ painesäätimenTarkistettu: v })}
            />
            {lauhdutus.painesäätimenTarkistettu && (
              <FormInput
                label={LAUHDUTIN_PAINEVENTTIILI_MALLI_LABEL}
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
