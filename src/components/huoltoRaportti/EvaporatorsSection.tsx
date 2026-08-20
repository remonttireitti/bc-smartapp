import type { HuoltoReportData } from '../../lib/huoltoRaportti/types';
import { EvaporatorModule } from './EvaporatorModule';
import { hoyrystinSectionTitle } from '../../lib/huoltoRaportti/sectionTitles';
import { evaporatorsSummaryRows } from '../../lib/huoltoRaportti/moduleSummaryRows';
import { HuoltoModuleSection } from './HuoltoModuleSection';
import { DocumentModuleInspection } from './DocumentModuleInspection';
import {
  createEvaporatorActions,
  evaporatorTitleForIndex,
  getEvaporatorCircuitCount,
} from './useEvaporatorCircuits';

interface Props {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
  documentModuleKey?: string;
  embedded?: boolean;
}

function EvaporatorsEditor({
  form,
  onChange,
  embedded = false,
}: {
  form: HuoltoReportData;
  onChange: (patch: Partial<HuoltoReportData>) => void;
  embedded?: boolean;
}) {
  const isKylmakoneikko = form.laiteTyyppi === 'kylmäkoneikko';
  const circuitCount = getEvaporatorCircuitCount(form);
  const { updateEvaporator, setCount, setSameAsFirst } = createEvaporatorActions(form, onChange);

  const content = (
    <>
      {isKylmakoneikko && (
        <label>
          Höyrystimien määrä (1–10)
          <select
            value={form.evaporatorData.length}
            onChange={(e) => setCount(parseInt(e.target.value, 10))}
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="huolto-part-inspection-list">
        {form.evaporatorData.slice(0, circuitCount).map((evaporator, index) => (
          <EvaporatorModule
            key={index}
            index={index}
            laiteTyyppi={form.laiteTyyppi}
            titleLabel={evaporatorTitleForIndex(form, index)}
            data={evaporator}
            locked={false}
            showSameAsFirst={index > 0}
            sameAsFirst={form.evaporatorSamaKuinEnsimmainen[index]}
            onSameAsFirstChange={(v) => setSameAsFirst(index, v)}
            onChange={(data) => updateEvaporator(index, data)}
          />
        ))}
      </div>
    </>
  );

  if (embedded) return content;

  return (
    <HuoltoModuleSection moduleKey="hoyrystin" title={hoyrystinSectionTitle(form.laiteTyyppi)}>
      {content}
    </HuoltoModuleSection>
  );
}

export function EvaporatorsSection({ form, onChange, documentModuleKey, embedded }: Props) {
  const title = hoyrystinSectionTitle(form.laiteTyyppi);

  return (
    <DocumentModuleInspection
      data={form}
      onChange={(next) => onChange(next)}
      documentModuleKey={documentModuleKey}
      title={title}
      titleId="hoyrystin-dialog-title"
      summaryRows={evaporatorsSummaryRows(form)}
      editLabel="Muokkaa höyrystimiä"
      emptyHint="Täytä höyrystinten tiedot painamalla Muokkaa."
    >
      {(draft, patchDraft) => (
        <EvaporatorsEditor form={draft} onChange={patchDraft} embedded={embedded ?? true} />
      )}
    </DocumentModuleInspection>
  );
}
