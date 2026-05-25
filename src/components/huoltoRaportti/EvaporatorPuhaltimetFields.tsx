import type { CondenserFanData } from '../../lib/huoltoRaportti/types';
import { applyJanniteToCondenserFan, condenserFanIsThreePhase } from '../../lib/huoltoRaportti/condenserFanJannite';
import { createEmptyEvaporatorFan } from '../../lib/huoltoRaportti/defaults';
import { FormInput } from './FormInput';

type Props = {
  puhaltimienMaara: number;
  puhaltimet: CondenserFanData[];
  maxPuhaltimia?: number;
  onChange: (patch: { puhaltimienMaara?: number; puhaltimet?: CondenserFanData[] }) => void;
};

export function EvaporatorPuhaltimetFields({
  puhaltimienMaara,
  puhaltimet,
  maxPuhaltimia = 10,
  onChange,
}: Props) {
  const opts = Array.from({ length: maxPuhaltimia }, (_, i) => i + 1);

  return (
    <div className="huolto-submodule">
      <div className="huolto-circuit-header">
        <h4>Puhaltimet</h4>
        <label>
          Määrä
          <select
            value={puhaltimienMaara}
            onChange={(e) => {
              const maara = parseInt(e.target.value, 10);
              const uudetPuhaltimet = Array.from({ length: maara }, (_, i) => {
                return puhaltimet[i] || createEmptyEvaporatorFan(i + 1);
              });
              onChange({ puhaltimienMaara: maara, puhaltimet: uudetPuhaltimet });
            }}
          >
            {opts.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="line-form-grid">
        {puhaltimet?.map((puhallin, idx) => {
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

          const setPuhaltimet = (next: CondenserFanData[]) => onChange({ puhaltimet: next });

          return (
            <div key={puhallin.id} className="huolto-submodule huolto-span-all">
              <h4>Puhallin {idx + 1}</h4>
              <div className="line-form-grid">
                <label>
                  Syöttöjännite
                  <select
                    value={puhallin.jannite || '230'}
                    onChange={(e) => {
                      const uudet = [...(puhaltimet || [])];
                      uudet[idx] = applyJanniteToCondenserFan(uudet[idx], e.target.value as '230' | '400');
                      setPuhaltimet(uudet);
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
                    const uudet = [...(puhaltimet || [])];
                    uudet[idx] = { ...uudet[idx], virtaL1: v };
                    setPuhaltimet(uudet);
                  }}
                  placeholder="0.0"
                  type="number"
                />
                {fan3eff && (
                  <>
                    <FormInput
                      label="L2 (A)"
                      value={puhallin.virtaL2 || ''}
                      onChange={(v) => {
                        const uudet = [...(puhaltimet || [])];
                        uudet[idx] = { ...uudet[idx], virtaL2: v };
                        setPuhaltimet(uudet);
                      }}
                      placeholder="0.0"
                      type="number"
                    />
                    <FormInput
                      label="L3 (A)"
                      value={puhallin.virtaL3 || ''}
                      onChange={(v) => {
                        const uudet = [...(puhaltimet || [])];
                        uudet[idx] = { ...uudet[idx], virtaL3: v };
                        setPuhaltimet(uudet);
                      }}
                      placeholder="0.0"
                      type="number"
                    />
                  </>
                )}
              </div>
              {fan3eff && maxDev > 5 && (
                <div className={`huolto-alert huolto-alert-${maxDev > 10 ? 'danger' : 'warning'}`}>
                  {maxDev > 10
                    ? `Vaara: vaihe-epätasapaino ${maxDev.toFixed(1)}%`
                    : `Huom: vaihe-epätasapaino ${maxDev.toFixed(1)}%`}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
