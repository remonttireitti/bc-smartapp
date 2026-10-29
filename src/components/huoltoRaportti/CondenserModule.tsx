import { useCallback, useEffect, useState } from 'react';
import { lauhdutinTypeOptions, puhallinOhjausOptions, LAUHDUTIN_PAINEVENTTIILI_HELP, LAUHDUTIN_PAINEVENTTIILI_LABEL, LAUHDUTIN_PAINEVENTTIILI_MALLI_LABEL } from '../../lib/huoltoRaportti/constants';
import type { CondenserData, LauhdutinType, PuhallinOhjausType } from '../../lib/huoltoRaportti/types';
import {
  condenserInspectionStatus,
  normalizeHuoltoInspectionStatus,
  type HuoltoInspectionStatus,
} from '../../lib/huoltoRaportti/huoltoInspectionStatus';
import { EvaporatorPuhaltimetFields } from './EvaporatorPuhaltimetFields';
import { FormCheckbox } from './FormCheckbox';
import { hasAnyValue, TempMeasuredToggle, useTempMeasured } from './TempMeasuredToggle';
import { FormInput } from './FormInput';
import { HuoltoPartInspectionRow } from './HuoltoPartInspectionRow';
import { HuoltoInspectionDialogShell } from './HuoltoInspectionDialogShell';
import { useRegisterHuoltoModuleDialog } from './HuoltoModuleDialogContext';
import { TriStateInspectionToggle } from './TriStateInspectionToggle';
import { airCapacity } from '../../lib/huoltoRaportti/airCapacity';
import { AirCapacityResultView } from './CapacityResult';

interface Props {
  index: number;
  titleLabel: string;
  data: CondenserData;
  onChange: (data: CondenserData) => void;
  documentUnitKey?: string;
  hidePartRow?: boolean;
  /** Laitteen lauhdutustapa (Kokoonpano). Kun asetettu, tyyppiä ei kysytä uudelleen yksikön ikkunassa. */
  deviceCondenserType?: string;
}

