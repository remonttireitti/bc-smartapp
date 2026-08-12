import type {
  CondenserFanData,
  FanPhaseType,
  NestelauhdutinOhjausLahde,
  NestelauhdutinPuhallinOhjausTapa,
  NestelauhdutinUnitData,
  SahkoJanniteType,
} from '../../lib/huoltoRaportti/types';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';

type Props = {
  unit: NestelauhdutinUnitData;
  onChange: (
    updater: NestelauhdutinUnitData | ((prev: NestelauhdutinUnitData) => NestelauhdutinUnitData),
  ) => void;
};

export function NestelauhdutinUnitFields({ unit, onChange }: Props) {
  const fanCnt = Math.min(16, Math.max(0, unit.puhaltimienMaara ?? 0));

  const updateFans = (fn: (prev: CondenserFanData[]) => CondenserFanData[]) => {
    onChange((prev) => ({ ...prev, puhaltimet: fn(prev.puhaltimet || []) }));
  };

  return (
    <>
      <FormCheckbox
        label="Lauhdutin (kenno) puhdistettu tai ei tarvitse puhdistusta"
        checked={!!unit.lauhdutinPuhdistettu}
        onChange={(v) => onChange((prev) => ({ ...prev, lauhdutinPuhdistettu: v }))}
      />
      {unit.lauhdutinPuhdistettu ? (
        <FormInput
          label="Puhdistustapa"
          value={unit.lauhdutinPuhdistusTapa || ''}
          onChange={(v) => onChange((prev) => ({ ...prev, lauhdutinPuhdistusTapa: v }))}
          className="huolto-span-all"
        />
      ) : null}

      <div className="line-form-grid huolto-measurement-grid">
        <FormInput label="Valmistaja" value={unit.valmistaja} onChange={(v) => onChange((prev) => ({ ...prev, valmistaja: v }))} />
        <FormInput label="Malli" value={unit.malli} onChange={(v) => onChange((prev) => ({ ...prev, malli: v }))} />
        <FormInput label="Sarjanumero" value={unit.sarjanumero} onChange={(v) => onChange((prev) => ({ ...prev, sarjanumero: v }))} />
      </div>

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
              onChange((prev) => ({ ...prev, puhaltimienMaara: maara, puhaltimet: uudet }));
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
          <select
            value={unit.puhallinSyotto}
            onChange={(e) => {
              const sy = e.target.value as SahkoJanniteType;
              onChange((prev) => {
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
        <FormInput
          label="Puhaltimien valmistaja"
          value={unit.puhaltimienValmistaja}
          onChange={(v) => onChange((prev) => ({ ...prev, puhaltimienValmistaja: v }))}
        />
        <FormInput
          label="Puhaltimien malli"
          value={unit.puhaltimienMalli}
          onChange={(v) => onChange((prev) => ({ ...prev, puhaltimienMalli: v }))}
        />
      </div>

      <div className="line-form-grid huolto-measurement-grid">
        <label className="huolto-span-all">
          Puhaltimen ohjaustapa
          <select
            value={unit.puhallinOhjausTapa || ''}
            onChange={(e) =>
              onChange((prev) => ({
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
            value={unit.ohjausLahde || ''}
            onChange={(e) => onChange((prev) => ({ ...prev, ohjausLahde: e.target.value as NestelauhdutinOhjausLahde | '' }))}
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
        onChange={(v) => onChange((prev) => ({ ...prev, puhallinMoottoriVirratMitattu: v }))}
      />

      {unit.puhallinMoottoriVirratMitattu && fanCnt > 0 ? (
        <div className="line-form-grid huolto-measurement-grid">
          {(unit.puhaltimet || []).slice(0, fanCnt).map((puhallin, fidx) => {
            const syotto400 = unit.puhallinSyotto === '400';
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
}
