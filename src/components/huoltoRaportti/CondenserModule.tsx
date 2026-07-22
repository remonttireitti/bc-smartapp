import { lauhdutinTypeOptions, puhallinOhjausOptions, LAUHDUTIN_PAINEVENTTIILI_HELP, LAUHDUTIN_PAINEVENTTIILI_LABEL, LAUHDUTIN_PAINEVENTTIILI_MALLI_LABEL } from '../../lib/huoltoRaportti/constants';
import type { CondenserData, LauhdutinType, PuhallinOhjausType } from '../../lib/huoltoRaportti/types';
import { EvaporatorPuhaltimetFields } from './EvaporatorPuhaltimetFields';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';
import { HuoltoPartSection } from './HuoltoPartSection';

interface Props {
  index: number;
  titleLabel: string;
  data: CondenserData;
  onChange: (data: CondenserData) => void;
}

export function CondenserModule({ index, titleLabel, data, onChange }: Props) {
  const isAirType = data.tyyppi === 'koneseen_integroitu' || data.tyyppi === 'erillinen_ilma';
  const isLiquidType = data.tyyppi === 'nestekiertoinen';

  return (
    <HuoltoPartSection title={titleLabel} partKey={`cond-${index}`} defaultOpen={index === 0}>

      <div className="line-form-grid">
        <label className="huolto-span-all">
          Lauhdutin tyyppi
          <select
            value={data.tyyppi || ''}
            onChange={(e) =>
              onChange({
                ...data,
                tyyppi: (e.target.value || undefined) as LauhdutinType | undefined,
              })
            }
          >
            {lauhdutinTypeOptions.map((opt) => (
              <option key={opt.value || 'empty'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <FormCheckbox
          label="Lauhdutin puhdistettu"
          checked={!!data.lauhdutinPuhdistettu}
          onChange={(checked) => onChange({ ...data, lauhdutinPuhdistettu: checked })}
        />

        {data.lauhdutinPuhdistettu && (
          <FormInput
            label="Puhdistustapa"
            value={data.lauhdutinPuhdistusTapa || ''}
            onChange={(v) => onChange({ ...data, lauhdutinPuhdistusTapa: v })}
            className="huolto-span-all"
          />
        )}
      </div>

      {isAirType && (
        <>
          <div className="line-form-grid">
            <label className="huolto-span-all">
              Puhaltimen ohjaustapa
              <select
                value={data.puhallinOhjaus || ''}
                onChange={(e) =>
                  onChange({
                    ...data,
                    puhallinOhjaus: (e.target.value || undefined) as PuhallinOhjausType | undefined,
                  })
                }
              >
                {puhallinOhjausOptions.map((opt) => (
                  <option key={opt.value || 'empty'} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            {data.puhallinOhjaus === 'muu' && (
              <FormInput
                label="Muu ohjaus"
                value={data.puhallinOhjausMuu || ''}
                onChange={(v) => onChange({ ...data, puhallinOhjausMuu: v })}
                className="huolto-span-all"
              />
            )}

            {data.puhallinOhjaus === 'nopeussäädin' && (
              <FormInput
                label="Nopeussäätimen malli"
                value={data.nopeussäädinMalli || ''}
                onChange={(v) => onChange({ ...data, nopeussäädinMalli: v })}
              />
            )}

            {data.puhallinOhjaus === 'taajusmuuntaja' && (
              <FormInput
                label="Taajusmuuntajan malli"
                value={data.taajusmuuntajaMalli || ''}
                onChange={(v) => onChange({ ...data, taajusmuuntajaMalli: v })}
              />
            )}

            {data.puhallinOhjaus === 'kp_pressostaatti' && (
              <FormInput
                label="KP-pressostaatin malli"
                value={data.kpPressostaattiMalli || ''}
                onChange={(v) => onChange({ ...data, kpPressostaattiMalli: v })}
              />
            )}

            <FormCheckbox
              label="Talvivarustus"
              checked={!!data.talvivarustus}
              onChange={(checked) => onChange({ ...data, talvivarustus: checked })}
            />

            {data.talvivarustus && (
              <FormInput
                label="Talvivarustuksen toteutustapa"
                value={data.talvivarustusTapa || ''}
                onChange={(v) => onChange({ ...data, talvivarustusTapa: v })}
                className="huolto-span-all"
              />
            )}
          </div>

          <EvaporatorPuhaltimetFields
            puhaltimienMaara={data.puhaltimienMaara || 1}
            puhaltimet={data.puhaltimet || []}
            onChange={(patch) =>
              onChange({
                ...data,
                puhaltimienMaara: patch.puhaltimienMaara ?? data.puhaltimienMaara,
                puhaltimet: patch.puhaltimet ?? data.puhaltimet,
              })
            }
          />
        </>
      )}

      {isLiquidType && (
        <div className="huolto-submodule">
          <h4>Nestekiertoinen lauhdutin</h4>
          <p className="muted huolto-help">{LAUHDUTIN_PAINEVENTTIILI_HELP}</p>
          <div className="line-form-grid">
            <FormCheckbox
              label={LAUHDUTIN_PAINEVENTTIILI_LABEL}
              checked={!!data.painesäätimenTarkistettu}
              onChange={(checked) => onChange({ ...data, painesäätimenTarkistettu: checked })}
            />

            {data.painesäätimenTarkistettu && (
              <FormInput
                label={LAUHDUTIN_PAINEVENTTIILI_MALLI_LABEL}
                value={data.painesäätimenMalli || ''}
                onChange={(v) => onChange({ ...data, painesäätimenMalli: v })}
              />
            )}

            <FormCheckbox
              label="Virtaus riittävä"
              checked={data.virtausRiittävä !== false}
              onChange={(checked) => onChange({ ...data, virtausRiittävä: checked })}
            />

            {data.virtausRiittävä === false && (
              <FormInput
                label="Kuvaile virtausongelma"
                value={data.virtausOngelma || ''}
                onChange={(v) => onChange({ ...data, virtausOngelma: v })}
                className="huolto-span-all"
              />
            )}
          </div>
        </div>
      )}
    </HuoltoPartSection>
  );
}
