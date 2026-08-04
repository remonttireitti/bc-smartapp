import { useEffect, useState } from 'react';
import type { MlpData } from '../../lib/huoltoRaportti/types';
import { mlpNestOptions } from '../../lib/huoltoRaportti/constants';
import {
  mlpKeruupiiriInspectionStatus,
  normalizeHuoltoInspectionStatus,
  type HuoltoInspectionStatus,
} from '../../lib/huoltoRaportti/huoltoInspectionStatus';
import { getMlpPumpSyottoValinta } from '../../lib/huoltoRaportti/sahkoVaiheUtils';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';
import { HuoltoPartInspectionRow } from './HuoltoPartInspectionRow';
import { PumpSupplyMeasurementBlock } from './PumpSupplyMeasurementBlock';
import { TriStateInspectionToggle } from './TriStateInspectionToggle';

interface Props {
  title: string;
  mlp: MlpData;
  onChange: (patch: Partial<MlpData>) => void;
  keruuPower: string | null;
}

function calcPower(virtaus: string, meno: string, tulo: string, c: number): string | null {
  const v = parseFloat(virtaus) || 0;
  const m = parseFloat(meno) || 0;
  const t = parseFloat(tulo) || 0;
  const deltaT = Math.abs(m - t);
  if (v > 0 && deltaT > 0 && c > 0) return (c * v * deltaT).toFixed(2);
  return null;
}

