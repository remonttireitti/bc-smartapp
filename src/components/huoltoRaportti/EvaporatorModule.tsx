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
import { isKylmioDevice } from '../../lib/huoltoRaportti/deviceKokoonpano';
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
import { useRegisterHuoltoModuleDialog } from './HuoltoModuleDialogContext';
import { TriStateInspectionToggle } from './TriStateInspectionToggle';
import { airCapacity, staticEvaporatorEstimate, staticInput } from '../../lib/huoltoRaportti/airCapacity';
import { AirCapacityResultView, StaticCapacityResultView } from './CapacityResult';

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
  /** Dokumenttinäkymä: rekisteröi yksikön popup avattavaksi ruudukkokortista. */
  documentUnitKey?: string;
  hidePartRow?: boolean;
  /** Kylmiö: ohjaus on yhteinen (Ohjaukset-vaiheessa) → ei höyrystinkohtaista ohjausta. */
  ohjausShared?: boolean;
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
  documentUnitKey,
  hidePartRow = false,
  ohjausShared = true,
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
    .join(' · ');

  useEffect(() => {
    if (dialogOpen) setDraft(data);
  }, [dialogOpen, data]);

  const draftStatus = normalizeHuoltoInspectionStatus(draft.tarkastusTila) ?? entityInspectionStatus(draft);

  const closeDialog = useCallback(() => {
    onChange(draft);
    setDialogOpen(false);
  }, [draft, onChange]);

  const openDialog = useCallback(() => {
    setDialogOpen(true);
  }, []);

  useRegisterHuoltoModuleDialog(documentUnitKey, openDialog);

  const renderFormBody = (
    source: EvaporatorData,
    setSource: (updater: EvaporatorData | ((prev: EvaporatorData) => EvaporatorData)) => void,
    sourceStatus: ReturnType<typeof normalizeHuoltoInspectionStatus>,
  ) => {
    const detailsVisible = true;
    const showOwnOhjaus = isKylmioDevice(laiteTyyppi) && !ohjausShared;
    const on = (v: boolean | undefined) => v !== false;
    const set = (patch: Partial<EvaporatorData>) => setSource((prev) => ({ ...prev, ...patch }));
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
            {chillerHx ? (
            <label className="huolto-span-all">
              Lämmönvaihtimen tyyppi
              <select
                value={selectVal}
                disabled={disabled}
                onChange={(e) => {
                  const next = e.target.value as EvaporatorType;
                  if (!next) return;
                  setSource((prev) => applyEvaporatorTypeChange(prev, next));
                }}
              >
                <option value="" disabled>Valitse…</option>
                <option value="levy">Levy lämmönvaihdin</option>
                <option value="putki">Putkilämmönvaihdin</option>
                {isVak ? <option value="suorahoyrystin">Suorahöyrystin</option> : null}
              </select>
            </label>
            ) : (
              <div className="huolto-span-all">
                <span className="konvektori-tarkastus-label">Höyrystimen tyyppi</span>
                <div className="konvektori-yesno" role="group" aria-label="Höyrystimen tyyppi">
                  {([['puhallin', 'Puhallin'], ['staatinen', 'Staattinen']] as const).map(([v, l]) => (
                    <button
                      key={v}
                      type="button"
                      className={`konvektori-yesno-btn${source.tyyppi === v ? ' konvektori-yesno-btn--active konvektori-yesno-btn--yes' : ''}`}
                      aria-pressed={source.tyyppi === v}
                      disabled={disabled}
                      onClick={() => { if (source.tyyppi !== v) setSource((prev) => applyEvaporatorTypeChange(prev, v)); }}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
                  <option value="sahko">Sähkösulatus</option>
                  <option value="kuumakaasu">Kuumakaasu sulatus</option>
                </select>
              </label>
            )}

            {fansDefrost && source.sulatus === 'sahko' && (
              <>
                <label>
                  Jännite
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
                    <option value="">Valitse…</option>
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
                <h4>Sähkösulatuksen virrat</h4>
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

            {!chillerHx && (
              <>
                <div className="huolto-submodule huolto-span-all">
                  <h4>Mittaukset</h4>
                  <div className="line-form-grid">
                    {source.tyyppi === 'staatinen' ? (
                      <>
                        <FormInput label="Huoneen lämpötila (°C)" type="number" value={source.kylmioLampotila || ''} disabled={disabled} onChange={(v) => set({ kylmioLampotila: v })} />
                        <FormInput label="Kennon lämpötila (°C)" type="number" value={source.kennoLampotila || ''} disabled={disabled} onChange={(v) => set({ kennoLampotila: v })} />
                        <FormInput label="Pituus (mm)" type="number" value={source.kennoPituusMm || ''} disabled={disabled} onChange={(v) => set({ kennoPituusMm: v })} />
                        <FormInput label="Korkeus (mm)" type="number" value={source.kennoKorkeusMm || ''} disabled={disabled} onChange={(v) => set({ kennoKorkeusMm: v })} />
                        <FormInput label="Syvyys (mm)" type="number" value={source.kennoSyvyysMm || ''} disabled={disabled} onChange={(v) => set({ kennoSyvyysMm: v })} />
                        <FormInput label="Ripaväli (mm)" type="number" placeholder="10" value={source.ripavaliMm || ''} disabled={disabled} onChange={(v) => set({ ripavaliMm: v })} />
                        <FormInput label="Putkirivit" type="number" placeholder="auto" value={source.putkirivit || ''} disabled={disabled} onChange={(v) => set({ putkirivit: v })} />
                        <FormInput label="Höyrystyminen (°C)" type="number" value={source.hoyrystymisLampotila || ''} disabled={disabled} onChange={(v) => set({ hoyrystymisLampotila: v })} />
                        {(() => {
                          const r = staticEvaporatorEstimate(staticInput(source));
                          return r ? <StaticCapacityResultView kw={r.kw} dtK={r.dtK} areaM2={r.areaM2} u={r.uWm2K} /> : null;
                        })()}
                      </>
                    ) : (
                      <>
                        <FormInput label="Ilma ennen (°C)" type="number" value={source.ilmaTuloLampotila || ''} disabled={disabled} onChange={(v) => set({ ilmaTuloLampotila: v })} />
                        <FormInput label="Kosteus ennen (%)" type="number" value={source.ilmaTuloRh || ''} disabled={disabled} onChange={(v) => set({ ilmaTuloRh: v })} />
                        <FormInput label="Ilma jälkeen (°C)" type="number" value={source.ilmaPoistoLampotila || ''} disabled={disabled} onChange={(v) => set({ ilmaPoistoLampotila: v })} />
                        <FormInput label="Kosteus jälkeen (%)" type="number" value={source.ilmaPoistoRh || ''} disabled={disabled} onChange={(v) => set({ ilmaPoistoRh: v })} />
                        <FormInput label="Ilmavirta (m³/h)" type="number" value={source.ilmavirtaM3h || ''} disabled={disabled} onChange={(v) => set({ ilmavirtaM3h: v })} />
                        <FormInput label="Höyrystyminen (°C)" type="number" value={source.hoyrystymisLampotila || ''} disabled={disabled} onChange={(v) => set({ hoyrystymisLampotila: v })} />
                        <AirCapacityResultView latent result={airCapacity({ tIn: source.ilmaTuloLampotila, rhIn: source.ilmaTuloRh, tOut: source.ilmaPoistoLampotila, rhOut: source.ilmaPoistoRh, airflowM3h: source.ilmavirtaM3h, direction: 'cooling' })} />
                      </>
                    )}
                  </div>
                </div>
                <div className="huolto-submodule huolto-span-all">
                  <h4>Tarkastukset</h4>
                  <FormCheckbox label="Lamellit puhtaat" checked={!!source.lamellitPuhtaat} disabled={disabled} onChange={(v) => set({ lamellitPuhtaat: v })} />
                  <FormCheckbox label="Sulatusvesi poistuu" checked={!!source.sulatusvesiPoistuu} disabled={disabled} onChange={(v) => set({ sulatusvesiPoistuu: v })} />
                  <FormCheckbox label="Ei jäätymistä" checked={!!source.jaatyminenOk} disabled={disabled} onChange={(v) => set({ jaatyminenOk: v })} />
                </div>
                <div className="huolto-submodule huolto-span-all">
                  <FormCheckbox label="Magneettiventtiili" checked={on(source.magneettiventtiiliKaytossa)} disabled={disabled} onChange={(v) => set({ magneettiventtiiliKaytossa: v })} />
                  {on(source.magneettiventtiiliKaytossa) && (
                    <div className="line-form-grid">
                      <FormInput label="Malli" value={source.magneettiventtiiliMalli || ''} disabled={disabled} onChange={(v) => set({ magneettiventtiiliMalli: v })} />
                      <FormCheckbox label="Toiminta testattu" checked={!!source.magneettiventtiiliTestattu} disabled={disabled} onChange={(v) => set({ magneettiventtiiliTestattu: v })} />
                    </div>
                  )}
                  <FormCheckbox label="Paisuntaventtiili" checked={on(source.paisuntaventtiiliKaytossa)} disabled={disabled} onChange={(v) => set({ paisuntaventtiiliKaytossa: v })} />
                  {on(source.paisuntaventtiiliKaytossa) && (
                    <div className="line-form-grid">
                      <label>
                        Tyyppi
                        <select value={source.paisuntaventtiiliTyyppi || ''} disabled={disabled} onChange={(e) => set({ paisuntaventtiiliTyyppi: e.target.value })}>
                          <option value="">Valitse…</option>
                          <option value="TXV">Termostaattinen</option>
                          <option value="EXV">Elektroninen</option>
                          <option value="kapillaari">Kapillaari</option>
                        </select>
                      </label>
                      <FormInput label="Malli" value={source.paisuntaventtiiliMalli || ''} disabled={disabled} onChange={(v) => set({ paisuntaventtiiliMalli: v })} />
                      <FormInput label="Tulistus (K)" type="number" value={source.tulistus || ''} disabled={disabled} onChange={(v) => set({ tulistus: v })} />
                    </div>
                  )}
                  {showOwnOhjaus && <FormCheckbox label="Ohjaus" checked={on(source.ohjausKaytossa)} disabled={disabled} onChange={(v) => set({ ohjausKaytossa: v })} />}
                  {showOwnOhjaus && on(source.ohjausKaytossa) && (
                    <div className="line-form-grid">
                      <label>
                        Ohjauksen tyyppi
                        <select value={source.ohjausTyyppi || ''} disabled={disabled} onChange={(e) => set({ ohjausTyyppi: e.target.value })}>
                          <option value="">Valitse…</option>
                          <option value="saadin">Elektroninen säädin</option>
                          <option value="termostaatti">Termostaatti</option>
                          <option value="kiinteisto">Kiinteistöautomaatio</option>
                        </select>
                      </label>
                      <FormInput label="Säätimen malli" value={source.ohjausMalli || ''} disabled={disabled} onChange={(v) => set({ ohjausMalli: v })} />
                      <FormInput label="Lämpötila mitattu (°C)" type="number" value={source.lampotilaMitattu || ''} disabled={disabled} onChange={(v) => set({ lampotilaMitattu: v })} />
                      <FormInput label="Lämpötila asetus (°C)" type="number" value={source.lampotilaAsetus || ''} disabled={disabled} onChange={(v) => set({ lampotilaAsetus: v })} />
                      <FormInput label="Ylähälytysraja (°C)" type="number" value={source.halytysYla || ''} disabled={disabled} onChange={(v) => set({ halytysYla: v })} />
                      <FormInput label="Alahälytysraja (°C)" type="number" value={source.halytysAla || ''} disabled={disabled} onChange={(v) => set({ halytysAla: v })} />
                      <label>
                        Ovikytkin / munakello
                        <select value={source.ovikytkin || ''} disabled={disabled} onChange={(e) => set({ ovikytkin: e.target.value as EvaporatorData['ovikytkin'] })}>
                          <option value="">Valitse…</option>
                          <option value="ovikytkin">Ovikytkin</option>
                          <option value="munakello">Munakello</option>
                          <option value="ei">Ei</option>
                        </select>
                      </label>
                      {fansDefrost && (
                        <>
                          <FormInput label="Sulatusväli (h)" value={source.sulatusVali || ''} disabled={disabled} onChange={(v) => set({ sulatusVali: v })} />
                          {source.sulatus !== 'sahko' && (
                            <FormInput label="Sulatusaika" value={source.sulatusAika || ''} disabled={disabled} onChange={(v) => set({ sulatusAika: v })} />
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        ) : null}

        {sourceStatus === 'faulty' ? (
          <label className="konvektori-huomio-field">
            <span className="konvektori-tarkastus-label">Mikä on vikana?</span>
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
          label={`Piiri ${index + 1}: sama höyrystin kuin piirissä 1 (ei mittauskenttiä)`}
          checked={!!sameAsFirst}
          onChange={onSameAsFirstChange}
        />
      ) : null}

      {!hidePartRow ? (
        <HuoltoPartInspectionRow
          title={titleLabel}
          subtitle={subtitle || undefined}
          status={status}
          disabled={disabled}
          onInspect={openDialog}
        />
      ) : null}

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

        {renderFormBody(draft, setDraft, draftStatus)}
      </HuoltoInspectionDialogShell>
    </>
  );
}
