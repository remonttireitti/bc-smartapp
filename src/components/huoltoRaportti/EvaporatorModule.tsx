import { useCallback, useEffect, useState } from 'react';
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
import {
  entityInspectionStatus,
  normalizeHuoltoInspectionStatus,
} from '../../lib/huoltoRaportti/huoltoInspectionStatus';
import { EvaporatorPuhaltimetFields } from './EvaporatorPuhaltimetFields';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';
import { HuoltoPartInspectionRow } from './HuoltoPartInspectionRow';
import { HuoltoInspectionDialogShell } from './HuoltoInspectionDialogShell';
import { TriStateInspectionToggle } from './TriStateInspectionToggle';

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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState(data);
  const disabled = locked || !!sameAsFirst;
  const chillerHx = isChillerLikeDevice(laiteTyyppi);
  const isVak = laiteTyyppi === 'vakioilmastointtikone';
  const status = entityInspectionStatus(data);
  const subtitle = [
    chillerHx ? null : data.huoneenTunnus,
    data.valmistaja,
    data.malli,
  ]
    .map((v) => String(v ?? '').trim())
    .filter(Boolean)
    .join(' Â· ');

  useEffect(() => {
    if (dialogOpen) setDraft(data);
  }, [dialogOpen, data]);

  const draftStatus = normalizeHuoltoInspectionStatus(draft.tarkastusTila) ?? entityInspectionStatus(draft);
  const showDetails = draftStatus === 'ok' || draftStatus === 'faulty';

  const closeDialog = useCallback(() => {
    const status = normalizeHuoltoInspectionStatus(draft.tarkastusTila) ?? entityInspectionStatus(draft);
    if (status !== null) onChange(draft);
    setDialogOpen(false);
  }, [draft, onChange]);

  const renderFormBody = (
    source: EvaporatorData,
    setSource: (updater: EvaporatorData | ((prev: EvaporatorData) => EvaporatorData)) => void,
    sourceStatus: ReturnType<typeof normalizeHuoltoInspectionStatus>,
  ) => {
    const detailsVisible = sourceStatus === 'ok' || sourceStatus === 'faulty';
    const fansDefrost = evaporatorShowsFansAndDefrost(source.tyyppi);
    const selectVal =
      chillerHx && !isHeatExchangerEvaporatorType(source.tyyppi) && source.tyyppi !== 'suorahoyrystin'
        ? ''
        : source.tyyppi;

    return (
      <>
        {detailsVisible ? (
          <div className="line-form-grid">
            {!chillerHx && (
              <FormInput
                label="Huoneen tunnus"
                value={source.huoneenTunnus || ''}
                onChange={(v) => setSource((prev) => ({ ...prev, huoneenTunnus: v }))}
                className="huolto-span-all"
                disabled={disabled}
              />
            )}
            <label className={chillerHx ? 'huolto-span-all' : undefined}>
              {chillerHx ? 'LÃ¤mmÃ¶nvaihtimen tyyppi' : 'HÃ¶yrystimen tyyppi'}
              <select
                value={selectVal}
                disabled={disabled}
                onChange={(e) => {
                  const next = e.target.value as EvaporatorType;
                  if (!next) return;
                  setSource((prev) => applyEvaporatorTypeChange(prev, next));
                }}
              >
                {chillerHx ? (
                  <>
                    <option value="" disabled>Valitseâ€¦</option>
                    <option value="levy">Levy lÃ¤mmÃ¶nvaihdin</option>
                    <option value="putki">PutkilÃ¤mmÃ¶nvaihdin</option>
                    {isVak ? <option value="suorahoyrystin">SuorahÃ¶yrystin</option> : null}
                  </>
                ) : (
                  <>
                    <option value="staatinen">Staattinen hÃ¶yrystin</option>
                    <option value="puhallin">PuhallinhÃ¶yrystin</option>
                  </>
                )}
              </select>
            </label>
            <FormInput label="Valmistaja" value={source.valmistaja} disabled={disabled} onChange={(v) => setSource((prev) => ({ ...prev, valmistaja: v }))} />
            <FormInput label="Malli" value={source.malli} disabled={disabled} onChange={(v) => setSource((prev) => ({ ...prev, malli: v }))} />
            <FormInput label="Sarjanumero" value={source.sarjanumero} disabled={disabled} onChange={(v) => setSource((prev) => ({ ...prev, sarjanumero: v }))} />

            {fansDefrost && (
              <label>
                Sulatustapa
                <select
                  value={source.sulatus}
                  disabled={disabled}
                  onChange={(e) => setSource((prev) => ({ ...prev, sulatus: e.target.value as SulatusType }))}
                >
                  <option value="ilma">Ilmasulatus</option>
                  <option value="sahko">SÃ¤hkÃ¶sulatus</option>
                  <option value="kuumakaasu">Kuumakaasu sulatus</option>
                </select>
              </label>
            )}

            {fansDefrost && source.sulatus === 'sahko' && (
              <>
                <label>
                  JÃ¤nnite
                  <select
                    value={source.sahkoJannite || '230'}
                    disabled={disabled}
                    onChange={(e) =>
                      setSource((prev) => ({ ...prev, sahkoJannite: e.target.value as SahkoJanniteType }))
                    }
                  >
                    <option value="230">230 V</option>
                    <option value="400">400 V</option>
                  </select>
                </label>
                <FormCheckbox
                  label="Virrat mitattu"
                  checked={!!source.sahkoVirtaMitattu}
                  disabled={disabled}
                  onChange={(v) => setSource((prev) => ({ ...prev, sahkoVirtaMitattu: v }))}
                />
                <label className="huolto-span-all">
                  Sulatuksen ohjaus
                  <select
                    value={source.sulatusOhjaus || ''}
                    disabled={disabled}
                    onChange={(e) =>
                      setSource((prev) => ({ ...prev, sulatusOhjaus: e.target.value as SulatusOhjausType }))
                    }
                  >
                    <option value="">Valitseâ€¦</option>
                    <option value="huonesäädin">Huonesäädin ohjaa</option>
                    <option value="kello">Sulatuskello ohjaa</option>
                    <option value="muu">Joku muu</option>
                  </select>
                </label>
                {source.sulatusOhjaus === 'muu' && (
                  <FormInput
                    label="Muu ohjaus"
                    value={source.sulatusOhjausMuu || ''}
                    disabled={disabled}
                    onChange={(v) => setSource((prev) => ({ ...prev, sulatusOhjausMuu: v }))}
                    className="huolto-span-all"
                  />
                )}
                {source.sulatusOhjaus === 'kello' && (
                  <FormInput
                    label="Sulatuskellon malli"
                    value={source.sulatusKelloMalli || ''}
                    disabled={disabled}
                    onChange={(v) => setSource((prev) => ({ ...prev, sulatusKelloMalli: v }))}
                  />
                )}
                {source.sulatusOhjaus === 'huonesäädin' && (
                  <FormInput
                    label="Säätimen malli"
                    value={source.sulatusSäädinMalli || ''}
                    disabled={disabled}
                    onChange={(v) => setSource((prev) => ({ ...prev, sulatusSäädinMalli: v }))}
                  />
                )}
                <FormInput
                  label="Sulatuskertaa/päivä"
                  value={source.sulatusKertojaPäivässä || ''}
                  disabled={disabled}
                  onChange={(v) => setSource((prev) => ({ ...prev, sulatusKertojaPäivässä: v }))}
                />
                <FormInput
                  label="Sulatusaika"
                  value={source.sulatusAika || ''}
                  disabled={disabled}
                  onChange={(v) => setSource((prev) => ({ ...prev, sulatusAika: v }))}
                />
                <FormInput
                  label="Lopetuslämpötila (°C)"
                  value={source.sulatusLopetusLämpötila || ''}
                  disabled={disabled}
                  onChange={(v) => setSource((prev) => ({ ...prev, sulatusLopetusLämpötila: v }))}
                  type="number"
                />
              </>
            )}

            {fansDefrost && source.sulatus === 'sahko' && source.sahkoVirtaMitattu && (
              <div className="huolto-submodule huolto-span-all">
                <h4>SÃ¤hkÃ¶sulatuksen virrat</h4>
                <div className="line-form-grid huolto-phase-grid">
                  <FormInput
                    label={source.sahkoJannite === '400' ? 'L1 (A)' : 'Virta (A)'}
                    value={source.sahkoVirtaL1 || ''}
                    disabled={disabled}
                    onChange={(v) => setSource((prev) => ({ ...prev, sahkoVirtaL1: v }))}
                    type="number"
                  />
                  {source.sahkoJannite === '400' && (
                    <>
                      <FormInput label="L2 (A)" value={source.sahkoVirtaL2 || ''} disabled={disabled} onChange={(v) => setSource((prev) => ({ ...prev, sahkoVirtaL2: v }))} type="number" />
                      <FormInput label="L3 (A)" value={source.sahkoVirtaL3 || ''} disabled={disabled} onChange={(v) => setSource((prev) => ({ ...prev, sahkoVirtaL3: v }))} type="number" />
                    </>
                  )}
                </div>
              </div>
            )}

            {source.tyyppi === 'puhallin' && (
              <div className="huolto-span-all">
                <EvaporatorPuhaltimetFields
                  puhaltimienMaara={source.puhaltimienMaara}
                  puhaltimet={source.puhaltimet || []}
                  onChange={(patch) => setSource((prev) => ({ ...prev, ...patch }))}
                />
              </div>
            )}
          </div>
        ) : null}

        {sourceStatus === 'faulty' ? (
          <label className="konvektori-huomio-field">
            <span className="konvektori-tarkastus-label">MikÃ¤ on vikana?</span>
            <textarea
              rows={3}
              value={source.tarkastusHuomio ?? ''}
              disabled={disabled}
              onChange={(e) => setSource((prev) => ({ ...prev, tarkastusHuomio: e.target.value }))}
            />
          </label>
        ) : null}
      </>
    );
  };

  return (
    <>
      {showSameAsFirst && onSameAsFirstChange ? (
        <FormCheckbox
          label={`Piiri ${index + 1}: sama hÃ¶yrystin kuin piirissÃ¤ 1 (ei mittauskenttiÃ¤)`}
          checked={!!sameAsFirst}
          onChange={onSameAsFirstChange}
        />
      ) : null}

      <HuoltoPartInspectionRow
        title={titleLabel}
        subtitle={subtitle || undefined}
        status={status}
        disabled={disabled}
        onInspect={() => setDialogOpen(true)}
      />

      <HuoltoInspectionDialogShell
        open={dialogOpen}
        title={titleLabel}
        titleId={`evap-dialog-title-${index}`}
        onClose={closeDialog}
      >
        <div className="konvektori-tarkastus-item">
          <span className="konvektori-tarkastus-label">Tarkastuksen tulos</span>
          <TriStateInspectionToggle
            name={`evap-${index}-tila`}
            value={draftStatus}
            disabled={disabled}
            onChange={(next) => setDraft((prev) => ({ ...prev, tarkastusTila: next }))}
          />
        </div>

        {showDetails ? renderFormBody(draft, setDraft, draftStatus) : null}
      </HuoltoInspectionDialogShell>
    </>
  );
}
