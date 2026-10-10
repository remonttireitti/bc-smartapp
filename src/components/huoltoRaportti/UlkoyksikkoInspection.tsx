import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { normalizeHuoltoInspectionStatus } from '../../lib/huoltoRaportti/huoltoInspectionStatus';
import { FormCheckbox } from './FormCheckbox';
import { FormInput } from './FormInput';
import { InspectionChoiceToggle } from './InspectionChoiceToggle';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
}

/**
 * Ulkoyksikön tarkastus suoraan Ulkoyksikkö-ikkunassa (ei erillistä ponnahdusikkunaa).
 * Ei oletusvalintaa: valitsematon tulos / rastiton kohta = ei kuulu.
 */
export function UlkoyksikkoInspection({ form, onChange }: Props) {
  const tila = normalizeHuoltoInspectionStatus(form.ulkoyksikkoTarkastusTila);
  return (
    <div className="huolto-ulkoyksikko-checks">
      <div className="konvektori-tarkastus-item">
        <span className="konvektori-tarkastus-label">Tarkastuksen tulos</span>
        <InspectionChoiceToggle
          name="ulkoyksikko-tila"
          value={tila === 'na' ? null : tila}
          onChange={(next) => onChange({ ulkoyksikkoTarkastusTila: next, ...(next === 'faulty' ? {} : { ulkoyksikkoTarkastusHuomio: '' }) })}
        />
      </div>
      <div className="checkbox-grid huolto-toggle-grid">
        <FormCheckbox
          label="Kenno puhdistettu tai puhdas"
          checked={!!form.ulkoyksikkoKennosPuhdas}
          onChange={(v) => onChange({ ulkoyksikkoKennosPuhdas: v, ...(v ? {} : { ulkoyksikkoKennoPuhdistustapa: '' }) })}
        />
        {form.ulkoyksikkoKennosPuhdas ? (
          <FormInput
            label="Kennon puhdistustapa"
            value={form.ulkoyksikkoKennoPuhdistustapa || ''}
            onChange={(v) => onChange({ ulkoyksikkoKennoPuhdistustapa: v })}
            className="huolto-span-all"
          />
        ) : null}
        <FormCheckbox
          label="Ulkoyksiköllä sulatusveden keräily/ohjaus"
          checked={!!form.ulkoyksikkoSulatausVedenKeraily}
          onChange={(v) => onChange({ ulkoyksikkoSulatausVedenKeraily: v, ...(v ? {} : { ulkoyksikkoSulatausVedenTarkistettu: false }) })}
        />
        {form.ulkoyksikkoSulatausVedenKeraily ? (
          <FormCheckbox
            label="Sulatusveden keräily tarkistettu/kunnossa"
            checked={!!form.ulkoyksikkoSulatausVedenTarkistettu}
            onChange={(v) => onChange({ ulkoyksikkoSulatausVedenTarkistettu: v })}
          />
        ) : null}
        <FormCheckbox label="Ulkoyksikön vieressä turvakytkin" checked={!!form.ulkoyksikkoTurvakytkin} onChange={(v) => onChange({ ulkoyksikkoTurvakytkin: v })} />
        <FormCheckbox label="Ulkoyksiköllä suojakotelo" checked={!!form.ulkoyksikkoSuojakotelo} onChange={(v) => onChange({ ulkoyksikkoSuojakotelo: v })} />
      </div>
      {tila === 'faulty' ? (
        <label className="konvektori-huomio-field">
          <span className="konvektori-tarkastus-label">Mikä on vikana?</span>
          <textarea rows={3} value={form.ulkoyksikkoTarkastusHuomio ?? ''} onChange={(e) => onChange({ ulkoyksikkoTarkastusHuomio: e.target.value })} />
        </label>
      ) : null}
    </div>
  );
}
