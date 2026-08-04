import { createEmptyLauhdutuspiiriData } from '../../lib/huoltoRaportti/defaults';
import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { HuoltoModuleSection } from './HuoltoModuleSection';
import { lauhdutuspiiriSectionTitle } from '../../lib/huoltoRaportti/sectionTitles';
import { NestepiiriInspection } from './NestepiiriInspection';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
}

export function LauhdutuspiiriSection({ form, onChange }: Props) {
  const data = form.lauhdutuspiiriData ?? createEmptyLauhdutuspiiriData();
  const title = lauhdutuspiiriSectionTitle(form.laiteTyyppi);
  const patch = (next: Partial<typeof data>) =>
    onChange({ lauhdutuspiiriData: { ...data, ...next } });

  return (
    <HuoltoModuleSection moduleKey="lauhdutin" title={title}>
      <p className="muted huolto-help">
        Yhteinen nestekierto koneen levy-/putkilämmönvaihtimen ja ulkoisen nestelauhduttimen välillä.
        Nestelauhdutin-moduulissa täytetään vain yksikön omat tiedot (kenno, puhaltimet).
      </p>
      <div className="huolto-part-inspection-list">
        <NestepiiriInspection title={title} data={data} onChange={patch} showLauhdutinTarkistukset showPiiriTarkistukset />
      </div>
    </HuoltoModuleSection>
  );
}
