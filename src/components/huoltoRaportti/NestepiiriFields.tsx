import {
  LAUHDUTIN_PAINEVENTTIILI_HELP,
  LAUHDUTIN_PAINEVENTTIILI_LABEL,
  LAUHDUTIN_PAINEVENTTIILI_MALLI_LABEL,
  mlpNestOptions,
} from '../../lib/huoltoRaportti/constants';
import type { LauhdutuspiiriData, NestepiiriData } from '../../lib/huoltoRaportti/types';
import { useHuoltoPrintFormLayout } from '../../hooks/useHuoltoPrintFormLayout';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';
import {
  PrintCheckField,
  PrintFieldGrid,
  PrintGridField,
  PrintSelectInput,
  PrintTextInput,
} from './print/MaintenancePrintLayout';

type Data = NestepiiriData | LauhdutuspiiriData;

function isLauhdutuspiiri(data: Data): data is LauhdutuspiiriData {
  return 'painesäätimenTarkistettu' in data;
}

interface Props {
  data: Data;
  onChange: (patch: Partial<Data>) => void;
  showLauhdutinTarkistukset?: boolean;
  showPiiriTarkistukset?: boolean;
}

export function NestepiiriFields({ data, onChange, showLauhdutinTarkistukset, showPiiriTarkistukset }: Props) {
  const printLayout = useHuoltoPrintFormLayout();
  const lauhdutus = showLauhdutinTarkistukset && isLauhdutuspiiri(data) ? data : null;

  if (printLayout) {
    return (
      <>
        <PrintFieldGrid columns={3}>
          <PrintGridField label="Neste">
            <PrintSelectInput value={data.neste} onChange={(value) => onChange({ neste: value })}>
              <option value="">Valitse…</option>
              {mlpNestOptions.map((opt) => (
                <option key={opt.label} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </PrintSelectInput>
          </PrintGridField>
          <PrintGridField label="Virtaus (m³/h)">
            <PrintTextInput
              type="number"
              value={data.virtaus}
              onChange={(v) => onChange({ virtaus: v })}
            />
          </PrintGridField>
          <PrintGridField label="Meno (°C)">
            <PrintTextInput type="number" value={data.meno} onChange={(v) => onChange({ meno: v })} />
          </PrintGridField>
          <PrintGridField label="Paluu (°C)">
            <PrintTextInput type="number" value={data.tulo} onChange={(v) => onChange({ tulo: v })} />
          </PrintGridField>
        </PrintFieldGrid>

        <PrintCheckField
          label="Pumppu tarkastettu"
          checked={Boolean(data.pumppuTarkastettu)}
          onChange={(v) => onChange({ pumppuTarkastettu: v })}
        />
        {data.pumppuTarkastettu ? (
          <PrintFieldGrid columns={2}>
            <PrintGridField label="Pumpun valmistaja">
              <PrintTextInput
                value={data.pumppuValmistaja}
                onChange={(v) => onChange({ pumppuValmistaja: v })}
              />
            </PrintGridField>
            <PrintGridField label="Pumpun malli">
              <PrintTextInput value={data.pumppuMalli} onChange={(v) => onChange({ pumppuMalli: v })} />
            </PrintGridField>
          </PrintFieldGrid>
        ) : null}

        <PrintCheckField
          label="Paisunta-astia tarkastettu"
          checked={Boolean(data.paisuntaAstiaTarkistettu)}
          onChange={(v) => onChange({ paisuntaAstiaTarkistettu: v })}
        />
        {data.paisuntaAstiaTarkistettu ? (
          <PrintFieldGrid columns={2}>
            <PrintGridField label="Paisunta-astia koko" className="huolto-span-all">
              <PrintTextInput
                value={data.paisuntaAstiaKoko}
                onChange={(v) => onChange({ paisuntaAstiaKoko: v })}
              />
            </PrintGridField>
            <PrintGridField label="Esipaine (bar)">
              <PrintTextInput
                type="number"
                value={data.paisuntaAstiaEsipaine}
                onChange={(v) => onChange({ paisuntaAstiaEsipaine: v })}
              />
            </PrintGridField>
          </PrintFieldGrid>
        ) : null}

        {showPiiriTarkistukset ? (
          <>
            <PrintCheckField
              label="Paine tarkastettu"
              checked={Boolean(data.paineTarkastettu)}
              onChange={(v) => onChange({ paineTarkastettu: v, ...(v ? {} : { paineBar: '' }) })}
            />
            <PrintCheckField
              label="Automaattinen ilmaus tarkistettu"
              checked={Boolean(data.automaattinenIlmausTarkistettu)}
              onChange={(v) => onChange({ automaattinenIlmausTarkistettu: v })}
            />
            <PrintCheckField
              label="Mutapussi puhdistettu"
              checked={Boolean(data.mutapussiPuhdistettu)}
              onChange={(v) => onChange({ mutapussiPuhdistettu: v })}
            />
            <PrintCheckField
              label="Toimilaitteet OK"
              checked={Boolean(data.toimilaitteetOK)}
              onChange={(v) => onChange({ toimilaitteetOK: v })}
            />
            {data.paineTarkastettu ? (
              <PrintGridField label="Mitattu paine (bar)">
                <PrintTextInput
                  type="number"
                  value={data.paineBar}
                  onChange={(v) => onChange({ paineBar: v })}
                />
              </PrintGridField>
            ) : null}
          </>
        ) : null}

        {lauhdutus ? (
          <div className="huolto-print-subsection">
            <p className="muted huolto-help">{LAUHDUTIN_PAINEVENTTIILI_HELP}</p>
            <PrintCheckField
              label={LAUHDUTIN_PAINEVENTTIILI_LABEL}
              checked={Boolean(lauhdutus.painesäätimenTarkistettu)}
              onChange={(v) => onChange({ painesäätimenTarkistettu: v })}
            />
            {lauhdutus.painesäätimenTarkistettu ? (
              <PrintGridField label={LAUHDUTIN_PAINEVENTTIILI_MALLI_LABEL}>
                <PrintTextInput
                  value={lauhdutus.painesäätimenMalli}
                  onChange={(v) => onChange({ painesäätimenMalli: v })}
                />
              </PrintGridField>
            ) : null}
            <PrintCheckField
              label="Virtaus riittävä"
              checked={lauhdutus.virtausRiittävä !== false}
              onChange={(v) => onChange({ virtausRiittävä: v, ...(v ? { virtausOngelma: '' } : {}) })}
            />
            {lauhdutus.virtausRiittävä === false ? (
              <PrintGridField label="Kuvaile virtausongelma" className="huolto-span-all">
                <PrintTextInput
                  value={lauhdutus.virtausOngelma}
                  onChange={(v) => onChange({ virtausOngelma: v })}
                />
              </PrintGridField>
            ) : null}
          </div>
        ) : null}
      </>
    );
  }

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
