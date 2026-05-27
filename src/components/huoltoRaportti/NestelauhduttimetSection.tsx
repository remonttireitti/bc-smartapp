import type {
  CondenserFanData,
  FanPhaseType,
  NestelauhdutinOhjausLahde,
  NestelauhdutinPuhallinOhjausTapa,
  NestelauhdutinUnitData,
  SahkoJanniteType,
} from '../../lib/huoltoRaportti/types';
import { createEmptyLauhdutuspiiriData, createEmptyNestelauhdutinUnit } from '../../lib/huoltoRaportti/defaults';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';
import { HuoltoModuleSection } from './HuoltoModuleSection';
import { NestepiiriFields } from './NestepiiriFields';

interface Props {
  units: NestelauhdutinUnitData[];
  shared?: boolean;
  onChange: (next: NestelauhdutinUnitData[]) => void;
}

export function NestelauhduttimetSection({ units, shared = false, onChange }: Props) {
  const lkm = shared ? 1 : Math.min(4, Math.max(1, units.length));

  const setLkm = (n: number) => {
    const nextN = Math.min(4, Math.max(1, n));
    const next = [...units];
    if (nextN > next.length) {
      while (next.length < nextN) next.push(createEmptyNestelauhdutinUnit());
    } else {
      next.length = nextN;
    }
    onChange(next);
  };

  const patchUnit = (idx: number, patch: Partial<NestelauhdutinUnitData>) => {
    const next = [...units];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  return (
    <HuoltoModuleSection moduleKey="nestelauhduttimet" title="Nestelauhduttimet">
      {!shared && (
      <div className="huolto-submodule">
        <label>
          Nestelauhduttimien lukumäärä
          <select value={lkm} onChange={(e) => setLkm(parseInt(e.target.value, 10))}>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n} kpl
              </option>
            ))}
          </select>
        </label>
        <p className="muted huolto-help">Valitse 1–4 moduulia vastaamaan ulkona olevia nestelauhdutinyksiköitä.</p>
      </div>
      )}
      {shared && (
        <p className="muted huolto-help">
          Yhteinen nestelauhdutus kaikille kylmäainepiireille — yksi nestelauhdutinyksikkö.
        </p>
      )}

      {units.slice(0, lkm).map((unit, uidx) => {
        const fanCount = Math.min(16, Math.max(0, unit.puhaltimienMaara ?? 0));

        const updateFans = (fn: (prev: CondenserFanData[]) => CondenserFanData[]) => {
          const next = [...units];
          next[uidx] = { ...next[uidx], puhaltimet: fn(next[uidx].puhaltimet || []) };
          onChange(next);
        };

        const syncSyottoFans = (sy: SahkoJanniteType) => {
          const next = [...units];
          const u = { ...next[uidx], puhallinSyotto: sy };
          u.puhaltimet = (u.puhaltimet || []).map((p) =>
            sy === '400' ? { ...p, jannite: sy, phase: 3 as FanPhaseType } : { ...p, jannite: sy },
          );
          next[uidx] = u;
          onChange(next);
        };

        return (
          <div key={unit.id} className="huolto-submodule huolto-form-stack">
            <h3>Nestelauhdutin {uidx + 1}</h3>

            <FormCheckbox
              label="Lauhdutin (kenno) puhdistettu tai ei tarvitse puhdistusta"
              checked={!!unit.lauhdutinPuhdistettu}
              onChange={(v) => patchUnit(uidx, { lauhdutinPuhdistettu: v })}
            />
            {unit.lauhdutinPuhdistettu && (
              <FormInput
                label="Puhdistustapa"
                value={unit.lauhdutinPuhdistusTapa || ''}
                onChange={(v) => patchUnit(uidx, { lauhdutinPuhdistusTapa: v })}
                className="huolto-span-all"
              />
            )}

            <div className="huolto-field-group">
              <p className="huolto-field-group-title">Lauhdutin</p>
              <div className="line-form-grid huolto-measurement-grid">
              <FormInput label="Lauhduttimen valmistaja" value={unit.valmistaja} onChange={(v) => patchUnit(uidx, { valmistaja: v })} />
              <FormInput label="Lauhduttimen malli" value={unit.malli} onChange={(v) => patchUnit(uidx, { malli: v })} />
              <FormInput label="Lauhduttimen sarjanumero" value={unit.sarjanumero} onChange={(v) => patchUnit(uidx, { sarjanumero: v })} />
              </div>
            </div>

            <div className="huolto-field-group">
              <p className="huolto-field-group-title">Lauhdutuspiiri</p>
              <NestepiiriFields
                data={unit.lauhdutuspiiri ?? createEmptyLauhdutuspiiriData()}
                onChange={(patch) =>
                  patchUnit(uidx, {
                    lauhdutuspiiri: { ...(unit.lauhdutuspiiri ?? createEmptyLauhdutuspiiriData()), ...patch },
                  })
                }
                showLauhdutinTarkistukset
                showPiiriTarkistukset
              />
            </div>

            <div className="huolto-field-group">
              <p className="huolto-field-group-title">Puhaltimet</p>
              <div className="line-form-grid huolto-measurement-grid">
              <label>
                Puhaltimien määrä
                <select
                  value={unit.puhaltimienMaara ?? 0}
                  onChange={(e) => {
                    const raw = parseInt(e.target.value, 10);
                    const maara = Number.isFinite(raw) ? Math.min(16, Math.max(0, raw)) : 0;
                    const prevFans = unit.puhaltimet || [];
                    const phDefault: FanPhaseType = unit.puhallinSyotto === '400' ? 3 : 1;
                    const uudet =
                      maara === 0
                        ? []
                        : Array.from({ length: maara }, (_, i) => {
                            const ex = prevFans[i];
                            return (
                              ex || {
                                id: i + 1,
                                phase: phDefault,
                                jannite: unit.puhallinSyotto,
                                virtaL1: '',
                                virtaL2: phDefault === 3 ? '' : '',
                                virtaL3: phDefault === 3 ? '' : '',
                              }
                            );
                          }).map((p, i) => ({
                            ...p,
                            id: i + 1,
                            jannite: unit.puhallinSyotto,
                            phase: unit.puhallinSyotto === '400' ? (3 as FanPhaseType) : p.phase === 3 ? 3 : 1,
                          }));
                    patchUnit(uidx, { puhaltimienMaara: maara, puhaltimet: uudet });
                  }}
                >
                  {Array.from({ length: 17 }, (_, n) => n).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Puhaltimien syöttö
                <select value={unit.puhallinSyotto} onChange={(e) => syncSyottoFans(e.target.value as SahkoJanniteType)}>
                  <option value="230">230 V</option>
                  <option value="400">400 V</option>
                </select>
              </label>
              <FormInput
                label="Puhaltimien valmistaja"
                value={unit.puhaltimienValmistaja}
                onChange={(v) => patchUnit(uidx, { puhaltimienValmistaja: v })}
              />
              <FormInput
                label="Puhaltimien malli"
                value={unit.puhaltimienMalli}
                onChange={(v) => patchUnit(uidx, { puhaltimienMalli: v })}
              />
              </div>
            </div>

            <div className="line-form-grid huolto-measurement-grid">
              <label className="huolto-span-all">
                Puhaltimen ohjaustapa
                <select
                  value={unit.puhallinOhjausTapa || ''}
                  onChange={(e) =>
                    patchUnit(uidx, {
                      puhallinOhjausTapa: e.target.value as NestelauhdutinPuhallinOhjausTapa | '',
                    })
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
                  value={unit.ohjausLahde || ''}
                  onChange={(e) =>
                    patchUnit(uidx, { ohjausLahde: e.target.value as NestelauhdutinOhjausLahde | '' })
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
              checked={unit.puhallinMoottoriVirratMitattu}
              onChange={(v) => patchUnit(uidx, { puhallinMoottoriVirratMitattu: v })}
            />

            {unit.puhallinMoottoriVirratMitattu && fanCount > 0 && (
              <div className="line-form-grid huolto-measurement-grid">
                {(unit.puhaltimet || []).slice(0, fanCount).map((puhallin, idx) => {
                  const syotto400 = unit.puhallinSyotto === '400';
                  const effectivePhase: FanPhaseType = syotto400 ? 3 : 1;
                  const virtaL1 = parseFloat(puhallin.virtaL1) || 0;
                  const virtaL2 = parseFloat(puhallin.virtaL2 || '') || 0;
                  const virtaL3 = parseFloat(puhallin.virtaL3 || '') || 0;
                  let maxDev = 0;
                  if (effectivePhase === 3) {
                    const avg = (virtaL1 + virtaL2 + virtaL3) / 3;
                    const deviations = [
                      Math.abs(virtaL1 - avg),
                      Math.abs(virtaL2 - avg),
                      Math.abs(virtaL3 - avg),
                    ];
                    maxDev = avg > 0 ? (Math.max(...deviations) / avg) * 100 : 0;
                  }

                  return (
                    <div key={puhallin.id} className="huolto-submodule huolto-span-all">
                      <h4>Puhallin {idx + 1}</h4>
                      <div className="line-form-grid">
                        <FormInput
                          label={effectivePhase === 1 ? 'Virta (A)' : 'L1 (A)'}
                          value={puhallin.virtaL1}
                          onChange={(v) => {
                            updateFans((prev) => {
                              const u = [...prev];
                              u[idx] = { ...u[idx], virtaL1: v };
                              return u;
                            });
                          }}
                          type="number"
                        />
                        {effectivePhase === 3 && (
                          <>
                            <FormInput
                              label="L2 (A)"
                              value={puhallin.virtaL2 || ''}
                              onChange={(v) => {
                                updateFans((prev) => {
                                  const u = [...prev];
                                  u[idx] = { ...u[idx], virtaL2: v };
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
                                  u[idx] = { ...u[idx], virtaL3: v };
                                  return u;
                                });
                              }}
                              type="number"
                            />
                          </>
                        )}
                      </div>
                      {effectivePhase === 3 && maxDev > 5 && (
                        <div
                          className={
                            maxDev > 10
                              ? 'huolto-alert huolto-alert-danger'
                              : 'huolto-alert huolto-alert-warning'
                          }
                        >
                          {maxDev > 10
                            ? `VAARA: Vaihe-epätasapaino ${maxDev.toFixed(1)} %`
                            : `Huom: Vaihe-epätasapaino ${maxDev.toFixed(1)} %`}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </HuoltoModuleSection>
  );
}