export function CondenserModule({ index, titleLabel, data, onChange, documentUnitKey, hidePartRow = false, deviceCondenserType }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState(data);
  const temp = useTempMeasured(
    hasAnyValue(
      data.lauhtumisLampotila, data.ilmaTuloLampotila, data.ilmaPoistoLampotila, data.alijaahtyminen,
      data.ilmaTuloRh, data.ilmaPoistoRh, data.ilmavirtaM3h,
    ),
  );
  const status = condenserInspectionStatus(data);
  const typeFromDevice = (deviceCondenserType ?? '').trim() as LauhdutinType | '';
  const effectiveType = typeFromDevice || data.tyyppi || '';
  const subtitle = lauhdutinTypeOptions.find((o) => o.value === effectiveType)?.label ?? '';

  useEffect(() => {
    if (dialogOpen) setDraft(typeFromDevice ? { ...data, tyyppi: typeFromDevice } : data);
  }, [dialogOpen, data, typeFromDevice]);

  const draftStatus = normalizeHuoltoInspectionStatus(draft.tarkastusTila) ?? condenserInspectionStatus(draft);

  const closeDialog = useCallback(() => {
    onChange(draft);
    setDialogOpen(false);
  }, [draft, onChange]);

  const openDialog = useCallback(() => {
    setDialogOpen(true);
  }, []);

  useRegisterHuoltoModuleDialog(documentUnitKey, openDialog);

  const renderDetails = (
    source: CondenserData,
    setSource: (updater: CondenserData | ((prev: CondenserData) => CondenserData)) => void,
    sourceStatus: ReturnType<typeof normalizeHuoltoInspectionStatus>,
  ) => {
    const airType = source.tyyppi === 'koneseen_integroitu' || source.tyyppi === 'erillinen_ilma';
    const liquidType = source.tyyppi === 'nestekiertoinen';

    const set = (patch: Partial<CondenserData>) => setSource((prev) => ({ ...prev, ...patch }));

    return (
      <>
        <div className="line-form-grid">
          {typeFromDevice ? null : (
            <label className="huolto-span-all">
              Lauhdutin tyyppi
              <select
                value={source.tyyppi || ''}
                onChange={(e) =>
                  setSource((prev) => ({
                    ...prev,
                    tyyppi: (e.target.value || undefined) as LauhdutinType | undefined,
                  }))
                }
              >
                {lauhdutinTypeOptions.map((opt) => (
                  <option key={opt.value || 'empty'} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <FormInput label="Valmistaja" value={source.valmistaja || ''} onChange={(v) => setSource((prev) => ({ ...prev, valmistaja: v }))} />
          <FormInput label="Malli" value={source.malli || ''} onChange={(v) => setSource((prev) => ({ ...prev, malli: v }))} />
          <FormInput label="Sarjanumero" value={source.sarjanumero || ''} onChange={(v) => setSource((prev) => ({ ...prev, sarjanumero: v }))} />

          <FormCheckbox
            label="Kenno puhdistettu"
            checked={!!source.lauhdutinPuhdistettu}
            onChange={(checked) => setSource((prev) => ({ ...prev, lauhdutinPuhdistettu: checked }))}
          />

          {source.lauhdutinPuhdistettu ? (
            <FormInput
              label="Puhdistustapa"
              value={source.lauhdutinPuhdistusTapa || ''}
              onChange={(v) => setSource((prev) => ({ ...prev, lauhdutinPuhdistusTapa: v }))}
              className="huolto-span-all"
            />
          ) : null}
        </div>

        {airType ? (
          <>
            <div className="line-form-grid">
              <label className="huolto-span-all">
                Puhaltimen ohjaustapa
                <select
                  value={source.puhallinOhjaus || ''}
                  onChange={(e) =>
                    setSource((prev) => ({
                      ...prev,
                      puhallinOhjaus: (e.target.value || undefined) as PuhallinOhjausType | undefined,
                    }))
                  }
                >
                  {puhallinOhjausOptions.map((opt) => (
                    <option key={opt.value || 'empty'} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              {source.puhallinOhjaus === 'muu' ? (
                <FormInput
                  label="Muu ohjaus"
                  value={source.puhallinOhjausMuu || ''}
                  onChange={(v) => setSource((prev) => ({ ...prev, puhallinOhjausMuu: v }))}
                  className="huolto-span-all"
                />
              ) : null}

              {source.puhallinOhjaus === 'nopeussäädin' ? (
                <FormInput
                  label="Nopeussäätimen malli"
                  value={source.nopeussäädinMalli || ''}
                  onChange={(v) => setSource((prev) => ({ ...prev, nopeussäädinMalli: v }))}
                />
              ) : null}

              {source.puhallinOhjaus === 'taajusmuuntaja' ? (
                <FormInput
                  label="Taajusmuuntajan malli"
                  value={source.taajusmuuntajaMalli || ''}
                  onChange={(v) => setSource((prev) => ({ ...prev, taajusmuuntajaMalli: v }))}
                />
              ) : null}

              {source.puhallinOhjaus === 'kp_pressostaatti' ? (
                <FormInput
                  label="KP-pressostaatin malli"
                  value={source.kpPressostaattiMalli || ''}
                  onChange={(v) => setSource((prev) => ({ ...prev, kpPressostaattiMalli: v }))}
                />
              ) : null}

              <FormCheckbox
                label="Talvivarustus"
                checked={!!source.talvivarustus}
                onChange={(checked) => setSource((prev) => ({ ...prev, talvivarustus: checked }))}
              />

              {source.talvivarustus ? (
                <FormInput
                  label="Rakenne / selitys"
                  placeholder="esim. painekytkinohjattu puhallin, tulvitusventtiili, pelti"
                  value={source.talvivarustusTapa || ''}
                  onChange={(v) => setSource((prev) => ({ ...prev, talvivarustusTapa: v }))}
                  className="huolto-span-all"
                />
              ) : null}
            </div>

            <EvaporatorPuhaltimetFields
              puhaltimienMaara={source.puhaltimienMaara || 1}
              puhaltimet={source.puhaltimet || []}
              onChange={(patch) =>
                setSource((prev) => ({
                  ...prev,
                  puhaltimienMaara: patch.puhaltimienMaara ?? prev.puhaltimienMaara,
                  puhaltimet: patch.puhaltimet ?? prev.puhaltimet,
                }))
              }
            />
          </>
        ) : null}

        {liquidType ? (
          <div className="huolto-submodule">
            <h4>Nestekiertoinen lauhdutin</h4>
            <p className="muted huolto-help">{LAUHDUTIN_PAINEVENTTIILI_HELP}</p>
            <div className="line-form-grid">
              <FormCheckbox
                label={LAUHDUTIN_PAINEVENTTIILI_LABEL}
                checked={!!source.painesäätimenTarkistettu}
                onChange={(checked) => setSource((prev) => ({ ...prev, painesäätimenTarkistettu: checked }))}
              />

              {source.painesäätimenTarkistettu ? (
                <FormInput
                  label={LAUHDUTIN_PAINEVENTTIILI_MALLI_LABEL}
                  value={source.painesäätimenMalli || ''}
                  onChange={(v) => setSource((prev) => ({ ...prev, painesäätimenMalli: v }))}
                />
              ) : null}

              <FormCheckbox
                label="Virtaus riittävä"
                checked={source.virtausRiittävä !== false}
                onChange={(checked) => setSource((prev) => ({ ...prev, virtausRiittävä: checked }))}
              />

              {source.virtausRiittävä === false ? (
                <FormInput
                  label="Kuvaile virtausongelma"
                  value={source.virtausOngelma || ''}
                  onChange={(v) => setSource((prev) => ({ ...prev, virtausOngelma: v }))}
                  className="huolto-span-all"
                />
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="huolto-submodule">
          <h4>Asetukset</h4>
          <div className="line-form-grid">
            <FormInput label="Lauhdutuksen asetus (°C / bar)" value={source.lauhdutusAsetus || ''} onChange={(v) => set({ lauhdutusAsetus: v })} />
            {airType ? (
              <>
                <FormInput label="Puhallin käynnistyy" value={source.puhallinKaynnistysAsetus || ''} onChange={(v) => set({ puhallinKaynnistysAsetus: v })} />
                <FormInput label="Puhallin pysähtyy" value={source.puhallinPysaytysAsetus || ''} onChange={(v) => set({ puhallinPysaytysAsetus: v })} />
              </>
            ) : null}
          </div>
        </div>
        <div className="huolto-submodule">
          <h4>Mittaukset</h4>
          <TempMeasuredToggle on={temp.on} onChange={temp.setOn} />
          {temp.show ? (
          <div className="line-form-grid">
            <FormInput label="Lauhtuminen (°C)" type="number" value={source.lauhtumisLampotila || ''} onChange={(v) => set({ lauhtumisLampotila: v })} />
            <FormInput label={liquidType ? 'Neste sisään (°C)' : 'Ilma ennen (°C)'} type="number" value={source.ilmaTuloLampotila || ''} onChange={(v) => set({ ilmaTuloLampotila: v })} />
            <FormInput label={liquidType ? 'Neste ulos (°C)' : 'Ilma jälkeen (°C)'} type="number" value={source.ilmaPoistoLampotila || ''} onChange={(v) => set({ ilmaPoistoLampotila: v })} />
            <FormInput label="Alijäähtyminen (K)" type="number" value={source.alijaahtyminen || ''} onChange={(v) => set({ alijaahtyminen: v })} />
            {airType ? (
              <>
                <FormInput label="Kosteus ennen (%)" type="number" value={source.ilmaTuloRh || ''} onChange={(v) => set({ ilmaTuloRh: v })} />
                <FormInput label="Kosteus jälkeen (%)" type="number" value={source.ilmaPoistoRh || ''} onChange={(v) => set({ ilmaPoistoRh: v })} />
                <FormInput label="Ilmavirta (m³/h)" type="number" value={source.ilmavirtaM3h || ''} onChange={(v) => set({ ilmavirtaM3h: v })} />
                <AirCapacityResultView latent={false} result={airCapacity({ tIn: source.ilmaTuloLampotila, rhIn: source.ilmaTuloRh, tOut: source.ilmaPoistoLampotila, rhOut: source.ilmaPoistoRh, airflowM3h: source.ilmavirtaM3h, direction: 'heating', allowSensibleOnly: true })} />
              </>
            ) : null}
          </div>
          ) : null}
        </div>

        {sourceStatus === 'faulty' ? (
          <label className="konvektori-huomio-field">
            <span className="konvektori-tarkastus-label">Mikä on vikana?</span>
            <textarea
              rows={3}
              value={source.tarkastusHuomio ?? ''}
              onChange={(e) => setSource((prev) => ({ ...prev, tarkastusHuomio: e.target.value }))}
            />
          </label>
        ) : null}
      </>
    );
  };

  return (
    <>
      {!hidePartRow ? (
        <HuoltoPartInspectionRow
          title={titleLabel}
          subtitle={subtitle || undefined}
          status={status}
          onInspect={openDialog}
        />
      ) : null}

      <HuoltoInspectionDialogShell
        open={dialogOpen}
        title={titleLabel}
        titleId={`cond-dialog-title-${index}`}
        onClose={closeDialog}
      >
        <div className="konvektori-tarkastus-item">
          <span className="konvektori-tarkastus-label">Tarkastuksen tulos</span>
          <TriStateInspectionToggle
            name={`cond-${index}-tila`}
            value={draftStatus}
            onChange={(next: Exclude<HuoltoInspectionStatus, null>) =>
              setDraft((prev) => ({ ...prev, tarkastusTila: next }))
            }
          />
        </div>

        {renderDetails(draft, setDraft, draftStatus)}
      </HuoltoInspectionDialogShell>
    </>
  );
}
