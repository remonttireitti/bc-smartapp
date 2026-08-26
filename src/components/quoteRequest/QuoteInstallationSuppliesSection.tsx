import { createEmptyMaterial } from '../../lib/quoteRequest/defaults';
import {
  generateInstallationSuppliesPrintHtml,
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

export default function QuoteInstallationSuppliesSection({
  form,
  canEdit,
  onChange,
  companyName,
}: Props) {
  const items = form.installationSupplies ?? [];
  const purchaseTotal = installationSuppliesPurchaseNet(items);
  const sellTotal = installationSuppliesSellNet(items);
  const marginTotal = sellTotal - purchaseTotal;

  function updateItems(nextItems: QuoteMaterial[]) {
    onChange(patchInstallationSupplies(nextItems));
  }

  function updateRow(rowId: string, patch: Partial<QuoteMaterial>) {
    updateItems(
      items.map((row) => (row.id === rowId ? syncInstallationSupplyRow(row, patch) : row)),
    );
  }

  function printBreakdown() {
    const html = generateInstallationSuppliesPrintHtml(items, { companyName });
    const popup = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700');
    if (!popup) return;
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
  }

  return (
    <div className="quote-installation-supplies">
      <p className="muted">
        Sisäinen laskuri asennustarvikkeille. Asiakkaan tarjouksessa rivit yhdistyvät yhdeksi riviksi{' '}
        <strong>Asennus tarvikkeet</strong>.
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
        items.map((item, index) => (
          <div key={item.id} className="quote-line-row panel-inset">
            <div className="quote-line-head">
              <strong>Rivi {index + 1}</strong>
              {canEdit ? (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => updateItems(items.filter((row) => row.id !== item.id))}
                >
                  Poista
                </button>
              ) : null}
            </div>
            <div className="line-form-grid">
              <label>
                Tuote
                <input
                  value={item.name}
                  onChange={(e) => updateRow(item.id, { name: e.target.value })}
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
                  onChange={(e) => updateRow(item.id, { quantity: Number(e.target.value) })}
                  disabled={!canEdit}
                />
              </label>
              <label>
                Hankintahinta (€, alv 0)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.purchasePrice}
                  onChange={(e) => updateRow(item.id, { purchasePrice: Number(e.target.value) })}
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
                  onChange={(e) => updateRow(item.id, { marginPercent: Number(e.target.value) })}
                  disabled={!canEdit}
                />
              </label>
              <label>
                Myyntihinta (€, alv 0 / kpl)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.sellPrice}
                  onChange={(e) => updateRow(item.id, { sellPrice: Number(e.target.value) })}
                  disabled={!canEdit}
                />
              </label>
            </div>
          </div>
        ))
      )}

      <div className="quote-summary-box">
        <div>
          Hankinta yhteensä:{' '}
          {purchaseTotal.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })}
        </div>
        <div>
          Myynti yhteensä: {sellTotal.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })}
        </div>
        <strong>
          Kate: {marginTotal.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })}
        </strong>
      </div>

      <div className="quote-installation-supplies-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={printBreakdown}>
          Tulosta erittely
        </button>
      </div>
    </div>
  );
}
