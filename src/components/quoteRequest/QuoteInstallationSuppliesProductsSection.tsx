import { createEmptyMaterial } from '../../lib/quoteRequest/defaults';
import {
  generateInstallationSuppliesPrintHtml,
  installationSuppliesNetMarginNet,
  installationSuppliesProductMarginNet,
  installationSuppliesPurchaseNet,
  installationSuppliesSellNet,
  patchInstallationSupplies,
  syncInstallationSupplyRow,
} from '../../lib/quoteRequest/installationSupplies';
import type { QuoteMaterial, QuoteRequestData } from '../../lib/quoteRequest/types';

type Props = {
  form: QuoteRequestData;
  canEdit: boolean;
  onChange: (patch: Partial<QuoteRequestData>) => void;
  companyName?: string;
};

function formatEuro(value: number): string {
  return value.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' });
}

export default function QuoteInstallationSuppliesProductsSection({
  form,
  canEdit,
  onChange,
  companyName,
}: Props) {
  const items = form.installationSupplies ?? [];
  const productPurchase = installationSuppliesPurchaseNet(items);
  const sellTotal = installationSuppliesSellNet(items);
  const productMargin = installationSuppliesProductMarginNet(form);
  const netMargin = installationSuppliesNetMarginNet(form);

  function updateItems(nextItems: QuoteMaterial[]) {
    onChange(patchInstallationSupplies(nextItems));
  }

  function updateRow(rowId: string, patch: Partial<QuoteMaterial>) {
    updateItems(
      items.map((row) => (row.id === rowId ? syncInstallationSupplyRow(row, patch) : row)),
    );
  }

  function printBreakdown() {
    const html = generateInstallationSuppliesPrintHtml(form, { companyName });
    const popup = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700');
    if (!popup) return;
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
  }

  return (
    <div className="quote-installation-supplies">
      <p className="muted">
        Asiakkaan tarjouksessa tarvikkeet yhdistyvät yhdeksi riviksi <strong>Asennus tarvikkeet</strong>.
      </p>

      <div className="section-header-row">
        <h3>Tuoterivit</h3>
        {canEdit ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => updateItems([...items, createEmptyMaterial({ quantity: 1 })])}
          >
            + Lisää rivi
          </button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="muted">Ei rivejä vielä.</p>
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
              {items.map((item) => {
                const qty = Number(item.quantity) || 0;
                const sell = qty * (Number(item.sellPrice) || 0);
                return (
                  <tr key={item.id}>
                    <td>
                      <input
                        className="quote-materials-table-input"
                        value={item.name}
                        onChange={(e) => updateRow(item.id, { name: e.target.value })}
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
                        value={item.quantity}
                        onChange={(e) => updateRow(item.id, { quantity: Number(e.target.value) })}
                        disabled={!canEdit}
                      />
                    </td>
                    <td className="num">
                      <input
                        className="quote-materials-table-input num"
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.purchasePrice}
                        onChange={(e) => updateRow(item.id, { purchasePrice: Number(e.target.value) })}
                        disabled={!canEdit}
                      />
                    </td>
                    <td className="num">
                      <input
                        className="quote-materials-table-input num"
                        type="number"
                        min="0"
                        step="0.1"
                        value={item.marginPercent}
                        onChange={(e) => updateRow(item.id, { marginPercent: Number(e.target.value) })}
                        disabled={!canEdit}
                      />
                    </td>
                    <td className="num">
                      <input
                        className="quote-materials-table-input num"
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.sellPrice}
                        onChange={(e) => updateRow(item.id, { sellPrice: Number(e.target.value) })}
                        disabled={!canEdit}
                      />
                    </td>
                    <td className="num">{formatEuro(sell)}</td>
                    {canEdit ? (
                      <td className="quote-materials-table-actions">
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => updateItems(items.filter((row) => row.id !== item.id))}
                        >
                          Poista
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="quote-summary-box">
        <div>Tuotteiden hankinta: {formatEuro(productPurchase)}</div>
        <div>Tuotteiden myynti: {formatEuro(sellTotal)}</div>
        <div>Tuotteiden kate: {formatEuro(productMargin)}</div>
        <strong>Kokonaiskate (sis. työn hankinta): {formatEuro(netMargin)}</strong>
      </div>

      <div className="quote-installation-supplies-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={printBreakdown}>
          Tulosta erittely
        </button>
      </div>
    </div>
  );
}
