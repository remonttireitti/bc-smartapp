import type { Equipment } from '../../types';
import { createServiceWorkItem } from '../../lib/quoteRequest/defaults';
import type { QuoteRequestData, QuoteWorkItem } from '../../lib/quoteRequest/types';
import { equipmentToOption } from '../../lib/registrySearch';

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
    onChange({ workItems });
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

      <p className="muted">Tarvikkeet lisätään erillisestä Tarvikkeet-ruudusta.</p>

      {form.workItems.map((item, index) => (
        <div key={item.id} className="quote-line-row panel-inset">
          <div className="quote-line-head">
            <strong>Työ {index + 1}</strong>
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
            Kuvaus
            <input
              value={item.description}
              onChange={(e) =>
                patchWorkItems(updateWorkItem(form.workItems, item.id, { description: e.target.value }))
              }
              disabled={!canEdit}
              placeholder="Esim. asennus, kytkentä ja käyttöönotto"
            />
          </label>

          <label>
            Kohdistettu laite (valinnainen)
            <select
              value={item.equipmentId ?? ''}
              onChange={(e) => {
                const nextId = e.target.value || undefined;
                const selected = equipment.find((row) => row.id === nextId);
                patchWorkItems(
                  updateWorkItem(form.workItems, item.id, {
                    equipmentId: nextId,
                    equipmentName: selected ? equipmentToOption(selected).label : undefined,
                  }),
                );
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

          <div className="line-form-grid">
            <label>
              Tunnit
              <input
                type="number"
                step="0.25"
                min="0"
                value={item.hours}
                onChange={(e) =>
                  patchWorkItems(
                    updateWorkItem(form.workItems, item.id, { hours: Number(e.target.value) }),
                  )
                }
                disabled={!canEdit}
              />
            </label>
            <label>
              Tuntihinta (€)
              <input
                type="number"
                step="0.01"
                min="0"
                value={item.pricePerHour}
                onChange={(e) =>
                  patchWorkItems(
                    updateWorkItem(form.workItems, item.id, { pricePerHour: Number(e.target.value) }),
                  )
                }
                disabled={!canEdit}
              />
            </label>
          </div>
        </div>
      ))}
    </section>
  );
}
