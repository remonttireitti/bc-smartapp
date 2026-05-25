import type { Equipment } from '../../types';
import { createEmptyMaterial, createServiceWorkItem } from '../../lib/quoteRequest/defaults';
import type { QuoteMaterial, QuoteRequestData, QuoteWorkItem } from '../../lib/quoteRequest/types';
import { equipmentToOption } from '../../lib/registrySearch';

type Props = {
  form: QuoteRequestData;
  canEdit: boolean;
  equipment: Equipment[];
  customerSelected: boolean;
  onChange: (patch: Partial<QuoteRequestData>) => void;
};

function updateWorkItem(
  workItems: QuoteWorkItem[],
  workId: string,
  patch: Partial<QuoteWorkItem>,
): QuoteWorkItem[] {
  return workItems.map((row) => (row.id === workId ? { ...row, ...patch } : row));
}

function updateWorkMaterial(
  workItems: QuoteWorkItem[],
  workId: string,
  materialId: string,
  patch: Partial<QuoteMaterial>,
): QuoteWorkItem[] {
  return workItems.map((row) =>
    row.id === workId
      ? {
          ...row,
          materials: row.materials.map((mat) => (mat.id === materialId ? { ...mat, ...patch } : mat)),
        }
      : row,
  );
}

export default function QuoteRepairWorkItemsSection({
  form,
  canEdit,
  equipment,
  customerSelected,
  onChange,
}: Props) {
  function patchWorkItems(workItems: QuoteWorkItem[]) {
    onChange({ workItems });
  }

  return (
    <section className="form-section">
      <div className="section-header-row">
        <h2>Työt ja tarvikkeet</h2>
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
              placeholder="Esim. öljyn vaihto, kenno pesu"
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

          <div className="quote-work-materials">
            <div className="quote-work-materials-head">
              <h4>Tarvikkeet tälle työlle</h4>
              {canEdit && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    patchWorkItems(
                      updateWorkItem(form.workItems, item.id, {
                        materials: [...item.materials, createEmptyMaterial()],
                      }),
                    )
                  }
                >
                  + Lisää tarvike
                </button>
              )}
            </div>

            {item.materials.length === 0 ? (
              <p className="muted">Ei tarvikkeita tälle työlle.</p>
            ) : (
              item.materials.map((mat, matIndex) => (
                <div key={mat.id} className="quote-work-material-row">
                  <div className="quote-line-head">
                    <strong>Tarvike {matIndex + 1}</strong>
                    {canEdit && (
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() =>
                          patchWorkItems(
                            updateWorkItem(form.workItems, item.id, {
                              materials: item.materials.filter((row) => row.id !== mat.id),
                            }),
                          )
                        }
                      >
                        Poista
                      </button>
                    )}
                  </div>
                  <div className="line-form-grid">
                    <label>
                      Nimi
                      <input
                        value={mat.name}
                        onChange={(e) =>
                          patchWorkItems(
                            updateWorkMaterial(form.workItems, item.id, mat.id, { name: e.target.value }),
                          )
                        }
                        disabled={!canEdit}
                      />
                    </label>
                    <label>
                      Määrä
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={mat.quantity}
                        onChange={(e) =>
                          patchWorkItems(
                            updateWorkMaterial(form.workItems, item.id, mat.id, {
                              quantity: Number(e.target.value),
                            }),
                          )
                        }
                        disabled={!canEdit}
                      />
                    </label>
                    <label>
                      Hankintahinta (€)
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={mat.purchasePrice}
                        onChange={(e) => {
                          const purchasePrice = Number(e.target.value);
                          const sellPrice =
                            purchasePrice * (1 + (Number(mat.marginPercent) || 0) / 100);
                          patchWorkItems(
                            updateWorkMaterial(form.workItems, item.id, mat.id, {
                              purchasePrice,
                              sellPrice,
                            }),
                          );
                        }}
                        disabled={!canEdit}
                      />
                    </label>
                    <label>
                      Kate (%)
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={mat.marginPercent}
                        onChange={(e) => {
                          const marginPercent = Number(e.target.value);
                          const sellPrice = Number(mat.purchasePrice) * (1 + marginPercent / 100);
                          patchWorkItems(
                            updateWorkMaterial(form.workItems, item.id, mat.id, {
                              marginPercent,
                              sellPrice,
                            }),
                          );
                        }}
                        disabled={!canEdit}
                      />
                    </label>
                    <label>
                      Myyntihinta (€)
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={mat.sellPrice}
                        onChange={(e) =>
                          patchWorkItems(
                            updateWorkMaterial(form.workItems, item.id, mat.id, {
                              sellPrice: Number(e.target.value),
                            }),
                          )
                        }
                        disabled={!canEdit}
                      />
                    </label>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
