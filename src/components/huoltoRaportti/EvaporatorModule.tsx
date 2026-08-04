import { useEffect, useState } from 'react';
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
  const status = entityInspectionStatus(data);
  const subtitle = [
    chillerHx ? null : data.huoneenTunnus,
    data.valmistaja,
    data.malli,
  ]
    .map((v) => String(v ?? '').trim())
    .filter(Boolean)
    .join(' · ');

  useEffect(() => {
    if (dialogOpen) setDraft(data);
  }, [dialogOpen, data]);

  useEffect(() => {
    if (!dialogOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setDialogOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dialogOpen]);

  const draftStatus = normalizeHuoltoInspectionStatus(draft.tarkastusTila) ?? entityInspectionStatus(draft);
  const showDetails = draftStatus === 'ok' || draftStatus === 'faulty';
  const showFansDefrost = evaporatorShowsFansAndDefrost(draft.tyyppi);
  const selectValue =
    chillerHx && !isHeatExchangerEvaporatorType(draft.tyyppi) ? '' : draft.tyyppi;

  return (
    <>
      {showSameAsFirst && onSameAsFirstChange ? (
        <FormCheckbox
          label={`Piiri ${index + 1}: sama höyrystin kuin piirissä 1 (ei mittauskenttiä)`}
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

      {dialogOpen ? (
        <div className="leave-draft-overlay konvektori-dialog-overlay" role="presentation" onClick={() => setDialogOpen(false)}>
          <div
            className="leave-draft-dialog panel konvektori-tarkastus-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`evap-dialog-title-${index}`}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id={`evap-dialog-title-${index}`}>{titleLabel}</h2>

            <div className="konvektori-tarkastus-item">
              <span className="konvektori-tarkastus-label">Tarkastuksen tulos</span>
              <TriStateInspectionToggle
                name={`evap-${index}-tila`}
                value={draftStatus}
                onChange={(next) => setDraft((prev) => ({ ...prev, tarkastusTila: next }))}
              />
            </div>

            {showDetails ? (
              <div className="line-form-grid">
                {!chillerHx && (
                  <FormInput
                    label="Huoneen tunnus"
                    value={draft.huoneenTunnus || ''}
                    onChange={(v) => setDraft((prev) => ({ ...prev, huoneenTunnus: v }))}
                    className="huolto-span-all"
                  />
                )}
                <label className={chillerHx ? 'huolto-span-all' : undefined}>
                  {chillerHx ? 'Lämmönvaihtimen tyyppi' : 'Höyrystimen tyyppi'}
                  <select
                    value={selectValue}
                    onChange={(e) => {
                      const next = e.target.value as EvaporatorType;
                      if (!next) return;
                      setDraft((prev) => applyEvaporatorTypeChange(prev, next));
                    }}
                  >
                    {chillerHx ? (
                      <>
                        <option value="" disabled>Valitse…</option>
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
                <FormInput label="Valmistaja" value={draft.valmistaja} onChange={(v) => setDraft((prev) => ({ ...prev, valmistaja: v }))} />
                <FormInput label="Malli" value={draft.malli} onChange={(v) => setDraft((prev) => ({ ...prev, malli: v }))} />
                <FormInput label="Sarjanumero" value={draft.sarjanumero} onChange={(v) => setDraft((prev) => ({ ...prev, sarjanumero: v }))} />

                {showFansDefrost && (
                  <label>
                    Sulatustapa
                    <select
                      value={draft.sulatus}
                      onChange={(e) => setDraft((prev) => ({ ...prev, sulatus: e.target.value as SulatusType }))}
                    >
                      <option value="ilma">Ilmasulatus</option>
                      <option value="sahko">Sähkösulatus</option>
                      <option value="kuumakaasu">Kuumakaasu sulatus</option>
                    </select>
                  </label>
                )}

                {showFansDefrost && draft.sulatus === 'sahko' && (
                  <>
                    <label>
                      Jännite
                      <select
                        value={draft.sahkoJannite || '230'}
                        onChange={(e) =>
                          setDraft((prev) => ({ ...prev, sahkoJannite: e.target.value as SahkoJanniteType }))
                        }
                      >
                        <option value="230">230 V</option>
                        <option value="400">400 V</option>
                      </select>
                    </label>
                    <FormCheckbox
                      label="Virrat mitattu"
                      checked={!!draft.sahkoVirtaMitattu}
                      onChange={(v) => setDraft((prev) => ({ ...prev, sahkoVirtaMitattu: v }))}
                    />
                    <label className="huolto-span-all">
                      Sulatuksen ohjaus
                      <select
                        value={draft.sulatusOhjaus || ''}
                        onChange={(e) =>
                          setDraft((prev) => ({ ...prev, sulatusOhjaus: e.target.value as SulatusOhjausType }))
                        }
                      >
                        <option value="">Valitse…</option>
                        <option value="huonesäädin">Huonesäädin ohjaa</option>
                        <option value="kello">Sulatuskello ohjaa</option>
                        <option value="muu">Joku muu</option>
                      </select>
                    </label>
                    {draft.sulatusOhjaus === 'muu' && (
                      <FormInput
                        label="Muu ohjaus"
                        value={draft.sulatusOhjausMuu || ''}
                        onChange={(v) => setDraft((prev) => ({ ...prev, sulatusOhjausMuu: v }))}
                        className="huolto-span-all"
                      />
                    )}
                    {draft.sulatusOhjaus === 'kello' && (
                      <FormInput
                        label="Sulatuskellon malli"
                        value={draft.sulatusKelloMalli || ''}
                        onChange={(v) => setDraft((prev) => ({ ...prev, sulatusKelloMalli: v }))}
                      />
                    )}
                    {draft.sulatusOhjaus === 'huonesäädin' && (
                      <FormInput
                        label="Säätimen malli"
                        value={draft.sulatusSäädinMalli || ''}
                        onChange={(v) => setDraft((prev) => ({ ...prev, sulatusSäädinMalli: v }))}
                      />
                    )}
                    <FormInput
                      label="Sulatuskertaa/päivä"
                      value={draft.sulatusKertojaPäivässä || ''}
                      onChange={(v) => setDraft((prev) => ({ ...prev, sulatusKertojaPäivässä: v }))}
                    />
                    <FormInput
                      label="Sulatusaika"
                      value={draft.sulatusAika || ''}
                      onChange={(v) => setDraft((prev) => ({ ...prev, sulatusAika: v }))}
                    />
                    <FormInput
                      label="Lopetuslämpötila (°C)"
                      value={draft.sulatusLopetusLämpötila || ''}
                      onChange={(v) => setDraft((prev) => ({ ...prev, sulatusLopetusLämpötila: v }))}
                      type="number"
                    />
                  </>
                )}

                {showFansDefrost && draft.sulatus === 'sahko' && draft.sahkoVirtaMitattu && (
                  <div className="huolto-submodule huolto-span-all">
                    <h4>Sähkösulatuksen virrat</h4>
                    <div className="line-form-grid huolto-phase-grid">
                      <FormInput
                        label={draft.sahkoJannite === '400' ? 'L1 (A)' : 'Virta (A)'}
                        value={draft.sahkoVirtaL1 || ''}
                        onChange={(v) => setDraft((prev) => ({ ...prev, sahkoVirtaL1: v }))}
                        type="number"
                      />
                      {draft.sahkoJannite === '400' && (
                        <>
                          <FormInput label="L2 (A)" value={draft.sahkoVirtaL2 || ''} onChange={(v) => setDraft((prev) => ({ ...prev, sahkoVirtaL2: v }))} type="number" />
                          <FormInput label="L3 (A)" value={draft.sahkoVirtaL3 || ''} onChange={(v) => setDraft((prev) => ({ ...prev, sahkoVirtaL3: v }))} type="number" />
                        </>
                      )}
                    </div>
                  </div>
                )}

                {draft.tyyppi === 'puhallin' && (
                  <div className="huolto-span-all">
                    <EvaporatorPuhaltimetFields
                      puhaltimienMaara={draft.puhaltimienMaara}
                      puhaltimet={draft.puhaltimet || []}
                      onChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
                    />
                  </div>
                )}
              </div>
            ) : null}

            {draftStatus === 'faulty' ? (
              <label className="konvektori-huomio-field">
                <span className="konvektori-tarkastus-label">Mikä on vikana?</span>
                <textarea
                  rows={3}
                  value={draft.tarkastusHuomio ?? ''}
                  onChange={(e) => setDraft((prev) => ({ ...prev, tarkastusHuomio: e.target.value }))}
                />
              </label>
            ) : null}

            <div className="leave-draft-actions konvektori-dialog-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setDialogOpen(false)}>
                Peruuta
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={draftStatus === null}
                onClick={() => {
                  onChange(draft);
                  setDialogOpen(false);
                }}
              >
                Tallenna
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
