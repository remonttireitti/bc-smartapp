import { createEmptyMaterial } from '../../lib/quoteRequest/defaults';
import {
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
};

function formatEuro(value: number): string {
  return value.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' });
}

export default function QuoteInstallationSuppliesProductsSection({
  form,
  canEdit,
  onChange,
}: Props) {
  const items = form.installationSupplies ?? [];
  const productPurchase = installationSuppliesPurchaseNet(items);
  const sellTotal = installationSuppliesSellNet(items);
  const productMargin = installationSuppliesProductMarginNet(form);

  function updateItems(nextItems: QuoteMaterial[]) {
    onChange(patchInstallationSupplies(nextItems));
  }

  function updateRow(rowId: string, patch: Partial<QuoteMaterial>) {
    updateItems(
      items.map((row) => (row.id === rowId ? syncInstallationSupplyRow(row, patch) : row)),
    );
  }

  return (
    <div className="quote-installation-supplies">
      <p className="muted">
        Sisäisessä tulosteessa jokainen tarvike omalla rivillään. Asiakkaan tarjouksessa kaikki
        yhdistyvät riviksi <strong>Asennus tarvikkeet</strong>.
      </p>

      <div className="section-header-row">
        <h3>Tarvikerivit</h3>
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
        <div className="quote-material-rows">
          {items.map((item, index) => {
            const qty = Number(item.quantity) || 0;
            const sell = qty * (Number(item.sellPrice) || 0);
            return (
              <div key={item.id} className="quote-material-row panel-inset">
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
                <div className="quote-material-row-grid">
                  <label className="quote-material-row-span-all">
                    Tuote
                    <input
                      value={item.name}
                      onChange={(e) => updateRow(item.id, { name: e.target.value })}
                      disabled={!canEdit}
                      placeholder="Tuotteen nimi"
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
                    Hankinta (€)
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
                    Myynti / kpl (€)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.sellPrice}
                      onChange={(e) => updateRow(item.id, { sellPrice: Number(e.target.value) })}
                      disabled={!canEdit}
                    />
                  </label>
                  <div className="quote-material-row-total">
                    Yhteensä: <strong>{formatEuro(sell)}</strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {items.length > 0 ? (
        <div className="quote-summary-box">
          <div>Hankinta yhteensä: {formatEuro(productPurchase)}</div>
          <div>Myynti yhteensä: {formatEuro(sellTotal)}</div>
          <strong>Kate: {formatEuro(productMargin)}</strong>
        </div>
      ) : null}
    </div>
  );
}
