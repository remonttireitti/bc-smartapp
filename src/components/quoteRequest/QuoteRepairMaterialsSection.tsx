import { createEmptyMaterial } from '../../lib/quoteRequest/defaults';
import { materialSellTotal } from '../../lib/quoteRequest/calculations';
import type { QuoteMaterial, QuoteRequestData, QuoteWorkItem } from '../../lib/quoteRequest/types';

type Props = {
  form: QuoteRequestData;
  canEdit: boolean;
  onChange: (patch: Partial<QuoteRequestData>) => void;
};

function formatEuro(value: number): string {
  return value.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' });
}

function patchWorkMaterials(
  workItems: QuoteWorkItem[],
  workId: string,
  materials: QuoteMaterial[],
): QuoteWorkItem[] {
  return workItems.map((row) => (row.id === workId ? { ...row, materials } : row));
}

function updateMaterial(
  workItems: QuoteWorkItem[],
  workId: string,
  materialId: string,
  patch: Partial<QuoteMaterial>,
): QuoteWorkItem[] {
  return workItems.map((row) =>
    row.id === workId
      ? {
          ...row,
          materials: row.materials.map((mat) => {
            if (mat.id !== materialId) return mat;
            const next = { ...mat, ...patch };
            if ('purchasePrice' in patch || 'marginPercent' in patch) {
              const purchase = Number(next.purchasePrice) || 0;
              const margin = Number(next.marginPercent) || 0;
              next.sellPrice = Math.round(purchase * (1 + margin / 100) * 100) / 100;
            }
            return next;
          }),
        }
      : row,
  );
}

export default function QuoteRepairMaterialsSection({ form, canEdit, onChange }: Props) {
  const workItems = form.workItems;

  function patchWorkItems(next: QuoteWorkItem[]) {
    onChange({ workItems: next });
  }

  const totalSell = workItems.reduce(
    (sum, item) => sum + materialSellTotal(item.materials ?? []),
    0,
  );
  const materialCount = workItems.reduce(
    (sum, item) => sum + (item.materials ?? []).filter((row) => row.name.trim()).length,
    0,
  );

  if (workItems.length === 0) {
    return <p className="muted">Lisää ensin työrivi Työt-ruudusta.</p>;
  }

  return (
    <div className="quote-repair-materials">
      <p className="muted">
        Tarvikkeet liitetään työhön. Asiakkaan tulosteessa kaikki tarvikkeet yhdistyvät yhdeksi riviksi{' '}
        <strong>Asennus tarvikkeet</strong>.
      </p>

      {workItems.map((item, workIndex) => {
        const workLabel = item.description.trim() || `Työ ${workIndex + 1}`;
        const materials = item.materials ?? [];
        const workSell = materialSellTotal(materials);

        return (
          <div key={item.id} className="quote-repair-materials-group panel-inset">
            <div className="quote-repair-materials-group-head">
              <strong>{workLabel}</strong>
              {canEdit ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    patchWorkItems(
                      patchWorkMaterials(workItems, item.id, [...materials, createEmptyMaterial()]),
                    )
                  }
                >
                  + Lisää rivi
                </button>
              ) : null}
            </div>

            {materials.length === 0 ? (
              <p className="muted">Ei tarvikkeita tälle työlle.</p>
            ) : (
              <div className="quote-materials-table-wrap">
                <table className="quote-materials-table">
                  <thead>
                    <tr>
                      <th>Tuote</th>
                      <th className="num">Määrä</th>
                      <th className="num">Hankinta</th>
                      <th className="num">Kate %</th>
                      <th className="num">Myynti / kpl</th>
                      <th className="num">Yhteensä</th>
                      {canEdit ? <th /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {materials.map((mat) => {
                      const qty = Number(mat.quantity) || 0;
                      const sell = qty * (Number(mat.sellPrice) || 0);
                      return (
                        <tr key={mat.id}>
                          <td>
                            <input
                              className="quote-materials-table-input"
                              value={mat.name}
                              onChange={(e) =>
                                patchWorkItems(
                                  updateMaterial(workItems, item.id, mat.id, { name: e.target.value }),
                                )
                              }
                              disabled={!canEdit}
                              placeholder="Tuotteen nimi"
                            />
                          </td>
                          <td className="num">
                            <input
                              className="quote-materials-table-input num"
                              type="number"
                              min="0"
                              step="0.001"
                              value={mat.quantity}
                              onChange={(e) =>
                                patchWorkItems(
                                  updateMaterial(workItems, item.id, mat.id, {
                                    quantity: Number(e.target.value),
                                  }),
                                )
                              }
                              disabled={!canEdit}
                            />
                          </td>
                          <td className="num">
                            <input
                              className="quote-materials-table-input num"
                              type="number"
                              min="0"
                              step="0.01"
                              value={mat.purchasePrice}
                              onChange={(e) =>
                                patchWorkItems(
                                  updateMaterial(workItems, item.id, mat.id, {
                                    purchasePrice: Number(e.target.value),
                                  }),
                                )
                              }
                              disabled={!canEdit}
                            />
                          </td>
                          <td className="num">
                            <input
                              className="quote-materials-table-input num"
                              type="number"
                              min="0"
                              step="0.1"
                              value={mat.marginPercent}
                              onChange={(e) =>
                                patchWorkItems(
                                  updateMaterial(workItems, item.id, mat.id, {
                                    marginPercent: Number(e.target.value),
                                  }),
                                )
                              }
                              disabled={!canEdit}
                            />
                          </td>
                          <td className="num">
                            <input
                              className="quote-materials-table-input num"
                              type="number"
                              min="0"
                              step="0.01"
                              value={mat.sellPrice}
                              onChange={(e) =>
                                patchWorkItems(
                                  updateMaterial(workItems, item.id, mat.id, {
                                    sellPrice: Number(e.target.value),
                                  }),
                                )
                              }
                              disabled={!canEdit}
                            />
                          </td>
                          <td className="num">{formatEuro(sell)}</td>
                          {canEdit ? (
                            <td className="quote-materials-table-actions">
                              <button
                                type="button"
                                className="link-btn"
                                onClick={() =>
                                  patchWorkItems(
                                    patchWorkMaterials(
                                      workItems,
                                      item.id,
                                      materials.filter((row) => row.id !== mat.id),
                                    ),
                                  )
                                }
                              >
                                Poista
                              </button>
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                  {materials.length > 0 ? (
                    <tfoot>
                      <tr>
                        <td colSpan={canEdit ? 5 : 5}>
                          <strong>Yhteensä ({workLabel})</strong>
                        </td>
                        <td className="num">
                          <strong>{formatEuro(workSell)}</strong>
                        </td>
                        {canEdit ? <td /> : null}
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>
            )}
          </div>
        );
      })}

      {materialCount > 0 ? (
        <div className="quote-summary-box">
          <strong>
            Kaikki tarvikkeet: {materialCount} riviä · {formatEuro(totalSell)}
          </strong>
        </div>
      ) : null}
    </div>
  );
}
