import type { MlpData, PumpunSyottoValinta } from '../../lib/huoltoRaportti/types';
import { isMlpVesiNeste, mlpNestOptions } from '../../lib/huoltoRaportti/constants';
import {
  mlpLatauspiiriInspectionStatus,
  normalizeHuoltoInspectionStatus,
  type HuoltoInspectionStatus,
} from '../../lib/huoltoRaportti/huoltoInspectionStatus';
import { getMlpPumpSyottoValinta } from '../../lib/huoltoRaportti/sahkoVaiheUtils';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';
import { HuoltoPartInspectionRow } from './HuoltoPartInspectionRow';
import { HuoltoInspectionDialogShell, useHuoltoInspectionDialog } from './HuoltoInspectionDialogShell';
import { useRegisterHuoltoModuleDialog } from './HuoltoModuleDialogContext';
import { PumpSupplyMeasurementBlock } from './PumpSupplyMeasurementBlock';
import { TriStateInspectionToggle } from './TriStateInspectionToggle';

interface Props {
  mlp: MlpData;
  onChange: (patch: Partial<MlpData>) => void;
  latausPower: string | null;
  documentUnitKey?: string;
  hidePartRow?: boolean;
}

function calcPower(virtaus: string, meno: string, tulo: string, c: number): string | null {
  const v = parseFloat(virtaus) || 0;
  const m = parseFloat(meno) || 0;
  const t = parseFloat(tulo) || 0;
  const deltaT = Math.abs(m - t);
  if (v > 0 && deltaT > 0 && c > 0) return (c * v * deltaT).toFixed(2);
  return null;
}

