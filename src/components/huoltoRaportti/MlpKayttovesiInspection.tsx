import type { MlpData } from '../../lib/huoltoRaportti/types';
import { kayttovesiLisalammitinSijaintiOptions } from '../../lib/huoltoRaportti/constants';
import { createEmptyHeatingElementData } from '../../lib/huoltoRaportti/defaults';
import { FormCheckbox } from './FormCheckbox';
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
  return (
    <>
      <FormCheckbox label="Käyttövesi mukana" checked={draft.kayttovesiEnabled} onChange={(v) => patchDraft({ kayttovesiEnabled: v })} />
      {draft.kayttovesiEnabled ? (
        <div className="huolto-form-stack">
          <div className="line-form-grid">
            <FormInput label="Tilavuus (l)" value={draft.kayttovesiTilavuus} onChange={(v) => patchDraft({ kayttovesiTilavuus: v })} />
            <FormInput label="Lämpötila-asetus (°C)" value={draft.kayttovesiLampotilaAsetus} onChange={(v) => patchDraft({ kayttovesiLampotilaAsetus: v })} />
            <FormInput label="Nykyinen lämpötila (°C)" value={draft.kayttovesiLampotilaNykyinen} onChange={(v) => patchDraft({ kayttovesiLampotilaNykyinen: v })} />
            <FormCheckbox label="Toimilaitteet OK" checked={draft.kayttovesiToimilaitteetOK} onChange={(v) => patchDraft({ kayttovesiToimilaitteetOK: v })} />
          </div>
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
                <p className="muted">Lisälämmittin on integroitu laitteeseen.</p>
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
