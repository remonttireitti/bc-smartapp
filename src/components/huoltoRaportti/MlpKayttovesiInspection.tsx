import type { MlpData } from '../../lib/huoltoRaportti/types';
import { kayttovesiLisalammitinSijaintiOptions, kayttovesiVaraajaTyyppiOptions } from '../../lib/huoltoRaportti/constants';
import { createEmptyHeatingElementData } from '../../lib/huoltoRaportti/defaults';
import { FormCheckbox } from './FormCheckbox';
import { hasAnyValue, TempMeasuredToggle, useTempMeasured } from './TempMeasuredToggle';
import { FormInput } from './FormInput';
import { HeatingElementModule } from './HeatingElementModule';
import { HuoltoPartInspectionRow } from './HuoltoPartInspectionRow';
import { HuoltoInspectionDialogShell, useHuoltoInspectionDialog } from './HuoltoInspectionDialogShell';
import { useRegisterHuoltoModuleDialog } from './HuoltoModuleDialogContext';

interface Props {
  title: string;
  mlp: MlpData;
  onChange: (patch: Partial<MlpData>) => void;
  documentUnitKey?: string;
  hidePartRow?: boolean;
}

export function MlpKayttovesiForm({
  draft,
  patchDraft,
}: {
  draft: MlpData;
  patchDraft: (patch: Partial<MlpData>) => void;
}) {
  const temp = useTempMeasured(hasAnyValue(draft.kayttovesiLampotilaNykyinen));
  return (
    <>
      <FormCheckbox label="Käyttövesi mukana" checked={draft.kayttovesiEnabled} onChange={(v) => patchDraft({ kayttovesiEnabled: v })} />
      {draft.kayttovesiEnabled ? (
        <div className="huolto-form-stack">
          <div className="line-form-grid">
            <FormInput label="Varaajan koko (l)" value={draft.kayttovesiTilavuus} onChange={(v) => patchDraft({ kayttovesiTilavuus: v })} />
            <FormInput label="Käyttöveden asetus (°C)" value={draft.kayttovesiLampotilaAsetus} onChange={(v) => patchDraft({ kayttovesiLampotilaAsetus: v })} />
            <TempMeasuredToggle on={temp.on} onChange={temp.setOn} className="huolto-span-all" />
            {temp.show ? (<FormInput label="Käyttöveden lämpötila (°C)" value={draft.kayttovesiLampotilaNykyinen} onChange={(v) => patchDraft({ kayttovesiLampotilaNykyinen: v })} />) : null}
            <label>
              Varaajan tyyppi
              <select value={draft.kayttovesiVaraajaTyyppi} onChange={(e) => patchDraft({ kayttovesiVaraajaTyyppi: e.target.value })}>
                {kayttovesiVaraajaTyyppiOptions.map((o) => (
                  <option key={o.value || 'empty'} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="checkbox-grid huolto-toggle-grid">
            <FormCheckbox label="Toimilaitteet OK" checked={draft.kayttovesiToimilaitteetOK} onChange={(v) => patchDraft({ kayttovesiToimilaitteetOK: v })} />
            <FormCheckbox label="Varoventtiili tarkastettu" checked={draft.kayttovesiVaroventtiiliTarkastettu} onChange={(v) => patchDraft({ kayttovesiVaroventtiiliTarkastettu: v })} />
            <FormCheckbox label="Sekoitusventtiilin toiminta OK" checked={draft.kayttovesiSekoitusventtiiliToimii} onChange={(v) => patchDraft({ kayttovesiSekoitusventtiiliToimii: v })} />
            <FormCheckbox
              label="Legionella-asetus käytössä"
              checked={draft.kayttovesiLegionellaKaytossa}
              onChange={(v) => patchDraft({ kayttovesiLegionellaKaytossa: v, ...(v ? {} : { kayttovesiLegionellaLampotila: '', kayttovesiLegionellaAjastus: '' }) })}
            />
            <FormCheckbox
              label="Anodi tarkastettu"
              checked={draft.kayttovesiAnodiTarkastettu}
              onChange={(v) => patchDraft({ kayttovesiAnodiTarkastettu: v, ...(v ? {} : { kayttovesiAnodiHuomio: '' }) })}
            />
          </div>
          {draft.kayttovesiLegionellaKaytossa ? (
            <div className="line-form-grid">
              <FormInput label="Legionella-lämpötila (°C)" value={draft.kayttovesiLegionellaLampotila} onChange={(v) => patchDraft({ kayttovesiLegionellaLampotila: v })} type="number" />
              <FormInput label="Legionella-ajastus" value={draft.kayttovesiLegionellaAjastus} onChange={(v) => patchDraft({ kayttovesiLegionellaAjastus: v })} placeholder="esim. su 03:00" />
            </div>
          ) : null}
          {draft.kayttovesiAnodiTarkastettu ? (
            <FormInput label="Anodin kunto" value={draft.kayttovesiAnodiHuomio} onChange={(v) => patchDraft({ kayttovesiAnodiHuomio: v })} />
          ) : null}
          <FormCheckbox
            label="Lisälämmittin (sähkövastukset)"
            checked={draft.kayttovesiSahkoVastuksetEnabled}
            onChange={(v) =>
              patchDraft({
                kayttovesiSahkoVastuksetEnabled: v,
                ...(v
                  ? {}
                  : {
                      kayttovesiSahkoVastuksetSijainti: '',
                      kayttovesiSahkoVastuksetMaara: '',
                      kayttovesiSahkoVastukset: [],
                      kayttovesiLisavastusTeho: '',
                      kayttovesiLisavastusToimii: false,
                    }),
              })
            }
          />
          {draft.kayttovesiSahkoVastuksetEnabled ? (
            <>
              <label style={{ maxWidth: '320px' }}>
                Lisälämmittimen sijainti
                <select
                  value={draft.kayttovesiSahkoVastuksetSijainti}
                  onChange={(e) => {
                    const sijainti = e.target.value as MlpData['kayttovesiSahkoVastuksetSijainti'];
                    if (sijainti === 'integroitu') {
                      patchDraft({
                        kayttovesiSahkoVastuksetSijainti: sijainti,
                        kayttovesiSahkoVastuksetMaara: '',
                        kayttovesiSahkoVastukset: [],
                      });
                    } else if (sijainti === 'ulkopuolinen') {
                      const count = Math.max(1, parseInt(draft.kayttovesiSahkoVastuksetMaara, 10) || 1);
                      let next = [...draft.kayttovesiSahkoVastukset];
                      while (next.length < count) next.push(createEmptyHeatingElementData());
                      patchDraft({
                        kayttovesiSahkoVastuksetSijainti: sijainti,
                        kayttovesiSahkoVastuksetMaara: String(count),
                        kayttovesiSahkoVastukset: next.slice(0, count),
                      });
                    } else {
                      patchDraft({ kayttovesiSahkoVastuksetSijainti: sijainti });
                    }
                  }}
                >
                  {kayttovesiLisalammitinSijaintiOptions.map((opt) => (
                    <option key={opt.value || 'empty'} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              {draft.kayttovesiSahkoVastuksetSijainti === 'integroitu' ? (
                <div className="line-form-grid">
                  <FormInput label="Lisävastuksen teho (kW)" value={draft.kayttovesiLisavastusTeho} onChange={(v) => patchDraft({ kayttovesiLisavastusTeho: v })} type="number" />
                  <FormCheckbox label="Lisävastuksen toiminta OK" checked={draft.kayttovesiLisavastusToimii} onChange={(v) => patchDraft({ kayttovesiLisavastusToimii: v })} />
                </div>
              ) : null}
              {draft.kayttovesiSahkoVastuksetSijainti === 'ulkopuolinen' ? (
                <>
                  <FormInput
                    label="Lisälämmittimien määrä (kpl)"
                    value={draft.kayttovesiSahkoVastuksetMaara}
                    onChange={(v) => {
                      const newCount = Math.max(0, parseInt(v, 10) || 0);
                      let next = [...draft.kayttovesiSahkoVastukset];
                      while (next.length < newCount) next.push(createEmptyHeatingElementData());
                      patchDraft({
                        kayttovesiSahkoVastuksetMaara: v,
                        kayttovesiSahkoVastukset: next.slice(0, newCount),
                      });
                    }}
                    type="number"
                  />
                  {draft.kayttovesiSahkoVastukset.map((vastus, idx) => (
                    <HeatingElementModule
                      key={idx}
                      index={idx}
                      data={vastus}
                      compact
                      onChange={(data) => {
                        const next = [...draft.kayttovesiSahkoVastukset];
                        next[idx] = data;
                        patchDraft({ kayttovesiSahkoVastukset: next });
                      }}
                      onRemove={() => {
                        const next = draft.kayttovesiSahkoVastukset.filter((_, i) => i !== idx);
                        patchDraft({
                          kayttovesiSahkoVastukset: next,
                          kayttovesiSahkoVastuksetMaara: String(next.length),
                        });
                      }}
                    />
                  ))}
                </>
              ) : null}
            </>
          ) : null}
          <FormCheckbox
            label="Käyttövesikierto käytössä"
            checked={draft.kayttovesiKiertoEnabled}
            onChange={(v) => patchDraft({ kayttovesiKiertoEnabled: v })}
          />
          {draft.kayttovesiKiertoEnabled ? (
            <div className="line-form-grid">
              <FormInput label="Kierron pumpun valmistaja" value={draft.kayttovesiKiertoPumpunValmistaja} onChange={(v) => patchDraft({ kayttovesiKiertoPumpunValmistaja: v })} />
              <FormInput label="Kierron pumpun malli" value={draft.kayttovesiKiertoPumpunMalli} onChange={(v) => patchDraft({ kayttovesiKiertoPumpunMalli: v })} />
              <FormInput label="Virtaus (l/s)" value={draft.kayttovesiKiertoVirtaus} onChange={(v) => patchDraft({ kayttovesiKiertoVirtaus: v })} type="number" />
              <FormInput label="Käyntivirta (A)" value={draft.kayttovesiKiertoKayntivirta} onChange={(v) => patchDraft({ kayttovesiKiertoKayntivirta: v })} type="number" />
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export function MlpKayttovesiInspection({
  title,
  mlp,
  onChange,
  documentUnitKey,
  hidePartRow = false,
}: Props) {
  const status = !mlp.kayttovesiEnabled ? 'na' : mlp.kayttovesiTilavuus?.trim() ? 'ok' : null;
  const subtitle = mlp.kayttovesiEnabled && mlp.kayttovesiTilavuus?.trim()
    ? `${mlp.kayttovesiTilavuus} l`
    : undefined;

  const { open, openDialog, closeDialog, draft, setDraft } = useHuoltoInspectionDialog({
    data: mlp,
    onChange,
  });

  const patchDraft = (patch: Partial<MlpData>) => setDraft((prev) => ({ ...prev, ...patch }));

  useRegisterHuoltoModuleDialog(documentUnitKey, openDialog);

  return (
    <>
      {!hidePartRow ? (
        <HuoltoPartInspectionRow title={title} subtitle={subtitle} status={status} onInspect={openDialog} />
      ) : null}

      <HuoltoInspectionDialogShell open={open} title={title} titleId="mlp-kayttovesi-dialog-title" onClose={closeDialog}>
        <MlpKayttovesiForm draft={draft} patchDraft={patchDraft} />
      </HuoltoInspectionDialogShell>
    </>
  );
}
