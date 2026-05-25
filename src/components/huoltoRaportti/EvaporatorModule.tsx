import type {
  EvaporatorData,
  EvaporatorType,
  SahkoJanniteType,
  SulatusOhjausType,
  SulatusType,
} from '../../lib/huoltoRaportti/types';
import { createEmptyEvaporatorFan } from '../../lib/huoltoRaportti/defaults';
import { EvaporatorPuhaltimetFields } from './EvaporatorPuhaltimetFields';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';
import { HuoltoPartSection } from './HuoltoPartSection';

interface Props {
  index: number;
  titleLabel: string;
  data: EvaporatorData;
  locked: boolean;
  showSameAsFirst?: boolean;
  sameAsFirst?: boolean;
  onSameAsFirstChange?: (value: boolean) => void;
  onChange: (data: EvaporatorData) => void;
}

export function EvaporatorModule({
  index,
  titleLabel,
  data,
  locked,
  showSameAsFirst,
  sameAsFirst,
  onSameAsFirstChange,
  onChange,
}: Props) {
  const disabled = locked || !!sameAsFirst;

  return (
    <HuoltoPartSection title={titleLabel} defaultOpen={index === 0}>
      {showSameAsFirst && onSameAsFirstChange && (
        <FormCheckbox
          label={`Piiri ${index + 1}: sama höyrystin kuin piirissä 1 (ei mittauskenttiä)`}
          checked={!!sameAsFirst}
          onChange={onSameAsFirstChange}
        />
      )}

      <div className="line-form-grid">
        <FormInput
          label="Huoneen tunnus"
          value={data.huoneenTunnus || ''}
          onChange={(v) => onChange({ ...data, huoneenTunnus: v })}
          disabled={disabled}
          className="huolto-span-all"
        />
        <label>
          Höyrystimen tyyppi
          <select
            value={data.tyyppi}
            disabled={disabled}
            onChange={(e) =>
              onChange({
                ...data,
                tyyppi: e.target.value as EvaporatorType,
                puhaltimienMaara: 1,
                puhaltimet: [createEmptyEvaporatorFan(1)],
              })
            }
          >
            <option value="staatinen">Staattinen höyrystin</option>
            <option value="puhallin">Puhallinhöyrystin</option>
          </select>
        </label>
        <FormInput
          label="Valmistaja"
          value={data.valmistaja}
          onChange={(v) => onChange({ ...data, valmistaja: v })}
          disabled={disabled}
        />
        <FormInput
          label="Malli"
          value={data.malli}
          onChange={(v) => onChange({ ...data, malli: v })}
          disabled={disabled}
        />
        <FormInput
          label="Sarjanumero"
          value={data.sarjanumero}
          onChange={(v) => onChange({ ...data, sarjanumero: v })}
          disabled={disabled}
        />
        <label>
          Sulatustapa
          <select
            value={data.sulatus}
            disabled={disabled}
            onChange={(e) => onChange({ ...data, sulatus: e.target.value as SulatusType })}
          >
            <option value="ilma">Ilmasulatus</option>
            <option value="sahko">Sähkösulatus</option>
            <option value="kuumakaasu">Kuumakaasu sulatus</option>
          </select>
        </label>

        {data.sulatus === 'sahko' && !sameAsFirst && (
          <>
            <label>
              Jännite
              <select
                value={data.sahkoJannite || '230'}
                onChange={(e) =>
                  onChange({ ...data, sahkoJannite: e.target.value as SahkoJanniteType })
                }
              >
                <option value="230">230 V</option>
                <option value="400">400 V</option>
              </select>
            </label>
            <FormCheckbox
              label="Virrat mitattu"
              checked={data.sahkoVirtaMitattu}
              onChange={(v) => onChange({ ...data, sahkoVirtaMitattu: v })}
            />
            <label className="huolto-span-all">
              Sulatuksen ohjaus
              <select
                value={data.sulatusOhjaus || ''}
                onChange={(e) =>
                  onChange({ ...data, sulatusOhjaus: e.target.value as SulatusOhjausType })
                }
              >
                <option value="">Valitse…</option>
                <option value="huonesäädin">Huonesäädin ohjaa</option>
                <option value="kello">Sulatuskello ohjaa</option>
                <option value="muu">Joku muu</option>
              </select>
            </label>
            {data.sulatusOhjaus === 'muu' && (
              <FormInput
                label="Muu ohjaus"
                value={data.sulatusOhjausMuu || ''}
                onChange={(v) => onChange({ ...data, sulatusOhjausMuu: v })}
                className="huolto-span-all"
              />
            )}
            {data.sulatusOhjaus === 'kello' && (
              <FormInput
                label="Sulatuskellon malli"
                value={data.sulatusKelloMalli || ''}
                onChange={(v) => onChange({ ...data, sulatusKelloMalli: v })}
              />
            )}
            {data.sulatusOhjaus === 'huonesäädin' && (
              <FormInput
                label="Säätimen malli"
                value={data.sulatusSäädinMalli || ''}
                onChange={(v) => onChange({ ...data, sulatusSäädinMalli: v })}
              />
            )}
            <FormInput
              label="Sulatuskertaa/päivä"
              value={data.sulatusKertojaPäivässä || ''}
              onChange={(v) => onChange({ ...data, sulatusKertojaPäivässä: v })}
            />
            <FormInput
              label="Sulatusaika"
              value={data.sulatusAika || ''}
              onChange={(v) => onChange({ ...data, sulatusAika: v })}
            />
            <FormInput
              label="Lopetuslämpötila (°C)"
              value={data.sulatusLopetusLämpötila || ''}
              onChange={(v) => onChange({ ...data, sulatusLopetusLämpötila: v })}
              type="number"
            />
          </>
        )}
      </div>

      {data.sulatus === 'sahko' && data.sahkoVirtaMitattu && !sameAsFirst && (
        <div className="huolto-submodule">
          <h4>Sähkösulatuksen virrat</h4>
          <div className="line-form-grid huolto-phase-grid">
            <FormInput
              label={data.sahkoJannite === '400' ? 'L1 (A)' : 'Virta (A)'}
              value={data.sahkoVirtaL1 || ''}
              onChange={(v) => onChange({ ...data, sahkoVirtaL1: v })}
              type="number"
            />
            {data.sahkoJannite === '400' && (
              <>
                <FormInput
                  label="L2 (A)"
                  value={data.sahkoVirtaL2 || ''}
                  onChange={(v) => onChange({ ...data, sahkoVirtaL2: v })}
                  type="number"
                />
                <FormInput
                  label="L3 (A)"
                  value={data.sahkoVirtaL3 || ''}
                  onChange={(v) => onChange({ ...data, sahkoVirtaL3: v })}
                  type="number"
                />
              </>
            )}
          </div>
        </div>
      )}

      {data.tyyppi === 'puhallin' && !sameAsFirst && (
        <EvaporatorPuhaltimetFields
          puhaltimienMaara={data.puhaltimienMaara}
          puhaltimet={data.puhaltimet || []}
          onChange={(patch) => onChange({ ...data, ...patch })}
        />
      )}
    </HuoltoPartSection>
  );
}
