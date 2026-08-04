import { createEmptyJaahdytysvesiData } from '../../lib/huoltoRaportti/defaults';
import { isWaterCooledChiller } from '../../lib/huoltoRaportti/deviceModuleLogic';
import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import ToggleSwitch from '../ToggleSwitch';
import { HuoltoModuleSection } from './HuoltoModuleSection';
import { jaahdytysvesiSectionTitle } from '../../lib/huoltoRaportti/sectionTitles';
import { NestepiiriInspection } from './NestepiiriInspection';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
}

export function JaahdytysvesiSection({ form, onChange }: Props) {
  const data = form.jaahdytysvesiData ?? createEmptyJaahdytysvesiData();
  const isVj = isWaterCooledChiller(form.laiteTyyppi);
  const isVak = form.laiteTyyppi === 'vakioilmastointtikone';
  const title = jaahdytysvesiSectionTitle(form.laiteTyyppi);

  const patch = (next: Partial<typeof data>) =>
    onChange({ jaahdytysvesiData: { ...data, ...next } });

  return (
    <HuoltoModuleSection moduleKey="vedenjajahdytyskone" title={title}>
      <p className="muted huolto-help">
        {isVj
          ? 'Jäähdytysveden nestekierto kuuluu vedenjäähdytyskoneeseen.'
          : isVak
            ? 'Höyrystimen jäähdytyspiir ja jäähdytysveden piiri ovat sama nestekiertue. Höyrystimen tekniset tiedot täytetään kylmäainepiirin kohdalla.'
            : 'Nestekiertoinen jäähdytysveden piiri kuuluu aina vedenjäähdytyskoneeseen ja vakioilmastointikoneeseen.'}
      </p>
      {isVak && (
        <label className="checkbox-inline huolto-span-all">
          <ToggleSwitch
            label="Yhteinen höyrystin kaikille kylmäainepiireille"
            checked={form.hoyrystinYhteinenPiireissa ?? true}
            onChange={(checked) => onChange({ hoyrystinYhteinenPiireissa: checked })}
          />
        </label>
      )}
      <div className="huolto-part-inspection-list">
        <NestepiiriInspection title={title} data={data} onChange={patch} showPiiriTarkistukset />
      </div>
    </HuoltoModuleSection>
  );
}
