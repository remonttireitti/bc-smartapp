import { useCallback, useEffect, useState } from 'react';
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
import { HuoltoInspectionDialogShell } from './HuoltoInspectionDialogShell';
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

  const draftStatus = normalizeHuoltoInspectionStatus(draft.tarkastusTila) ?? nestelauhdutinInspectionStatus(draft);
  const showDetails = draftStatus === 'ok' || draftStatus === 'faulty';

  const closeDialog = useCallback(() => {
    const status = normalizeHuoltoInspectionStatus(draft.tarkastusTila) ?? nestelauhdutinInspectionStatus(draft);
    if (status !== null) onChange(draft);
    setDialogOpen(false);
  }, [draft, onChange]);

  const renderDetails = (
    source: NestelauhdutinUnitData,
    setSource: (updater: NestelauhdutinUnitData | ((prev: NestelauhdutinUnitData) => NestelauhdutinUnitData)) => void,
  ) => {
    const fanCnt = Math.min(16, Math.max(0, source.puhaltimienMaara ?? 0));

    const updateFans = (fn: (prev: CondenserFanData[]) => CondenserFanData[]) => {
      setSource((prev) => ({ ...prev, puhaltimet: fn(prev.puhaltimet || []) }));
    };

    return (
      <>
        <FormCheckbox
          label="Lauhdutin (kenno) puhdistettu tai ei tarvitse puhdistusta"
          checked={!!source.lauhdutinPuhdistettu}
          onChange={(v) => setSource((prev) => ({ ...prev, lauhdutinPuhdistettu: v }))}
        />
        {source.lauhdutinPuhdistettu ? (
          <FormInput
            label="Puhdistustapa"
            value={source.lauhdutinPuhdistusTapa || ''}
            onChange={(v) => setSource((prev) => ({ ...prev, lauhdutinPuhdistusTapa: v }))}
            className="huolto-span-all"
          />
        ) : null}

        <div className="line-form-grid huolto-measurement-grid">
          <FormInput label="Valmistaja" value={source.valmistaja} onChange={(v) => setSource((prev) => ({ ...prev, valmistaja: v }))} />
          <FormInput label="Malli" value={source.malli} onChange={(v) => setSource((prev) => ({ ...prev, malli: v }))} />
          <FormInput label="Sarjanumero" value={source.sarjanumero} onChange={(v) => setSource((prev) => ({ ...prev, sarjanumero: v }))} />
        </div>

        <div className="line-form-grid huolto-measurement-grid">
          <label>
            Puhaltimien määrä
            <select
              value={source.puhaltimienMaara ?? 0}
              onChange={(e) => {
                const raw = parseInt(e.target.value, 10);
                const maara = Number.isFinite(raw) ? Math.min(16, Math.max(0, raw)) : 0;
                const prevFans = source.puhaltimet || [];
                const phDefault: FanPhaseType = source.puhallinSyotto === '400' ? 3 : 1;
                const uudet =
                  maara === 0
                    ? []
                    : Array.from({ length: maara }, (_, i) => {
                        const ex = prevFans[i];
                        return (
                          ex || {
                            id: i + 1,
                            phase: phDefault,
                            jannite: source.puhallinSyotto,
                            virtaL1: '',
                            virtaL2: phDefault === 3 ? '' : '',
                            virtaL3: phDefault === 3 ? '' : '',
                          }
                        );
                      }).map((p, i) => ({
                        ...p,
                        id: i + 1,
                        jannite: source.puhallinSyotto,
                        phase: source.puhallinSyotto === '400' ? (3 as FanPhaseType) : p.phase === 3 ? 3 : 1,
                      }));
                setSource((prev) => ({ ...prev, puhaltimienMaara: maara, puhaltimet: uudet }));
              }}
            >
              {Array.from({ length: 17 }, (_, n) => n).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label>
            Puhaltimien syöttö
            <select
              value={source.puhallinSyotto}
              onChange={(e) => {
                const sy = e.target.value as SahkoJanniteType;
                setSource((prev) => {
                  const next = { ...prev, puhallinSyotto: sy };
                  next.puhaltimet = (next.puhaltimet || []).map((p) =>
                    sy === '400' ? { ...p, jannite: sy, phase: 3 as FanPhaseType } : { ...p, jannite: sy },
                  );
                  return next;
                });
              }}
            >
              <option value="230">230 V</option>
              <option value="400">400 V</option>
            </select>
          </label>
          <FormInput label="Puhaltimien valmistaja" value={source.puhaltimienValmistaja} onChange={(v) => setSource((prev) => ({ ...prev, puhaltimienValmistaja: v }))} />
          <FormInput label="Puhaltimien malli" value={source.puhaltimienMalli} onChange={(v) => setSource((prev) => ({ ...prev, puhaltimienMalli: v }))} />
        </div>

        <div className="line-form-grid huolto-measurement-grid">
          <label className="huolto-span-all">
            Puhaltimen ohjaustapa
            <select
              value={source.puhallinOhjausTapa || ''}
              onChange={(e) =>
                setSource((prev) => ({
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
              value={source.ohjausLahde || ''}
              onChange={(e) => setSource((prev) => ({ ...prev, ohjausLahde: e.target.value as NestelauhdutinOhjausLahde | '' }))}
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
          checked={source.puhallinMoottoriVirratMitattu}
          onChange={(v) => setSource((prev) => ({ ...prev, puhallinMoottoriVirratMitattu: v }))}
        />

        {source.puhallinMoottoriVirratMitattu && fanCnt > 0 ? (
          <div className="line-form-grid huolto-measurement-grid">
            {(source.puhaltimet || []).slice(0, fanCnt).map((puhallin, fidx) => {
              const syotto400 = source.puhallinSyotto === '400';
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
    );
  };

  return (
    <>
      <HuoltoPartInspectionRow
        title={`Nestelauhdutin ${index + 1}`}
        subtitle={subtitle || undefined}
        status={status}
        onInspect={() => setDialogOpen(true)}
      />

      <HuoltoInspectionDialogShell
        open={dialogOpen}
        title={`Nestelauhdutin ${index + 1}`}
        titleId={`neste-dialog-title-${index}`}
        onClose={closeDialog}
      >
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

        {showDetails ? renderDetails(draft, setDraft) : null}

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
      </HuoltoInspectionDialogShell>
    </>
  );
}
