import type { Equipment } from '../../types';
import { createServiceWorkItem } from '../../lib/quoteRequest/defaults';
import type { QuoteRequestData, QuoteWorkItem } from '../../lib/quoteRequest/types';
import { equipmentToOption } from '../../lib/registrySearch';
import QuoteWorkLaborFields, { syncInstallationLaborHours } from './QuoteWorkLaborFields';

type Props = {
  form: QuoteRequestData;
  canEdit: boolean;
  equipment: Equipment[];
  customerSelected: boolean;
  onChange: (patch: Partial<QuoteRequestData>) => void;
  hideHeader?: boolean;
};

function updateWorkItem(
  workItems: QuoteWorkItem[],
  workId: string,
  patch: Partial<QuoteWorkItem>,
): QuoteWorkItem[] {
  return workItems.map((row) => (row.id === workId ? { ...row, ...patch } : row));
}

export default function QuoteRepairWorkItemsSection({
  form,
  canEdit,
  equipment,
  customerSelected,
  onChange,
  hideHeader = false,
}: Props) {
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
    <section className={hideHeader ? 'quote-repair-work-items' : 'form-section'}>
      <div className="section-header-row">
        {!hideHeader ? <h2>Työt</h2> : <span aria-hidden="true" />}
        {canEdit && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              patchWorkItems([
                ...form.workItems,
                createServiceWorkItem({ pricePerHour: form.laborRate || 65 }),
              ])
            }
          >
            + Lisää työ
          </button>
        )}
      </div>

      <p className="muted">Tarvikkeet lisätään Tarvikkeet-ruudusta.</p>

      {form.workItems.map((item, index) => (
        <div key={item.id} className="quote-line-row panel-inset">
          <div className="quote-line-head">
            <strong>{item.description.trim() || `Asennustyö ${index + 1}`}</strong>
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

          <label>
            Kohdistettu laite (valinnainen)
            <select
              value={item.equipmentId ?? ''}
              onChange={(e) => {
                const nextId = e.target.value || undefined;
                const selected = equipment.find((row) => row.id === nextId);
                patchWorkItem(item.id, {
                  equipmentId: nextId,
                  equipmentName: selected ? equipmentToOption(selected).label : undefined,
                });
              }}
              disabled={!canEdit || !customerSelected}
            >
              <option value="">— Ei kohdistusta —</option>
              {equipment.map((row) => (
                <option key={row.id} value={row.id}>
                  {equipmentToOption(row).label}
                </option>
              ))}
            </select>
          </label>
          {!customerSelected ? (
            <p className="muted quote-work-equipment-hint">Valitse ensin asiakas laitteen kohdistusta varten.</p>
          ) : null}

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
    </section>
  );
}
