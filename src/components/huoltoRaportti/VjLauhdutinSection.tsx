import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { chillerLauhdutinTypeOptions } from '../../lib/huoltoRaportti/constants';
import { hasExternalNestelauhdutin } from '../../lib/huoltoRaportti/deviceModuleLogic';
import ToggleSwitch from '../ToggleSwitch';
import { HuoltoModuleSection } from './HuoltoModuleSection';

interface Props {
  form: HuoltoReportData;
  onCondenserTypeChange: (tyyppi: HuoltoReportData['lauhdutinTyyppiLaite']) => void;
  onFreeCoolingChange: (checked: boolean) => void;
  onChange: (patch: Partial<HuoltoReportData>) => void;
}

export function VjLauhdutinSection({
  form,
  onCondenserTypeChange,
  onFreeCoolingChange,
  onChange,
}: Props) {
  return (
    <HuoltoModuleSection moduleKey="lauhdutin" title="Lauhdutin">
      <p className="muted huolto-help">
        Ilmalauhdutin (integroitu / erillinen) tai levy-/putkilämmönvaihdin — joko ulkoisen nestelauhduttimen kanssa tai ilman.
      </p>
      <label className="huolto-span-all">
        Lauhdutustapa
        <select
          value={form.lauhdutinTyyppiLaite ?? ''}
          onChange={(e) =>
            onCondenserTypeChange(e.target.value as HuoltoReportData['lauhdutinTyyppiLaite'])
          }
        >
          {chillerLauhdutinTypeOptions.map((opt) => (
            <option key={opt.value || 'empty'} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      {hasExternalNestelauhdutin(form.lauhdutinTyyppiLaite) && (
        <label className="checkbox-inline huolto-span-all">
          <ToggleSwitch
            label="Yhteinen nestelauhdutus kaikille kylmäainepiireille"
            checked={form.vjNestelauhdutusJaettu ?? true}
            onChange={(checked) => onChange({ vjNestelauhdutusJaettu: checked })}
          />
        </label>
      )}
      <label className="checkbox-inline huolto-span-all">
        <ToggleSwitch
          label="Vapaajäähdytys käytössä"
          checked={!!form.vapaajahdytysKaytossa}
          onChange={onFreeCoolingChange}
        />
      </label>
    </HuoltoModuleSection>
  );
}
