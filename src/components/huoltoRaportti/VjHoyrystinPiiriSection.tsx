import { createEmptyNestepiiriData } from '../../lib/huoltoRaportti/defaults';
import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import ToggleSwitch from '../ToggleSwitch';
import { HuoltoModuleSection } from './HuoltoModuleSection';
import { NestepiiriFields } from './NestepiiriFields';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
}

export function VjHoyrystinPiiriSection({ form, onChange }: Props) {
  const data = form.hoyrystinPiiriData ?? createEmptyNestepiiriData();
  const patch = (next: Partial<typeof data>) =>
    onChange({ hoyrystinPiiriData: { ...data, ...next } });

  return (
    <HuoltoModuleSection moduleKey="hoyrystin" title="Höyrystin — jäähdytyspiir">
      <p className="muted huolto-help">
        Höyrystin on aina levy- tai putkilämmönvaihdin. Jäähdytyspiirin neste, pumput ja paisunta-astia.
        Höyrystimen tekniset tiedot täytetään kylmäainepiirin kohdalla.
      </p>
      <label className="checkbox-inline huolto-span-all">
        <ToggleSwitch
          label="Yhteinen höyrystin kaikille kylmäainepiireille"
          checked={form.hoyrystinYhteinenPiireissa ?? true}
          onChange={(checked) => onChange({ hoyrystinYhteinenPiireissa: checked })}
        />
      </label>
      <NestepiiriFields data={data} onChange={patch} showPiiriTarkistukset />
    </HuoltoModuleSection>
  );
}
