import { createEmptyWorkItem } from '../../lib/quoteRequest/defaults';
import type { QuoteRequestData, QuoteWorkItem } from '../../lib/quoteRequest/types';
import QuoteWorkLaborFields, { syncInstallationLaborHours } from './QuoteWorkLaborFields';

type Props = {
  form: QuoteRequestData;
  canEdit: boolean;
  onChange: (patch: Partial<QuoteRequestData>) => void;
  variant?: 'all' | 'work' | 'materials';
};

function updateWorkItem(
  workItems: QuoteWorkItem[],
  workId: string,
  patch: Partial<QuoteWorkItem>,
): QuoteWorkItem[] {
  return workItems.map((row) => (row.id === workId ? { ...row, ...patch } : row));
}

export default function QuoteWorkMaterialsSection({
  form,
  canEdit,
  onChange,
  variant = 'all',
}: Props) {
  const showWork = variant === 'all' || variant === 'work';

  if (!showWork) return null;

  function patchWorkItems(workItems: QuoteWorkItem[]) {
    onChange({
      workItems,
      installationLaborHours: syncInstallationLaborHours(workItems),
    });
  }

  function patchWorkItem(workId: string, patch: Partial<QuoteWorkItem>) {
    patchWorkItems(updateWorkItem(form.workItems, workId, patch));
  }

  return (
    <>
      <div className="section-header-row">
        <h3>Työrivit</h3>
        {canEdit && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => patchWorkItems([...form.workItems, createEmptyWorkItem()])}
          >
            + Lisää työ
          </button>
        )}
      </div>
      {form.workItems.map((item, index) => (
        <div key={item.id} className="quote-line-row panel-inset">
          <div className="quote-line-head">
            <strong>{item.description.trim() || `Työ ${index + 1}`}</strong>
            {canEdit && form.workItems.length > 1 && (
              <button
                type="button"
                className="link-btn"
                onClick={() => patchWorkItems(form.workItems.filter((row) => row.id !== item.id))}
              >
                Poista
              </button>
            )}
          </div>
          <label>
            Otsikko
            <input
              value={item.description}
              onChange={(e) => patchWorkItem(item.id, { description: e.target.value })}
              disabled={!canEdit}
              placeholder="Esim. asennustyö"
            />
          </label>
          <QuoteWorkLaborFields
            form={form}
            workItem={item}
            canEdit={canEdit}
            showVehicleFields={index === form.workItems.length - 1}
            onChange={onChange}
            onWorkChange={(patch) => patchWorkItem(item.id, patch)}
          />
        </div>
      ))}
    </>
  );
}
