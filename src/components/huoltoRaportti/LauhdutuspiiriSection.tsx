import { createEmptyNestepiiriData } from '../../lib/huoltoRaportti/defaults';
import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { HuoltoModuleSection } from './HuoltoModuleSection';
import { NestepiiriFields } from './NestepiiriFields';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
}

export function LauhdutuspiiriSection({ form, onChange }: Props) {
  const data = form.lauhdutuspiiriData ?? createEmptyNestepiiriData();
  const patch = (next: Partial<typeof data>) =>
    onChange({ lauhdutuspiiriData: { ...data, ...next } });

  return (
    <HuoltoModuleSection moduleKey="lauhdutin" title="Lauhdutuspiiri">
      <p className="muted huolto-help">
        Koneen levy- tai putkilämmönvaihtimen nestekierto. Ulkoisen nestelauhduttimen piiri täytetään
        nestelauhdutin-moduulissa.
      </p>
      <NestepiiriFields data={data} onChange={patch} showPiiriTarkistukset />
    </HuoltoModuleSection>
  );
}
