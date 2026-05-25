import type {
  CondenserData,
  FanPhaseType,
  KompressorinVaiheValinta,
  PuhallinOhjausType,
  SahkoJanniteType,
} from '../../lib/huoltoRaportti/types';
import { applyJanniteToCondenserFan, condenserFanIsThreePhase } from '../../lib/huoltoRaportti/condenserFanJannite';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';

interface Props {
  circuitNumber: number;
  condenser: CondenserData;
  onChange: (patch: Partial<CondenserData>) => void;
}

export function ChillerCondenserInCircuit({ circuitNumber, condenser, onChange }: Props) {
  if (condenser.tyyppi === 'nestekiertoinen') {
    return null;
  }

  return (
    <div className="huolto-submodule">
      <h4>Lauhdutin (piiri {circuitNumber}) — mittaukset</h4>
      {!condenser.tyyppi && (
        <p className="muted huolto-help">
          Valitse lauhdutin / lauhde kohdassa <strong>Laite tiedot</strong>.
        </p>
      )}

      {(condenser.tyyppi === 'koneseen_integroitu' || condenser.tyyppi === 'erillinen_ilma') && (
        <>
          <FormCheckbox
            label="Lauhdutin (ilma) puhdistettu"
            checked={!!condenser.lauhdutinPuhdistettu}
            onChange={(v) => onChange({ lauhdutinPuhdistettu: v })}
          />
          {condenser.lauhdutinPuhdistettu && (
            <FormInput
              label="Puhdistustapa"
              value={condenser.lauhdutinPuhdistusTapa || ''}
              onChange={(v) => onChange({ lauhdutinPuhdistusTapa: v })}
            />
          )}

          <div className="line-form-grid">
            <label className="huolto-span-all">
              Puhaltimen ohjaustapa
              <select
                value={condenser.puhallinOhjaus || ''}
                onChange={(e) => onChange({ puhallinOhjaus: e.target.value as PuhallinOhjausType })}
              >
                <option value="">Valitse…</option>
                <option value="nopeussäädin">Nopeussäädin</option>
                <option value="taajusmuuntaja">Taajusmuuntaja</option>
                <option value="kp_pressostaatti">KP-pressostaatti</option>
                <option value="kompressorin_yhtaaikaa">Puhallin toimii kompressorin kanssa yhtä aikaa</option>
                <option value="muu">Joku muu</option>
              </select>
            </label>
            {condenser.puhallinOhjaus === 'muu' && (
              <FormInput
                label="Muu ohjaus"
                value={condenser.puhallinOhjausMuu || ''}
                onChange={(v) => onChange({ puhallinOhjausMuu: v })}
                className="huolto-span-all"
              />
            )}
            {condenser.puhallinOhjaus === 'nopeussäädin' && (
              <FormInput
                label="Nopeussäätimen malli"
                value={condenser.nopeussäädinMalli || ''}
                onChange={(v) => onChange({ nopeussäädinMalli: v })}
              />
            )}
            {condenser.puhallinOhjaus === 'taajusmuuntaja' && (
              <FormInput
                label="Taajusmuuntajan malli"
                value={condenser.taajusmuuntajaMalli || ''}
                onChange={(v) => onChange({ taajusmuuntajaMalli: v })}
              />
            )}
            {condenser.puhallinOhjaus === 'kp_pressostaatti' && (
              <FormInput
                label="KP-pressostaatin malli"
                value={condenser.kpPressostaattiMalli || ''}
                onChange={(v) => onChange({ kpPressostaattiMalli: v })}
              />
            )}
            <FormCheckbox
              label="Talvivarustus"
              checked={!!condenser.talvivarustus}
              onChange={(v) => onChange({ talvivarustus: v })}
            />
            {condenser.talvivarustus && (
              <FormInput
                label="Talvivarustuksen toteutustapa"
                value={condenser.talvivarustusTapa || ''}
                onChange={(v) => onChange({ talvivarustusTapa: v })}
                className="huolto-span-all"
              />
            )}
          </div>

          <div className="huolto-submodule">
            <div className="huolto-circuit-header">
              <h5>Puhaltimet</h5>
              <label>
                Määrä
                <select
                  value={condenser.puhaltimienMaara || 1}
                  onChange={(e) => {
                    const maara = parseInt(e.target.value, 10);
                    const uudetPuhaltimet = Array.from({ length: maara }, (_, i) => {
                      const existing = condenser.puhaltimet?.[i];
                      return (
                        existing || {
                          id: i + 1,
                          phase: 1 as FanPhaseType,
                          jannite: '230' as SahkoJanniteType,
                          vaiheValinta: '1' as KompressorinVaiheValinta,
                          virtaL1: '',
                          virtaL2: '',
                          virtaL3: '',
                        }
                      );
                    });
                    onChange({ puhaltimienMaara: maara, puhaltimet: uudetPuhaltimet });
                  }}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="line-form-grid">
              {condenser.puhaltimet?.map((puhallin, idx) => {
                const fan3eff = condenserFanIsThreePhase(puhallin);
                const virtaL1 = parseFloat(puhallin.virtaL1) || 0;
                const virtaL2 = parseFloat(puhallin.virtaL2 || '') || 0;
                const virtaL3 = parseFloat(puhallin.virtaL3 || '') || 0;
                let maxDev = 0;
                if (fan3eff) {
                  const avgVirta = (virtaL1 + virtaL2 + virtaL3) / 3;
                  const deviations = [
                    Math.abs(virtaL1 - avgVirta),
                    Math.abs(virtaL2 - avgVirta),
                    Math.abs(virtaL3 - avgVirta),
                  ];
                  maxDev = avgVirta > 0 ? (Math.max(...deviations) / avgVirta) * 100 : 0;
                }

                return (
                  <div key={puhallin.id} className="huolto-submodule huolto-span-all">
                    <h5>Puhallin {idx + 1}</h5>
                    <div className="line-form-grid">
                      <label>
                        Syöttöjännite
                        <select
                          value={puhallin.jannite || '230'}
                          onChange={(e) => {
                            const j = e.target.value as SahkoJanniteType;
                            const uudet = [...(condenser.puhaltimet || [])];
                            uudet[idx] = applyJanniteToCondenserFan(uudet[idx], j);
                            onChange({ puhaltimet: uudet });
                          }}
                        >
                          <option value="230">230 V (1-vaihe)</option>
                          <option value="400">400 V (3-vaihe)</option>
                        </select>
                      </label>
                      <FormInput
                        label={!fan3eff ? 'Virta (A)' : 'L1 (A)'}
                        value={puhallin.virtaL1}
                        onChange={(v) => {
                          const uudet = [...(condenser.puhaltimet || [])];
                          uudet[idx] = { ...uudet[idx], virtaL1: v };
                          onChange({ puhaltimet: uudet });
                        }}
                        type="number"
                      />
                      {fan3eff && (
                        <>
                          <FormInput
                            label="L2 (A)"
                            value={puhallin.virtaL2 || ''}
                            onChange={(v) => {
                              const uudet = [...(condenser.puhaltimet || [])];
                              uudet[idx] = { ...uudet[idx], virtaL2: v };
                              onChange({ puhaltimet: uudet });
                            }}
                            type="number"
                          />
                          <FormInput
                            label="L3 (A)"
                            value={puhallin.virtaL3 || ''}
                            onChange={(v) => {
                              const uudet = [...(condenser.puhaltimet || [])];
                              uudet[idx] = { ...uudet[idx], virtaL3: v };
                              onChange({ puhaltimet: uudet });
                            }}
                            type="number"
                          />
                        </>
                      )}
                    </div>
                    {fan3eff && maxDev > 5 && (
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
          </div>
        </>
      )}
    </div>
  );
}