export function MlpKeruupiiriInspection({ title, mlp, onChange, keruuPower }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState(mlp);
  const status = mlpKeruupiiriInspectionStatus(mlp);

  useEffect(() => {
    if (dialogOpen) setDraft(mlp);
  }, [dialogOpen, mlp]);

  useEffect(() => {
    if (!dialogOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setDialogOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dialogOpen]);

  const draftStatus = normalizeHuoltoInspectionStatus(draft.keruupiiriTarkastusTila) ?? mlpKeruupiiriInspectionStatus(draft);
  const showDetails = draftStatus === 'ok' || draftStatus === 'faulty';
  const draftKeruuPower =
    calcPower(draft.keruupiiriVirtaus, draft.keruupiiriMeno, draft.keruupiiriTulo, parseFloat(draft.keruupiiriNeste) || 0) ??
    keruuPower;

  const patchDraft = (patch: Partial<MlpData>) => setDraft((prev) => ({ ...prev, ...patch }));

  return (
    <>
      <HuoltoPartInspectionRow title={title} status={status} onInspect={() => setDialogOpen(true)} />

      {dialogOpen ? (
        <div className="leave-draft-overlay konvektori-dialog-overlay" role="presentation" onClick={() => setDialogOpen(false)}>
          <div
            className="leave-draft-dialog panel konvektori-tarkastus-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mlp-keruu-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="mlp-keruu-dialog-title">{title}</h2>

            <div className="konvektori-tarkastus-item">
              <span className="konvektori-tarkastus-label">Tarkastuksen tulos</span>
              <TriStateInspectionToggle
                name="mlp-keruu-tila"
                value={draftStatus}
                onChange={(next: Exclude<HuoltoInspectionStatus, null>) =>
                  patchDraft({ keruupiiriTarkastusTila: next })
                }
              />
            </div>

            {showDetails ? (
              <>
                <div className="checkbox-grid huolto-toggle-grid">
                  <FormCheckbox
                    label="Paine tarkastettu"
                    checked={draft.keruupiirinPaineTarkastettu}
                    onChange={(v) => patchDraft({ keruupiirinPaineTarkastettu: v, ...(v ? {} : { keruupiiriPaineBar: '' }) })}
                  />
                  <FormCheckbox label="Mutasihti puhdistettu" checked={draft.keruupiirissaMutapussiPuhdistettu} onChange={(v) => patchDraft({ keruupiirissaMutapussiPuhdistettu: v })} />
                  <FormCheckbox label="Pumppu tarkastettu" checked={draft.keruupiirinPumppuTarkastettu} onChange={(v) => patchDraft({ keruupiirinPumppuTarkastettu: v })} />
                  <FormCheckbox label="Eristeet kunnossa" checked={draft.keruupiirinEristeetKunnossa} onChange={(v) => patchDraft({ keruupiirinEristeetKunnossa: v })} />
                  <FormCheckbox label="Automaattinen ilmaus tarkistettu" checked={draft.keruupiirissaAutomaattinenIlmausTarkistettu} onChange={(v) => patchDraft({ keruupiirissaAutomaattinenIlmausTarkistettu: v })} />
                  <FormCheckbox label="Paisunta-astia tarkastettu" checked={draft.keruuPaisuntaAstiaTarkistettu} onChange={(v) => patchDraft({ keruuPaisuntaAstiaTarkistettu: v })} />
                </div>
                {draft.keruupiirinPaineTarkastettu ? (
                  <FormInput label="Mitattu paine (bar)" value={draft.keruupiiriPaineBar} onChange={(v) => patchDraft({ keruupiiriPaineBar: v })} type="number" />
                ) : null}
                {draft.keruupiirinPumppuTarkastettu ? (
                  <>
                    <div className="line-form-grid">
                      <FormInput label="Pumpun valmistaja" value={draft.keruupiiriPumpunValmistaja} onChange={(v) => patchDraft({ keruupiiriPumpunValmistaja: v })} />
                      <FormInput label="Pumpun malli" value={draft.keruupiiriPumpunMalli} onChange={(v) => patchDraft({ keruupiiriPumpunMalli: v })} />
                    </div>
                    <PumpSupplyMeasurementBlock
                      syottoValinta={getMlpPumpSyottoValinta(draft.keruupiiriPumpunSyottoValinta, draft.keruupiiriPumppuKolmeVaihetta)}
                      onSyottoValintaChange={(v) => {
                        setDraft((prev) => ({
                          ...prev,
                          keruupiiriPumpunSyottoValinta: v,
                          keruupiiriPumppuKolmeVaihetta: v === '400_3' ? true : v === '230_1' ? false : undefined,
                        }));
                      }}
                      virta1vaihe={draft.keruupiiriPumppuVirta1vaihe}
                      virtaL1={draft.keruupiiriPumppuVirtaL1}
                      virtaL2={draft.keruupiiriPumppuVirtaL2}
                      virtaL3={draft.keruupiiriPumppuVirtaL3}
                      onVirta1vaihe={(v) => patchDraft({ keruupiiriPumppuVirta1vaihe: v })}
                      onVirtaL1={(v) => patchDraft({ keruupiiriPumppuVirtaL1: v })}
                      onVirtaL2={(v) => patchDraft({ keruupiiriPumppuVirtaL2: v })}
                      onVirtaL3={(v) => patchDraft({ keruupiiriPumppuVirtaL3: v })}
                    />
                  </>
                ) : null}
                {draft.keruuPaisuntaAstiaTarkistettu ? (
                  <div className="line-form-grid">
                    <FormInput label="Paisunta-astia koko" value={draft.keruuPaisuntaAstiaKoko} onChange={(v) => patchDraft({ keruuPaisuntaAstiaKoko: v })} className="huolto-span-all" />
                    <FormInput label="Esipaine (bar)" value={draft.keruuPaisuntaAstiaEsipaine} onChange={(v) => patchDraft({ keruuPaisuntaAstiaEsipaine: v })} type="number" />
                  </div>
                ) : null}
                <div className="line-form-grid">
                  <FormInput label="Virtaus (l/s)" value={draft.keruupiiriVirtaus} onChange={(v) => patchDraft({ keruupiiriVirtaus: v })} type="number" />
                  <FormInput label="Meno (°C)" value={draft.keruupiiriMeno} onChange={(v) => patchDraft({ keruupiiriMeno: v })} type="number" />
                  <FormInput label="Tulo (°C)" value={draft.keruupiiriTulo} onChange={(v) => patchDraft({ keruupiiriTulo: v })} type="number" />
                  <label>
                    Neste
                    <select value={draft.keruupiiriNeste} onChange={(e) => patchDraft({ keruupiiriNeste: e.target.value })}>
                      {mlpNestOptions.map((o) => (
                        <option key={o.label} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {draftKeruuPower ? (
                  <div className="huolto-alert huolto-alert-success">Keruupiirin teho: {draftKeruuPower} kW</div>
                ) : null}
              </>
            ) : null}

            {draftStatus === 'faulty' ? (
              <label className="konvektori-huomio-field">
                <span className="konvektori-tarkastus-label">Mikä on vikana?</span>
                <textarea
                  rows={3}
                  value={draft.keruupiiriTarkastusHuomio ?? ''}
                  onChange={(e) => patchDraft({ keruupiiriTarkastusHuomio: e.target.value })}
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
