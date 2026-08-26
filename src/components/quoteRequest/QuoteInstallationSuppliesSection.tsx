import { createEmptyMaterial } from '../../lib/quoteRequest/defaults';
import {
  generateInstallationSuppliesPrintHtml,
  installationLaborPurchaseNet,
  installationSuppliesNetMarginNet,
  installationSuppliesProductMarginNet,
  installationSuppliesPurchaseNet,
  installationSuppliesSellNet,
  installationVehicleBlocks,
  installationVehiclePurchaseNet,
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

export default function QuoteInstallationSuppliesSection({
  form,
  canEdit,
  onChange,
  companyName,
}: Props) {
  const items = form.installationSupplies ?? [];
  const productPurchase = installationSuppliesPurchaseNet(items);
  const sellTotal = installationSuppliesSellNet(items);
  const productMargin = installationSuppliesProductMarginNet(form);
  const laborPurchase = installationLaborPurchaseNet(form);
  const vehicleBlocks = installationVehicleBlocks(
    form.installationLaborHours,
    form.installationVehicleHoursPerBlock,
  );
  const vehiclePurchase = installationVehiclePurchaseNet(form);
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
        Sisäinen laskuri asennustarvikkeille. Asiakkaan tarjouksessa rivit yhdistyvät yhdeksi riviksi{' '}
        <strong>Asennus tarvikkeet</strong>. Työn ja huoltoauton hankintakustannukset vähennetään
        kokonaiskatteesta.
      </p>

      <div className="quote-installation-labor panel-inset">
        <h3>Työ ja huoltoauto (hankinta)</h3>
        <div className="quote-installation-labor-grid">
          <label>
            Työtunnit
            <input
              type="number"
              min="0"
              step="0.5"
              value={form.installationLaborHours}
              onChange={(e) => onChange({ installationLaborHours: Number(e.target.value) })}
              disabled={!canEdit}
            />
          </label>
          <label>
            Työn hankintahinta (€/h, alv 0)
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.installationLaborPurchaseRate}
              onChange={(e) =>
                onChange({ installationLaborPurchaseRate: Number(e.target.value) || 0 })
              }
              disabled={!canEdit}
            />
          </label>
        </div>
        <div className="quote-installation-labor-grid">
          <label>
            Huoltoautokorvaus (€, alv 0)
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.installationVehicleAllowance}
              onChange={(e) => onChange({ installationVehicleAllowance: Number(e.target.value) })}
              disabled={!canEdit}
            />
          </label>
          <label>
            Tunnit per korvausjakso
            <input
              type="number"
              min="1"
              step="1"
              value={form.installationVehicleHoursPerBlock}
              onChange={(e) =>
                onChange({ installationVehicleHoursPerBlock: Number(e.target.value) || 8 })
              }
              disabled={!canEdit}
            />
          </label>
        </div>

        {(form.installationLaborHours > 0 || laborPurchase > 0 || vehiclePurchase > 0) && (
          <div className="quote-summary-box" style={{ marginTop: '0.5rem' }}>
            {laborPurchase > 0 ? (
              <div>
                Asentajan työ: {form.installationLaborHours} h ×{' '}
                {formatEuro(form.installationLaborPurchaseRate)} = {formatEuro(laborPurchase)}
              </div>
            ) : null}
            {vehiclePurchase > 0 ? (
              <div>
                Huoltoautokorvaus: {vehicleBlocks} × {formatEuro(form.installationVehicleAllowance)}{' '}
                ({form.installationVehicleHoursPerBlock} h / jakso) = {formatEuro(vehiclePurchase)}
              </div>
            ) : null}
          </div>
        )}
      </div>

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
        <div>Tuotteiden hankinta: {formatEuro(productPurchase)}</div>
        <div>Tuotteiden myynti: {formatEuro(sellTotal)}</div>
        <div>Tuotteiden kate: {formatEuro(productMargin)}</div>
        {laborPurchase > 0 ? <div>Työn hankinta: {formatEuro(laborPurchase)}</div> : null}
        {vehiclePurchase > 0 ? (
          <div>Huoltoautokorvaus: {formatEuro(vehiclePurchase)}</div>
        ) : null}
        <strong>Kokonaiskate: {formatEuro(netMargin)}</strong>
      </div>

      <div className="quote-installation-supplies-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={printBreakdown}>
          Tulosta erittely
        </button>
      </div>
    </div>
  );
}