export function MlpLatauspiiriInspection({
  mlp,
  onChange,
  latausPower,
  documentUnitKey,
  hidePartRow = false,
}: Props) {
  const title = 'Latauspiiri';
  const status = mlpLatauspiiriInspectionStatus(mlp);

  const { open, openDialog, closeDialog, draft, setDraft } = useHuoltoInspectionDialog({
    data: mlp,
    onChange,
    canSave: (next) => {
      const nextStatus =
        normalizeHuoltoInspectionStatus(next.latausTarkastusTila) ?? mlpLatauspiiriInspectionStatus(next);
      return nextStatus !== null;
    },
  });

  const draftStatus = normalizeHuoltoInspectionStatus(draft.latausTarkastusTila) ?? mlpLatauspiiriInspectionStatus(draft);
  const showDetails = draftStatus === 'ok' || draftStatus === 'faulty';
  const draftPower =
    calcPower(draft.latausVirtaus, draft.latausMeno, draft.latausTulo, parseFloat(draft.latausNeste) || 0) ?? latausPower;
  const patchDraft = (patch: Partial<MlpData>) => setDraft((prev) => ({ ...prev, ...patch }));

  useRegisterHuoltoModuleDialog(documentUnitKey, openDialog);

  return (
    <>
      {!hidePartRow ? (
        <HuoltoPartInspectionRow title={title} status={status} onInspect={openDialog} />
      ) : null}

      <HuoltoInspectionDialogShell open={open} title={title} titleId="mlp-lataus-dialog-title" onClose={closeDialog}>
        <div className="konvektori-tarkastus-item">
          <span className="konvektori-tarkastus-label">Tarkastuksen tulos</span>
          <TriStateInspectionToggle name="mlp-lataus-tila" value={draftStatus} onChange={(next: Exclude<HuoltoInspectionStatus, null>) => patchDraft({ latausTarkastusTila: next })} />
        </div>

        {showDetails ? (
          <>
            <div className="checkbox-grid huolto-toggle-grid">
              <FormCheckbox label="Paine tarkastettu" checked={draft.latausPaineTarkastettu} onChange={(v) => patchDraft({ latausPaineTarkastettu: v, ...(v ? {} : { latausPaineBar: '' }) })} />
              <FormCheckbox label="Mutapussi puhdistettu" checked={draft.latausMutapussiPuhdistettu} onChange={(v) => patchDraft({ latausMutapussiPuhdistettu: v })} />
              <FormCheckbox label="Pumppu tarkastettu" checked={draft.latausPumppuTarkastettu} onChange={(v) => patchDraft({ latausPumppuTarkastettu: v })} />
              <FormCheckbox label="Eristeet kunnossa" checked={draft.latausEristeetKunnossa} onChange={(v) => patchDraft({ latausEristeetKunnossa: v })} />
              <FormCheckbox label="Automaattinen ilmaus tarkistettu" checked={draft.latausAutomaattinenIlmausTarkistettu} onChange={(v) => patchDraft({ latausAutomaattinenIlmausTarkistettu: v })} />
              <FormCheckbox label="Paisunta-astia tarkistettu" checked={draft.latausPaisuntaAstiaTarkistettu} onChange={(v) => patchDraft({ latausPaisuntaAstiaTarkistettu: v })} />
              <FormCheckbox label="Tulistuspiiri" checked={draft.latausTulistuspiiri} onChange={(v) => patchDraft({ latausTulistuspiiri: v })} />
            </div>
            {draft.latausPaisuntaAstiaTarkistettu ? (
              <div className="line-form-grid">
                <FormInput label="Paisunta-astian koko" value={draft.latausPaisuntaAstiaKoko} onChange={(v) => patchDraft({ latausPaisuntaAstiaKoko: v })} className="huolto-span-all" />
                <FormInput label="Esipaine (bar)" value={draft.latausPaisuntaAstiaEsipaine} onChange={(v) => patchDraft({ latausPaisuntaAstiaEsipaine: v })} type="number" />
              </div>
            ) : null}
            {draft.latausPaineTarkastettu ? (
              <FormInput label="Mitattu paine (bar)" value={draft.latausPaineBar} onChange={(v) => patchDraft({ latausPaineBar: v })} type="number" />
            ) : null}
            {draft.latausPumppuTarkastettu ? (
              <>
                <div className="line-form-grid">
                  <FormInput label="Pumpun valmistaja" value={draft.latausPumpunValmistaja} onChange={(v) => patchDraft({ latausPumpunValmistaja: v })} />
                  <FormInput label="Pumpun malli" value={draft.latausPumpunMalli} onChange={(v) => patchDraft({ latausPumpunMalli: v })} />
                </div>
                <PumpSupplyMeasurementBlock
                  syottoValinta={getMlpPumpSyottoValinta(draft.latausPumpunSyottoValinta, draft.latausPumppuKolmeVaihetta)}
                  onSyottoValintaChange={(v: PumpunSyottoValinta) => patchDraft({ latausPumpunSyottoValinta: v, latausPumppuKolmeVaihetta: v === '400_3' ? true : v === '230_1' ? false : undefined })}
                  virta1vaihe={draft.latausPumppuVirta1vaihe}
                  virtaL1={draft.latausPumppuVirtaL1}
                  virtaL2={draft.latausPumppuVirtaL2}
                  virtaL3={draft.latausPumppuVirtaL3}
                  onVirta1vaihe={(v) => patchDraft({ latausPumppuVirta1vaihe: v })}
                  onVirtaL1={(v) => patchDraft({ latausPumppuVirtaL1: v })}
                  onVirtaL2={(v) => patchDraft({ latausPumppuVirtaL2: v })}
                  onVirtaL3={(v) => patchDraft({ latausPumppuVirtaL3: v })}
                />
              </>
            ) : null}
            <div className="line-form-grid">
              <FormInput label="Virtaus (l/s)" value={draft.latausVirtaus} onChange={(v) => patchDraft({ latausVirtaus: v })} type="number" />
              <FormInput label="Meno (°C)" value={draft.latausMeno} onChange={(v) => patchDraft({ latausMeno: v })} type="number" />
              <FormInput label="Tulo (°C)" value={draft.latausTulo} onChange={(v) => patchDraft({ latausTulo: v })} type="number" />
              <label>
                Neste
                <select
                  value={draft.latausNeste}
                  onChange={(e) => {
                    const neste = e.target.value;
                    patchDraft({ latausNeste: neste, latausJarjestelmanNeste: '', ...(isMlpVesiNeste(neste) ? { latausGlykoliPakkaskestavyys: '' } : {}) });
                  }}
                >
                  {mlpNestOptions.map((o) => (
                    <option key={`l-${o.label}`} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
            </div>
            {draftPower ? <div className="huolto-alert huolto-alert-success">Latauspiirin teho: {draftPower} kW</div> : null}
            {!isMlpVesiNeste(draft.latausNeste) && draft.latausNeste !== '' ? (
              <FormInput label="Glykolin pakkaskestävyys (°C)" value={draft.latausGlykoliPakkaskestavyys} onChange={(v) => patchDraft({ latausGlykoliPakkaskestavyys: v })} type="number" />
            ) : null}
            {draft.latausTulistuspiiri ? (
              <div className="huolto-submodule">
                <FormCheckbox label="Tulistuspiirissä pumppu" checked={draft.latausTulistuspiiriPumppu} onChange={(v) => patchDraft({ latausTulistuspiiriPumppu: v })} />
                {draft.latausTulistuspiiriPumppu ? (
                  <>
                    <div className="line-form-grid">
                      <FormInput label="Pumpun valmistaja" value={draft.latausTulistusPumpunValmistaja} onChange={(v) => patchDraft({ latausTulistusPumpunValmistaja: v })} />
                      <FormInput label="Pumpun malli" value={draft.latausTulistusPumpunMalli} onChange={(v) => patchDraft({ latausTulistusPumpunMalli: v })} />
                    </div>
                    <PumpSupplyMeasurementBlock
                      syottoValinta={getMlpPumpSyottoValinta(draft.latausTulistusPumpunSyottoValinta, draft.latausTulistusPumppuKolmeVaihetta)}
                      onSyottoValintaChange={(v: PumpunSyottoValinta) => patchDraft({ latausTulistusPumpunSyottoValinta: v, latausTulistusPumppuKolmeVaihetta: v === '400_3' ? true : v === '230_1' ? false : undefined })}
                      virta1vaihe={draft.latausTulistusPumppuVirta1vaihe}
                      virtaL1={draft.latausTulistusPumppuVirtaL1}
                      virtaL2={draft.latausTulistusPumppuVirtaL2}
                      virtaL3={draft.latausTulistusPumppuVirtaL3}
                      onVirta1vaihe={(v) => patchDraft({ latausTulistusPumppuVirta1vaihe: v })}
                      onVirtaL1={(v) => patchDraft({ latausTulistusPumppuVirtaL1: v })}
                      onVirtaL2={(v) => patchDraft({ latausTulistusPumppuVirtaL2: v })}
                      onVirtaL3={(v) => patchDraft({ latausTulistusPumppuVirtaL3: v })}
                    />
                  </>
                ) : null}
                <div className="line-form-grid">
                  <label>
                    Neste
                    <select value={draft.latausTulistusNeste} onChange={(e) => patchDraft({ latausTulistusNeste: e.target.value })}>
                      {mlpNestOptions.map((o) => (
                        <option key={`t-${o.label}`} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </label>
                  <FormInput label="Virtaus (l/s)" value={draft.latausTulistusVirtaus} onChange={(v) => patchDraft({ latausTulistusVirtaus: v })} type="number" />
                  <FormInput label="Meno (°C)" value={draft.latausTulistusMeno} onChange={(v) => patchDraft({ latausTulistusMeno: v })} type="number" />
                  <FormInput label="Tulo (°C)" value={draft.latausTulistusTulo} onChange={(v) => patchDraft({ latausTulistusTulo: v })} type="number" />
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {draftStatus === 'faulty' ? (
          <label className="konvektori-huomio-field">
            <span className="konvektori-tarkastus-label">Mikä on vikana?</span>
            <textarea rows={3} value={draft.latausTarkastusHuomio ?? ''} onChange={(e) => patchDraft({ latausTarkastusHuomio: e.target.value })} />
          </label>
        ) : null}
      </HuoltoInspectionDialogShell>
    </>
  );
}
