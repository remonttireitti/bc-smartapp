import type {
  EvaporatorData,
  EvaporatorType,
  SahkoJanniteType,
  SulatusOhjausType,
  SulatusType,
} from '../../lib/huoltoRaportti/types';
import { createEmptyEvaporatorFan } from '../../lib/huoltoRaportti/defaults';
import { isChillerLikeDevice } from '../../lib/huoltoRaportti/deviceModuleLogic';
import {
  evaporatorShowsFansAndDefrost,
  isHeatExchangerEvaporatorType,
} from '../../lib/huoltoRaportti/evaporatorHelpers';
import { EvaporatorPuhaltimetFields } from './EvaporatorPuhaltimetFields';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';
import { HuoltoPartSection } from './HuoltoPartSection';

interface Props {
  index: number;
  titleLabel: string;
  laiteTyyppi?: string;
  data: EvaporatorData;
  locked: boolean;
  showSameAsFirst?: boolean;
  sameAsFirst?: boolean;
  onSameAsFirstChange?: (value: boolean) => void;
  onChange: (data: EvaporatorData) => void;
}

function applyEvaporatorTypeChange(data: EvaporatorData, tyyppi: EvaporatorType): EvaporatorData {
  if (isHeatExchangerEvaporatorType(tyyppi)) {
    return {
      ...data,
      tyyppi,
      puhaltimienMaara: 0,
      puhaltimet: [],
      sulatus: 'ilma',
      sahkoVirtaMitattu: false,
    };
  }
  return {
    ...data,
    tyyppi,
    puhaltimienMaara: 1,
    puhaltimet: [createEmptyEvaporatorFan(1)],
  };
}

export function EvaporatorModule({
  index,
  titleLabel,
  laiteTyyppi = '',
  data,
  locked,
  showSameAsFirst,
  sameAsFirst,
  onSameAsFirstChange,
  onChange,
}: Props) {
  const disabled = locked || !!sameAsFirst;
  const chillerHx = isChillerLikeDevice(laiteTyyppi);
  const showFansDefrost = evaporatorShowsFansAndDefrost(data.tyyppi);
  const selectValue =
    chillerHx && !isHeatExchangerEvaporatorType(data.tyyppi) ? '' : data.tyyppi;

  return (
    <HuoltoPartSection title={titleLabel} partKey={`evap-${index}`} defaultOpen={index === 0}>
      {showSameAsFirst && onSameAsFirstChange && (
        <FormCheckbox
          label={`Piiri ${index + 1}: sama höyrystin kuin piirissä 1 (ei mittauskenttiä)`}
          checked={!!sameAsFirst}
          onChange={onSameAsFirstChange}
        />
      )}

      <div className="line-form-grid">
        {!chillerHx && (
          <FormInput
            label="Huoneen tunnus"
            value={data.huoneenTunnus || ''}
            onChange={(v) => onChange({ ...data, huoneenTunnus: v })}
            disabled={disabled}
            className="huolto-span-all"
          />
        )}
        <label className={chillerHx ? 'huolto-span-all' : undefined}>
          {chillerHx ? 'Lämmönvaihtimen tyyppi' : 'Höyrystimen tyyppi'}
          <select
            value={selectValue}
            disabled={disabled}
            onChange={(e) => {
              const next = e.target.value as EvaporatorType;
              if (!next) return;
              onChange(applyEvaporatorTypeChange(data, next));
            }}
          >
            {chillerHx ? (
              <>
                <option value="" disabled>
                  Valitse…
                </option>
                <option value="levy">Levy lämmönvaihdin</option>
                <option value="putki">Putkilämmönvaihdin</option>
              </>
            ) : (
              <>
                <option value="staatinen">Staattinen höyrystin</option>
                <option value="puhallin">Puhallinhöyrystin</option>
              </>
            )}
          </select>
        </label>
        <FormInput
          label="Valmistaja (valinnainen)"
          value={data.valmistaja}
          onChange={(v) => onChange({ ...data, valmistaja: v })}
          disabled={disabled}
        />
        <FormInput
          label="Malli (valinnainen)"
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

        {showFansDefrost && (
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
        )}

        {showFansDefrost && data.sulatus === 'sahko' && !sameAsFirst && (
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

      {showFansDefrost && data.sulatus === 'sahko' && data.sahkoVirtaMitattu && !sameAsFirst && (
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
