import type { HuoltoReportData, VapaajahdytysOhjaus } from '../../lib/huoltoRaportti/types';
import { mlpNestOptions } from '../../lib/huoltoRaportti/constants';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';
import { HuoltoModuleSection } from './HuoltoModuleSection';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
}

export function VapaajahdytysSection({ form, onChange }: Props) {
  const data = form.vapaajahdytysData ?? {
    neste: '',
    virtaus: '',
    meno: '',
    tulo: '',
    pumppuTarkastettu: false,
    pumppuValmistaja: '',
    pumppuMalli: '',
    ohjaus: '' as VapaajahdytysOhjaus,
  };

  const patch = (next: Partial<typeof data>) =>
    onChange({ vapaajahdytysData: { ...data, ...next } });

  return (
    <HuoltoModuleSection moduleKey="vapaajahdytys" title="Vapaajäähdytys">
      <div className="line-form-grid">
        <label>
          Ohjaus
          <select
            value={data.ohjaus}
            onChange={(e) => patch({ ohjaus: e.target.value as VapaajahdytysOhjaus })}
          >
            <option value="">Valitse…</option>
            <option value="kone">Kone ohjaa</option>
            <option value="taloautomaatio">Taloautomaatio ohjaa</option>
          </select>
        </label>
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
