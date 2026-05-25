import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { mlpNestOptions } from '../../lib/huoltoRaportti/constants';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';
import { HuoltoModuleSection } from './HuoltoModuleSection';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
}

export function JaahdytysvesiSection({ form, onChange }: Props) {
  const data = form.jaahdytysvesiData ?? {
    neste: '',
    virtaus: '',
    meno: '',
    tulo: '',
    pumppuTarkastettu: false,
    pumppuValmistaja: '',
    pumppuMalli: '',
  };

  const patch = (next: Partial<typeof data>) =>
    onChange({ jaahdytysvesiData: { ...data, ...next } });

  return (
    <HuoltoModuleSection moduleKey="vedenjajahdytyskone" title="Jäähdytysveden piiri">
      <p className="muted huolto-help">
        Nestekiertoinen jäähdytysveden piiri kuuluu aina vedenjäähdytyskoneeseen ja vakioilmastointikoneeseen.
      </p>
      <div className="line-form-grid">
        <label>
          Neste
          <select value={data.neste} onChange={(e) => patch({ neste: e.target.value })}>
            <option value="">Valitse…</option>
            {mlpNestOptions.map((opt) => (
              <option key={opt.label} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <FormInput label="Virtaus (m³/h)" value={data.virtaus} onChange={(v) => patch({ virtaus: v })} type="number" />
        <FormInput label="Meno (°C)" value={data.meno} onChange={(v) => patch({ meno: v })} type="number" />
        <FormInput label="Paluu (°C)" value={data.tulo} onChange={(v) => patch({ tulo: v })} type="number" />
      </div>
      <FormCheckbox
        label="Pumppu tarkastettu"
        checked={data.pumppuTarkastettu}
        onChange={(v) => patch({ pumppuTarkastettu: v })}
      />
      {data.pumppuTarkastettu && (
        <div className="line-form-grid">
          <FormInput
            label="Pumpun valmistaja"
            value={data.pumppuValmistaja}
            onChange={(v) => patch({ pumppuValmistaja: v })}
          />
          <FormInput label="Pumpun malli" value={data.pumppuMalli} onChange={(v) => patch({ pumppuMalli: v })} />
        </div>
      )}
    </HuoltoModuleSection>
  );
}
