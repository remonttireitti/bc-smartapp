import { useEffect } from 'react';
import type { CondenserData, HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { createEmptyCondenserData } from '../../lib/huoltoRaportti/defaults';
import { condensersSummaryRows } from '../../lib/huoltoRaportti/moduleSummaryRows';
import { CondenserModule } from './CondenserModule';
import { DocumentModuleInspection } from './DocumentModuleInspection';
import { HuoltoModuleSection } from './HuoltoModuleSection';
import { lauhdutinSectionTitle, lauhdutinUnitTitle } from '../../lib/huoltoRaportti/sectionTitles';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
  documentModuleKey?: string;
  embedded?: boolean;
}

function CondensersEditor({
  form,
  onChange,
  embedded = false,
}: {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
  embedded?: boolean;
}) {
  const circuitCount = Math.min(3, Math.max(1, parseInt(form.kylmaainePiireja, 10) || 1));

  useEffect(() => {
    if (form.condenserData.length === circuitCount) return;
    if (form.condenserData.length < circuitCount) {
      onChange({
        condenserData: [
          ...form.condenserData,
          ...Array.from({ length: circuitCount - form.condenserData.length }, () =>
            createEmptyCondenserData(),
          ),
        ],
      });
    } else {
      onChange({ condenserData: form.condenserData.slice(0, circuitCount) });
    }
  }, [circuitCount, form.condenserData, onChange]);

  function updateCondenser(index: number, data: CondenserData) {
    const next = [...form.condenserData];
    next[index] = data;
    onChange({ condenserData: next });
  }

  const content = (
    <div className="huolto-part-inspection-list">
      {form.condenserData.slice(0, circuitCount).map((condenser, index) => (
        <CondenserModule
          key={index}
          index={index}
          titleLabel={lauhdutinUnitTitle(form.laiteTyyppi, index)}
          data={condenser}
          onChange={(data) => updateCondenser(index, data)}
        />
      ))}
    </div>
  );

  if (embedded) return content;

  return (
    <HuoltoModuleSection moduleKey="lauhdutin" title={lauhdutinSectionTitle(form.laiteTyyppi)}>
      {content}
    </HuoltoModuleSection>
  );
}

export function CondensersSection({ form, onChange, documentModuleKey, embedded }: Props) {
  const title = lauhdutinSectionTitle(form.laiteTyyppi);

  return (
    <DocumentModuleInspection
      data={form}
      onChange={(next) => onChange(next)}
      documentModuleKey={documentModuleKey}
      title={title}
      titleId="lauhdutin-dialog-title"
      summaryRows={condensersSummaryRows(form)}
      editLabel="Muokkaa lauhduttimia"
      emptyHint="Täytä lauhduttimien tiedot painamalla Muokkaa."
    >
      {(draft, patchDraft) => (
        <CondensersEditor form={draft} onChange={patchDraft} embedded={embedded ?? true} />
      )}
    </DocumentModuleInspection>
  );
}
