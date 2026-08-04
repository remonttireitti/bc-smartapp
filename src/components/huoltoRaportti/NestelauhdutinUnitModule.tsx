import { useEffect, useState } from 'react';
import type {
  CondenserFanData,
  FanPhaseType,
  NestelauhdutinOhjausLahde,
  NestelauhdutinPuhallinOhjausTapa,
  NestelauhdutinUnitData,
  SahkoJanniteType,
} from '../../lib/huoltoRaportti/types';
import {
  nestelauhdutinInspectionStatus,
  normalizeHuoltoInspectionStatus,
  type HuoltoInspectionStatus,
} from '../../lib/huoltoRaportti/huoltoInspectionStatus';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';
import { HuoltoPartInspectionRow } from './HuoltoPartInspectionRow';
import { TriStateInspectionToggle } from './TriStateInspectionToggle';

interface Props {
  index: number;
  unit: NestelauhdutinUnitData;
  onChange: (unit: NestelauhdutinUnitData) => void;
}

export function NestelauhdutinUnitModule({ index, unit, onChange }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState(unit);
  const status = nestelauhdutinInspectionStatus(unit);
  const subtitle = [unit.valmistaja, unit.malli].map((v) => String(v ?? '').trim()).filter(Boolean).join(' · ');

  useEffect(() => {
    if (dialogOpen) setDraft(unit);
  }, [dialogOpen, unit]);

  useEffect(() => {
    if (!dialogOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setDialogOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dialogOpen]);

  const draftStatus = normalizeHuoltoInspectionStatus(draft.tarkastusTila) ?? nestelauhdutinInspectionStatus(draft);
  const showDetails = draftStatus === 'ok' || draftStatus === 'faulty';
  const fanCount = Math.min(16, Math.max(0, draft.puhaltimienMaara ?? 0));

  const updateFans = (fn: (prev: CondenserFanData[]) => CondenserFanData[]) => {
    setDraft((prev) => ({ ...prev, puhaltimet: fn(prev.puhaltimet || []) }));
  };

  const syncSyottoFans = (sy: SahkoJanniteType) => {
    setDraft((prev) => {
      const u = { ...prev, puhallinSyotto: sy };
      u.puhaltimet = (u.puhaltimet || []).map((p) =>
        sy === '400' ? { ...p, jannite: sy, phase: 3 as FanPhaseType } : { ...p, jannite: sy },
      );
      return u;
    });
  };

  return (
    <>
      <HuoltoPartInspectionRow
        title={`Nestelauhdutin ${index + 1}`}
        subtitle={subtitle || undefined}
        status={status}
        onInspect={() => setDialogOpen(true)}
      />

      {dialogOpen ? (
        <div className="leave-draft-overlay konvektori-dialog-overlay" role="presentation" onClick={() => setDialogOpen(false)}>
          <div
            className="leave-draft-dialog panel konvektori-tarkastus-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`neste-dialog-title-${index}`}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id={`neste-dialog-title-${index}`}>Nestelauhdutin {index + 1}</h2>

            <div className="konvektori-tarkastus-item">
              <span className="konvektori-tarkastus-label">Tarkastuksen tulos</span>
              <TriStateInspectionToggle
                name={`neste-${index}-tila`}
                value={draftStatus}
                onChange={(next: Exclude<HuoltoInspectionStatus, null>) =>
                  setDraft((prev) => ({ ...prev, tarkastusTila: next }))
                }
              />
            </div>

            {showDetails ? (
              <>
                <FormCheckbox
                  label="Lauhdutin (kenno) puhdistettu tai ei tarvitse puhdistusta"
                  checked={!!draft.lauhdutinPuhdistettu}
                  onChange={(v) => setDraft((prev) => ({ ...prev, lauhdutinPuhdistettu: v }))}
                />
                {draft.lauhdutinPuhdistettu ? (
                  <FormInput
                    label="Puhdistustapa"
                    value={draft.lauhdutinPuhdistusTapa || ''}
                    onChange={(v) => setDraft((prev) => ({ ...prev, lauhdutinPuhdistusTapa: v }))}
                    className="huolto-span-all"
                  />
                ) : null}

                <div className="line-form-grid huolto-measurement-grid">
                  <FormInput label="Valmistaja" value={draft.valmistaja} onChange={(v) => setDraft((prev) => ({ ...prev, valmistaja: v }))} />
                  <FormInput label="Malli" value={draft.malli} onChange={(v) => setDraft((prev) => ({ ...prev, malli: v }))} />
                  <FormInput label="Sarjanumero" value={draft.sarjanumero} onChange={(v) => setDraft((prev) => ({ ...prev, sarjanumero: v }))} />
                </div>

                <div className="line-form-grid huolto-measurement-grid">
                  <label>
                    Puhaltimien määrä
                    <select
                      value={draft.puhaltimienMaara ?? 0}
                      onChange={(e) => {
                        const raw = parseInt(e.target.value, 10);
                        const maara = Number.isFinite(raw) ? Math.min(16, Math.max(0, raw)) : 0;
                        const prevFans = draft.puhaltimet || [];
                        const phDefault: FanPhaseType = draft.puhallinSyotto === '400' ? 3 : 1;
                        const uudet =
                          maara === 0
                            ? []
                            : Array.from({ length: maara }, (_, i) => {
                                const ex = prevFans[i];
                                return (
                                  ex || {
                                    id: i + 1,
                                    phase: phDefault,
                                    jannite: draft.puhallinSyotto,
                                    virtaL1: '',
                                    virtaL2: phDefault === 3 ? '' : '',
                                    virtaL3: phDefault === 3 ? '' : '',
                                  }
                                );
                              }).map((p, i) => ({
                                ...p,
                                id: i + 1,
                                jannite: draft.puhallinSyotto,
                                phase: draft.puhallinSyotto === '400' ? (3 as FanPhaseType) : p.phase === 3 ? 3 : 1,
                              }));
                        setDraft((prev) => ({ ...prev, puhaltimienMaara: maara, puhaltimet: uudet }));
                      }}
                    >
                      {Array.from({ length: 17 }, (_, n) => n).map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Puhaltimien syöttö
                    <select value={draft.puhallinSyotto} onChange={(e) => syncSyottoFans(e.target.value as SahkoJanniteType)}>
                      <option value="230">230 V</option>
                      <option value="400">400 V</option>
                    </select>
                  </label>
                  <FormInput label="Puhaltimien valmistaja" value={draft.puhaltimienValmistaja} onChange={(v) => setDraft((prev) => ({ ...prev, puhaltimienValmistaja: v }))} />
                  <FormInput label="Puhaltimien malli" value={draft.puhaltimienMalli} onChange={(v) => setDraft((prev) => ({ ...prev, puhaltimienMalli: v }))} />
                </div>

                <div className="line-form-grid huolto-measurement-grid">
                  <label className="huolto-span-all">
                    Puhaltimen ohjaustapa
                    <select
                      value={draft.puhallinOhjausTapa || ''}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          puhallinOhjausTapa: e.target.value as NestelauhdutinPuhallinOhjausTapa | '',
                        }))
                      }
                    >
                      <option value="">Valitse…</option>
                      <option value="on_off">ON/OFF</option>
                      <option value="erillinen_taajuus">Erillinen taajuusmuuntaja</option>
                      <option value="sisainen_nopeussaato">Puhaltimen sisään rakennettu nopeussäätö</option>
                    </select>
                  </label>
                  <label className="huolto-span-all">
                    Puhaltimen ohjaus tulee
                    <select
                      value={draft.ohjausLahde || ''}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, ohjausLahde: e.target.value as NestelauhdutinOhjausLahde | '' }))
                      }
                    >
                      <option value="">Valitse…</option>
                      <option value="talo_automaatio">Taloautomaatiosta</option>
                      <option value="vedenjaahdytyskone">Vedenjäähdytyskoneesta</option>
                      <option value="lampotila">Suora lämpötilan mukainen ohjaus</option>
                      <option value="korkeapaine">Suora korkeapaineen mukainen ohjaus</option>
                    </select>
                  </label>
                </div>

                <FormCheckbox
                  label="Puhaltimoottorien virrat mitattu"
                  checked={draft.puhallinMoottoriVirratMitattu}
                  onChange={(v) => setDraft((prev) => ({ ...prev, puhallinMoottoriVirratMitattu: v }))}
                />

                {draft.puhallinMoottoriVirratMitattu && fanCount > 0 ? (
                  <div className="line-form-grid huolto-measurement-grid">
                    {(draft.puhaltimet || []).slice(0, fanCount).map((puhallin, fidx) => {
                      const syotto400 = draft.puhallinSyotto === '400';
                      const effectivePhase: FanPhaseType = syotto400 ? 3 : 1;
                      return (
                        <div key={puhallin.id} className="huolto-submodule huolto-span-all">
                          <h4>Puhallin {fidx + 1}</h4>
                          <div className="line-form-grid">
                            <FormInput
                              label={effectivePhase === 1 ? 'Virta (A)' : 'L1 (A)'}
                              value={puhallin.virtaL1}
                              onChange={(v) => {
                                updateFans((prev) => {
                                  const u = [...prev];
                                  u[fidx] = { ...u[fidx], virtaL1: v };
                                  return u;
                                });
                              }}
                              type="number"
                            />
                            {effectivePhase === 3 ? (
                              <>
                                <FormInput
                                  label="L2 (A)"
                                  value={puhallin.virtaL2 || ''}
                                  onChange={(v) => {
                                    updateFans((prev) => {
                                      const u = [...prev];
                                      u[fidx] = { ...u[fidx], virtaL2: v };
                                      return u;
                                    });
                                  }}
                                  type="number"
                                />
                                <FormInput
                                  label="L3 (A)"
                                  value={puhallin.virtaL3 || ''}
                                  onChange={(v) => {
                                    updateFans((prev) => {
                                      const u = [...prev];
                                      u[fidx] = { ...u[fidx], virtaL3: v };
                                      return u;
                                    });
                                  }}
                                  type="number"
                                />
                              </>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </>
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
