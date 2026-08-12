import type { MlpData, PumpunSyottoValinta } from '../../lib/huoltoRaportti/types';
import { lampoJakotapaOptions } from '../../lib/huoltoRaportti/constants';
import {
  mlpLampoInspectionStatus,
  normalizeHuoltoInspectionStatus,
  type HuoltoInspectionStatus,
} from '../../lib/huoltoRaportti/huoltoInspectionStatus';
import { getMlpPumpSyottoValinta } from '../../lib/huoltoRaportti/sahkoVaiheUtils';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';
import { HuoltoPartInspectionRow } from './HuoltoPartInspectionRow';
import { HuoltoInspectionDialogShell, useHuoltoInspectionDialog } from './HuoltoInspectionDialogShell';
import { PumpSupplyMeasurementBlock } from './PumpSupplyMeasurementBlock';
import { TriStateInspectionToggle } from './TriStateInspectionToggle';

interface Props {
  title: string;
  mlp: MlpData;
  onChange: (patch: Partial<MlpData>) => void;
}

export function MlpLampopiiritInspection({ title, mlp, onChange }: Props) {
  const status = mlpLampoInspectionStatus(mlp);

  const { open, openDialog, closeDialog, draft, setDraft } = useHuoltoInspectionDialog({
    data: mlp,
    onChange,
    canSave: (next) => {
      const nextStatus =
        normalizeHuoltoInspectionStatus(next.lampoTarkastusTila) ?? mlpLampoInspectionStatus(next);
      return nextStatus !== null;
    },
  });

  const draftStatus = normalizeHuoltoInspectionStatus(draft.lampoTarkastusTila) ?? mlpLampoInspectionStatus(draft);
  const showDetails = draftStatus === 'ok' || draftStatus === 'faulty';
  const patchDraft = (patch: Partial<MlpData>) => setDraft((prev) => ({ ...prev, ...patch }));

  return (
    <>
      <HuoltoPartInspectionRow title={title} status={status} onInspect={openDialog} />

      <HuoltoInspectionDialogShell open={open} title={title} titleId="mlp-lampo-dialog-title" onClose={closeDialog}>
        <div className="konvektori-tarkastus-item">
          <span className="konvektori-tarkastus-label">Tarkastuksen tulos</span>
          <TriStateInspectionToggle name="mlp-lampo-tila" value={draftStatus} onChange={(next: Exclude<HuoltoInspectionStatus, null>) => patchDraft({ lampoTarkastusTila: next })} />
        </div>

        {showDetails ? (
          <>
            <div className="checkbox-grid huolto-toggle-grid">
              <FormCheckbox label="Toimilaitteet testattu" checked={draft.lampoToimilaitteetOK} onChange={(v) => patchDraft({ lampoToimilaitteetOK: v })} />
              <FormCheckbox label="Automaattinen ilmanpoisto testattu" checked={draft.lampoAutomaattinenIlmausTarkistettu} onChange={(v) => patchDraft({ lampoAutomaattinenIlmausTarkistettu: v })} />
              <FormCheckbox label="Mutasihti puhdistettu" checked={draft.lampoMutapussiPuhdistettu} onChange={(v) => patchDraft({ lampoMutapussiPuhdistettu: v })} />
              <FormCheckbox label="Paisunta-astia esipaine tarkistettu" checked={draft.lampoPaisuntaAstiaTarkistettu} onChange={(v) => patchDraft({ lampoPaisuntaAstiaTarkistettu: v })} />
            </div>
            {draft.lampoPaisuntaAstiaTarkistettu ? (
              <div className="line-form-grid">
                <FormInput label="Paisunta-astian koko" value={draft.lampoPaisuntaAstiaKoko} onChange={(v) => patchDraft({ lampoPaisuntaAstiaKoko: v })} className="huolto-span-all" />
                <FormInput label="Esipaine (bar)" value={draft.lampoPaisuntaAstiaEsipaine} onChange={(v) => patchDraft({ lampoPaisuntaAstiaEsipaine: v })} type="number" />
              </div>
            ) : null}
            {draft.lampoPiirit.map((piiri, idx) => (
              <div key={idx} className="huolto-submodule">
                <h4>Lämpöpiiri {idx + 1}</h4>
                <div className="line-form-grid">
                  <label>
                    Jakotapa
                    <select
                      value={piiri.jakotapa}
                      onChange={(e) => {
                        const next = [...draft.lampoPiirit];
                        next[idx] = { ...next[idx], jakotapa: e.target.value };
                        patchDraft({ lampoPiirit: next });
                      }}
                    >
                      {lampoJakotapaOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </label>
                  {piiri.jakotapa === 'muu' ? (
                    <FormInput
                      label="Muu jakotapa"
                      value={piiri.jakotapaMuu}
                      onChange={(v) => {
                        const next = [...draft.lampoPiirit];
                        next[idx] = { ...next[idx], jakotapaMuu: v };
                        patchDraft({ lampoPiirit: next });
                      }}
                    />
                  ) : null}
                </div>
                <FormCheckbox
                  label="Pumppu tarkastettu"
                  checked={!!piiri.pumppuTarkastettu}
                  onChange={(v) => {
                    const next = [...draft.lampoPiirit];
                    next[idx] = { ...next[idx], pumppuTarkastettu: v };
                    patchDraft({ lampoPiirit: next });
                  }}
                />
                {piiri.pumppuTarkastettu ? (
                  <>
                    <div className="line-form-grid">
                      <FormInput label="Pumpun valmistaja" value={piiri.pumppuValmistaja || ''} onChange={(v) => {
                        const next = [...draft.lampoPiirit];
                        next[idx] = { ...next[idx], pumppuValmistaja: v };
                        patchDraft({ lampoPiirit: next });
                      }} />
                      <FormInput label="Pumpun malli" value={piiri.pumppuMalli || ''} onChange={(v) => {
                        const next = [...draft.lampoPiirit];
                        next[idx] = { ...next[idx], pumppuMalli: v };
                        patchDraft({ lampoPiirit: next });
                      }} />
                    </div>
                    <PumpSupplyMeasurementBlock
                      syottoValinta={getMlpPumpSyottoValinta(piiri.pumppuSyottoValinta, piiri.pumppuKolmeVaihetta)}
                      onSyottoValintaChange={(v: PumpunSyottoValinta) => {
                        const next = [...draft.lampoPiirit];
                        next[idx] = { ...next[idx], pumppuSyottoValinta: v, pumppuKolmeVaihetta: v === '400_3' ? true : v === '230_1' ? false : undefined };
                        patchDraft({ lampoPiirit: next });
                      }}
                      virta1vaihe={piiri.pumppuVirta1vaihe}
                      virtaL1={piiri.pumppuVirtaL1}
                      virtaL2={piiri.pumppuVirtaL2}
                      virtaL3={piiri.pumppuVirtaL3}
                      onVirta1vaihe={(v) => { const next = [...draft.lampoPiirit]; next[idx] = { ...next[idx], pumppuVirta1vaihe: v }; patchDraft({ lampoPiirit: next }); }}
                      onVirtaL1={(v) => { const next = [...draft.lampoPiirit]; next[idx] = { ...next[idx], pumppuVirtaL1: v }; patchDraft({ lampoPiirit: next }); }}
                      onVirtaL2={(v) => { const next = [...draft.lampoPiirit]; next[idx] = { ...next[idx], pumppuVirtaL2: v }; patchDraft({ lampoPiirit: next }); }}
                      onVirtaL3={(v) => { const next = [...draft.lampoPiirit]; next[idx] = { ...next[idx], pumppuVirtaL3: v }; patchDraft({ lampoPiirit: next }); }}
                    />
                  </>
                ) : null}
                <div className="line-form-grid">
                  <FormInput label="Virtaus (l/s)" value={piiri.virtaus} onChange={(v) => { const next = [...draft.lampoPiirit]; next[idx] = { ...next[idx], virtaus: v }; patchDraft({ lampoPiirit: next }); }} type="number" />
                  <FormInput label="Meno (°C)" value={piiri.meno} onChange={(v) => { const next = [...draft.lampoPiirit]; next[idx] = { ...next[idx], meno: v }; patchDraft({ lampoPiirit: next }); }} type="number" />
                  <FormInput label="Tulo (°C)" value={piiri.tulo} onChange={(v) => { const next = [...draft.lampoPiirit]; next[idx] = { ...next[idx], tulo: v }; patchDraft({ lampoPiirit: next }); }} type="number" />
                </div>
              </div>
            ))}
            <FormCheckbox label="Sähkökattila varalämmitykseen" checked={draft.lampoSahkoKattilaVaralampitykseen} onChange={(v) => patchDraft({ lampoSahkoKattilaVaralampitykseen: v })} />
            {draft.lampoSahkoKattilaVaralampitykseen ? (
              <div className="line-form-grid">
                <FormInput label="Kattilan tyyppi/malli" value={draft.lampoSahkoKattilaTyyppi} onChange={(v) => patchDraft({ lampoSahkoKattilaTyyppi: v })} />
                <FormInput label="Teho (kW)" value={draft.lampoSahkoKattilaTeho} onChange={(v) => patchDraft({ lampoSahkoKattilaTeho: v })} type="number" />
              </div>
            ) : null}
          </>
        ) : null}

        {draftStatus === 'faulty' ? (
          <label className="konvektori-huomio-field">
            <span className="konvektori-tarkastus-label">Mikä on vikana?</span>
            <textarea rows={3} value={draft.lampoTarkastusHuomio ?? ''} onChange={(e) => patchDraft({ lampoTarkastusHuomio: e.target.value })} />
          </label>
        ) : null}
      </HuoltoInspectionDialogShell>
    </>
  );
}
