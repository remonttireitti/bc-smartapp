import { createEmptyMaterial, createEmptyWorkItem } from '../../lib/quoteRequest/defaults';
import type { QuoteRequestData } from '../../lib/quoteRequest/types';

type Props = {
  form: QuoteRequestData;
  canEdit: boolean;
  onChange: (patch: Partial<QuoteRequestData>) => void;
  variant?: 'all' | 'work' | 'materials';
};

export default function QuoteWorkMaterialsSection({
  form,
  canEdit,
  onChange,
  variant = 'all',
}: Props) {
  const showWork = variant === 'all' || variant === 'work';
  const showMaterials = variant === 'all' || variant === 'materials';

  return (
    <>
      {showWork ? (
        <>
          <div className="section-header-row">
            <h3>Työrivit</h3>
            {canEdit && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onChange({ workItems: [...form.workItems, createEmptyWorkItem()] })}
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
                    onClick={() =>
                      onChange({ workItems: form.workItems.filter((row) => row.id !== item.id) })
                    }
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
                    onChange({
                      workItems: form.workItems.map((row) =>
                        row.id === item.id ? { ...row, description: e.target.value } : row,
                      ),
                    })
                  }
                  disabled={!canEdit}
                />
              </label>
              <div className="line-form-grid">
                <label>
                  Tunnit
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    value={item.hours}
                    onChange={(e) =>
                      onChange({
                        workItems: form.workItems.map((row) =>
                          row.id === item.id ? { ...row, hours: Number(e.target.value) } : row,
                        ),
                      })
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
                      onChange({
                        workItems: form.workItems.map((row) =>
                          row.id === item.id ? { ...row, pricePerHour: Number(e.target.value) } : row,
                        ),
                      })
                    }
                    disabled={!canEdit}
                  />
                </label>
              </div>
            </div>
          ))}
        </>
      ) : null}

      {showMaterials ? (
        <>
          <div className="section-header-row">
            <h3>Tarvikkeet</h3>
            {canEdit && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onChange({ materials: [...form.materials, createEmptyMaterial()] })}
              >
                + Lisää tarvike
              </button>
            )}
          </div>
          {form.materials.length === 0 ? (
            <p className="muted">Ei tarvikkeita vielä.</p>
          ) : (
            form.materials.map((item, index) => (
              <div key={item.id} className="quote-line-row panel-inset">
                <div className="quote-line-head">
                  <strong>Tarvike {index + 1}</strong>
                  {canEdit && (
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() =>
                        onChange({ materials: form.materials.filter((row) => row.id !== item.id) })
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
                      value={item.name}
                      onChange={(e) =>
                        onChange({
                          materials: form.materials.map((row) =>
                            row.id === item.id ? { ...row, name: e.target.value } : row,
                          ),
                        })
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
                      value={item.quantity}
                      onChange={(e) =>
                        onChange({
                          materials: form.materials.map((row) =>
                            row.id === item.id ? { ...row, quantity: Number(e.target.value) } : row,
                          ),
                        })
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
                      value={item.purchasePrice}
                      onChange={(e) => {
                        const purchasePrice = Number(e.target.value);
                        const sellPrice =
                          purchasePrice * (1 + (Number(item.marginPercent) || 0) / 100);
                        onChange({
                          materials: form.materials.map((row) =>
                            row.id === item.id ? { ...row, purchasePrice, sellPrice } : row,
                          ),
                        });
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
                      value={item.marginPercent}
                      onChange={(e) => {
                        const marginPercent = Number(e.target.value);
                        const sellPrice =
                          Number(item.purchasePrice) * (1 + marginPercent / 100);
                        onChange({
                          materials: form.materials.map((row) =>
                            row.id === item.id ? { ...row, marginPercent, sellPrice } : row,
                          ),
                        });
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
                      value={item.sellPrice}
                      onChange={(e) =>
                        onChange({
                          materials: form.materials.map((row) =>
                            row.id === item.id ? { ...row, sellPrice: Number(e.target.value) } : row,
                          ),
                        })
                      }
                      disabled={!canEdit}
                    />
                  </label>
                </div>
              </div>
            ))
          )}
        </>
      ) : null}
    </>
  );
}
