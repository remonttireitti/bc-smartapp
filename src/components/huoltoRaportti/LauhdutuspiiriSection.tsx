import { createEmptyLauhdutuspiiriData } from '../../lib/huoltoRaportti/defaults';
import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { HuoltoModuleSection } from './HuoltoModuleSection';
import { lauhdutuspiiriSectionTitle } from '../../lib/huoltoRaportti/sectionTitles';
import { NestepiiriFields } from './NestepiiriFields';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
}

export function LauhdutuspiiriSection({ form, onChange }: Props) {
  const data = form.lauhdutuspiiriData ?? createEmptyLauhdutuspiiriData();
  const patch = (next: Partial<typeof data>) =>
    onChange({ lauhdutuspiiriData: { ...data, ...next } });

  return (
    <HuoltoModuleSection moduleKey="lauhdutin" title={lauhdutuspiiriSectionTitle(form.laiteTyyppi)}>
      <p className="muted huolto-help">
        Yhteinen nestekierto koneen levy-/putkilämmönvaihtimen ja ulkoisen nestelauhduttimen välillä.
        Nestelauhdutin-moduulissa täytetään vain yksikön omat tiedot (kenno, puhaltimet).
      </p>
      <NestepiiriFields
        data={data}
        onChange={patch}
        showLauhdutinTarkistukset
        showPiiriTarkistukset
      />
    </HuoltoModuleSection>
  );
}
