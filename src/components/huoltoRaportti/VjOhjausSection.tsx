import { createEmptyVjOhjausData } from '../../lib/huoltoRaportti/defaults';
import type { HuoltoReportData, VjLauhdutusOhjausLahde } from '../../lib/huoltoRaportti/types';
import { FormInput } from './FormInput';
import { HuoltoModuleSection } from './HuoltoModuleSection';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
}

export function VjOhjausSection({ form, onChange }: Props) {
  const data = form.vjOhjausData ?? createEmptyVjOhjausData();
  const patch = (next: Partial<typeof data>) => onChange({ vjOhjausData: { ...data, ...next } });

  return (
    <HuoltoModuleSection moduleKey="vjOhjaus" title="Ohjaus">
      <div className="line-form-grid">
        <FormInput
          label="Ohjauksen valmistaja / järjestelmä"
          value={data.ohjausValmistaja}
          onChange={(v) => patch({ ohjausValmistaja: v })}
          className="huolto-span-all"
        />
        <label className="huolto-span-all">
          Lauhdutuksen ohjaus
          <select
            value={data.lauhdutusOhjausLahde}
            onChange={(e) => patch({ lauhdutusOhjausLahde: e.target.value as VjLauhdutusOhjausLahde })}
          >
            <option value="">Valitse…</option>
            <option value="kone">Koneen säätimestä</option>
            <option value="taloautomaatio">Taloautomaatiosta</option>
          </select>
        </label>
        <FormInput
          label="Asetusarvot"
          value={data.asetusArvot}
          onChange={(v) => patch({ asetusArvot: v })}
          className="huolto-span-all"
          placeholder="Esim. meno/paluu, ΔT, paineet…"
        />
        <label className="huolto-span-all">
          Vapaa kuvaus ohjauksesta
          <textarea
            value={data.kuvaus}
            onChange={(e) => patch({ kuvaus: e.target.value })}
            rows={3}
            placeholder="Lisätiedot ohjauksesta…"
          />
        </label>
      </div>
    </HuoltoModuleSection>
  );
}
