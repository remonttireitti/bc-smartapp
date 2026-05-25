import type { PumpunSyottoValinta } from '../../lib/huoltoRaportti/types';
import { calculatePhaseImbalance, getPhaseImbalanceSeverity } from '../../lib/huoltoRaportti/utils';
import { FormInput } from './FormInput';

interface Props {
  syottoValinta: PumpunSyottoValinta;
  onSyottoValintaChange: (v: PumpunSyottoValinta) => void;
  virta1vaihe: string;
  virtaL1: string;
  virtaL2: string;
  virtaL3: string;
  onVirta1vaihe: (v: string) => void;
  onVirtaL1: (v: string) => void;
  onVirtaL2: (v: string) => void;
  onVirtaL3: (v: string) => void;
}

export function PumpSupplyMeasurementBlock({
  syottoValinta,
  onSyottoValintaChange,
  virta1vaihe,
  virtaL1,
  virtaL2,
  virtaL3,
  onVirta1vaihe,
  onVirtaL1,
  onVirtaL2,
  onVirtaL3,
}: Props) {
  const kolmeVaihetta = syottoValinta === '400_3';
  const l1 = parseFloat(virtaL1) || 0;
  const l2 = parseFloat(virtaL2) || 0;
  const l3 = parseFloat(virtaL3) || 0;
  const maxDev = kolmeVaihetta ? calculatePhaseImbalance(l1, l2, l3) : 0;
  const sev = kolmeVaihetta ? getPhaseImbalanceSeverity(maxDev) : 'normal';

  return (
    <div className="huolto-submodule">
      <h4>Pumpun syöttö</h4>
      <div className="line-form-grid">
        <label className="huolto-span-all">
          Syöttöjännite
          <select
            value={syottoValinta}
            onChange={(e) => onSyottoValintaChange(e.target.value as PumpunSyottoValinta)}
          >
            <option value="">Valitse</option>
            <option value="230_1">230 V (1-vaihe)</option>
            <option value="400_3">400 V (3-vaihe)</option>
          </select>
        </label>
        {syottoValinta === '230_1' && (
          <FormInput
            label="Ampeeri (A)"
            value={virta1vaihe}
            onChange={onVirta1vaihe}
            placeholder="0.0"
            type="number"
          />
        )}
        {syottoValinta === '400_3' && (
          <>
            <FormInput label="L1 (A)" value={virtaL1} onChange={onVirtaL1} type="number" />
            <FormInput label="L2 (A)" value={virtaL2} onChange={onVirtaL2} type="number" />
            <FormInput label="L3 (A)" value={virtaL3} onChange={onVirtaL3} type="number" />
          </>
        )}
      </div>
      {kolmeVaihetta && maxDev > 5 && (
        <div className={`huolto-alert huolto-alert-${sev === 'danger' ? 'danger' : 'warning'}`}>
          {maxDev > 10
            ? `Vaara: vaihe-epätasapaino ${maxDev.toFixed(1)}%`
            : `Huom: vaihe-epätasapaino ${maxDev.toFixed(1)}%`}
        </div>
      )}
    </div>
  );
}
