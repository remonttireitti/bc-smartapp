import { createEmptyJaahdytysvesiData } from '../../lib/huoltoRaportti/defaults';
import { isChillerLikeDevice } from '../../lib/huoltoRaportti/deviceModuleLogic';
import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import ToggleSwitch from '../ToggleSwitch';
import { HuoltoModuleSection } from './HuoltoModuleSection';
import { NestepiiriFields } from './NestepiiriFields';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
}

export function JaahdytysvesiSection({ form, onChange }: Props) {
  const data = form.jaahdytysvesiData ?? createEmptyJaahdytysvesiData();
  const isVj = isChillerLikeDevice(form.laiteTyyppi);

  const patch = (next: Partial<typeof data>) =>
    onChange({ jaahdytysvesiData: { ...data, ...next } });

  return (
    <HuoltoModuleSection
      moduleKey="vedenjajahdytyskone"
      title={
        isVj ? 'Jäähdytyskone — jäähdytyspiir' : 'Jäähdytysveden piiri'
      }
    >
      <p className="muted huolto-help">
        {isVj
          ? 'Höyrystimen jäähdytyspiir ja jäähdytysveden piiri ovat sama nestekiertue. Höyrystimen tekniset tiedot täytetään kylmäainepiirin kohdalla.'
          : 'Nestekiertoinen jäähdytysveden piiri kuuluu aina vedenjäähdytyskoneeseen ja vakioilmastointikoneeseen.'}
      </p>
      {isVj && (
        <label className="checkbox-inline huolto-span-all">
          <ToggleSwitch
            label="Yhteinen höyrystin kaikille kylmäainepiireille"
            checked={form.hoyrystinYhteinenPiireissa ?? true}
            onChange={(checked) => onChange({ hoyrystinYhteinenPiireissa: checked })}
          />
        </label>
      )}
      <NestepiiriFields data={data} onChange={patch} showPiiriTarkistukset />
    </HuoltoModuleSection>
  );
}
