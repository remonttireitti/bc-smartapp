import { createEmptyLauhdutuspiiriData } from '../../lib/huoltoRaportti/defaults';
import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { useMaintenanceDocumentLayout } from '../../hooks/useMaintenanceDocumentLayout';
import { HuoltoModuleSection } from './HuoltoModuleSection';
import { lauhdutuspiiriSectionTitle } from '../../lib/huoltoRaportti/sectionTitles';
import { NestepiiriInspection } from './NestepiiriInspection';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
}

export function LauhdutuspiiriSection({ form, onChange }: Props) {
  const documentLayout = useMaintenanceDocumentLayout();
  const data = form.lauhdutuspiiriData ?? createEmptyLauhdutuspiiriData();
  const title = lauhdutuspiiriSectionTitle(form.laiteTyyppi);
  const patch = (next: Partial<typeof data>) =>
    onChange({ lauhdutuspiiriData: { ...data, ...next } });

  const content = (
    <>
      {!documentLayout ? (
        <p className="muted huolto-help">
          Yhteinen nestekierto koneen levy-/putkilämmönvaihtimen ja ulkoisen nestelauhduttimen välillä.
          Nestelauhdutin-moduulissa täytetään vain yksikön omat tiedot (kenno, puhaltimet).
        </p>
      ) : null}
      <NestepiiriInspection
        title={title}
        data={data}
        onChange={patch}
        showLauhdutinTarkistukset
        showPiiriTarkistukset
        documentModuleKey={documentLayout ? 'lauhdutuspiiri' : undefined}
      />
    </>
  );

  if (documentLayout) return content;

  return (
    <HuoltoModuleSection moduleKey="lauhdutin" title={title}>
      {content}
    </HuoltoModuleSection>
  );
}
