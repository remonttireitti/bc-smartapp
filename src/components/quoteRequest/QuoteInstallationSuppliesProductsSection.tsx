import { useEffect, useMemo } from 'react';
import { createEmptyMaterial } from '../../lib/quoteRequest/defaults';
import {
  installationSuppliesDevicePurchaseNet,
  installationSuppliesDeviceSellNet,
  installationSuppliesProductMarginNet,
  installationSuppliesPurchaseNet,
  installationSuppliesSellNet,
  installationSuppliesSupplyPurchaseNet,
  installationSuppliesSupplySellNet,
  hasOfferedDeviceRows,
  isOfferedDeviceRow,
  migrateLegacyMaterialsToInstallationSupplies,
  patchInstallationSupplies,
  resolveInstallationSupplyMarginPercent,
  syncInstallationSupplyRow,
} from '../../lib/quoteRequest/installationSupplies';
import type { QuoteMaterialRowKind } from '../../lib/quoteRequest/types';
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
  const legacyMaterialCount = useMemo(
    () =>
      form.workItems.flatMap((item) => item.materials ?? []).filter((row) => row.name.trim()).length
      + (form.materials ?? []).filter((row) => row.name.trim()).length,
    [form.workItems, form.materials],
  );
  const supplyCount = useMemo(
    () => items.filter((row) => row.name.trim()).length,
    [items],
  );

  useEffect(() => {
    if (supplyCount > 0 || legacyMaterialCount === 0) return;
    const migrated = migrateLegacyMaterialsToInstallationSupplies(form);
    onChange({
      installationSupplies: migrated.installationSupplies,
      workItems: migrated.workItems,
      materials: migrated.materials,
    });
  }, [form, legacyMaterialCount, supplyCount, onChange]);

  useEffect(() => {
    if (hasOfferedDeviceRows(items)) return;
    const devicePurchase = Number(form.devicePurchaseOverrideNet) || 0;
    if (!(devicePurchase > 0.005)) return;
    const named = items.filter((row) => row.name.trim());
    if (named.length !== 1) return;
    const row = named[0];
    const rowPurchase = (Number(row.quantity) || 0) * (Number(row.purchasePrice) || 0);
    if (Math.abs(rowPurchase - devicePurchase) > 0.05) return;
    onChange({
      installationSupplies: items.map((entry) =>
        entry.id === row.id ? { ...entry, rowKind: 'device' as const } : entry,
      ),
      devicePurchaseOverrideNet: null,
      deviceSaleOverrideNet: null,
    });
  }, [form.devicePurchaseOverrideNet, items, onChange]);

  const devicePurchase = installationSuppliesDevicePurchaseNet(items);
  const deviceSell = installationSuppliesDeviceSellNet(items);
  const supplyPurchase = installationSuppliesSupplyPurchaseNet(items);
  const supplySell = installationSuppliesSupplySellNet(items);
  const productPurchase = installationSuppliesPurchaseNet(items);
  const sellTotal = installationSuppliesSellNet(items);
  const productMargin = installationSuppliesProductMarginNet(form);
  const hasDeviceRows = devicePurchase > 0.005 || items.some((row) => isOfferedDeviceRow(row));

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
        Merkitse koneet ja laitteet rivityypillä <strong>Tarjottu laite</strong> — tavalliset tarvikkeet
        pysyvät <strong>Tarvike</strong>-tyyppinä. Asiakkaan tarjouksessa tarvikkeet yhdistyvät riviksi{' '}
        <strong>Asennus tarvikkeet</strong>; laitteet näkyvät erikseen. Kun myyntihinta on sovittu,
        hankinnan muutos päivittää kate-%:n.
      </p>
      {hasDeviceRows ? (
        <p className="muted">
          Laitteet on merkitty tarvikeriveille — erillistä &quot;Laite / urakka&quot; -kenttää ei tarvita.
        </p>
      ) : null}

      <div className="section-header-row">
        <h3>Tarvike- ja laiterivit</h3>
        {canEdit ? (
          <div className="form-actions" style={{ margin: 0 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => updateItems([...items, createEmptyMaterial({ quantity: 1, rowKind: 'supply' })])}
            >
              + Tarvike
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => updateItems([...items, createEmptyMaterial({ quantity: 1, rowKind: 'device' })])}
            >
              + Tarjottu laite
            </button>
          </div>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="muted">Ei rivejä vielä.</p>
      ) : (
        <div className="quote-material-rows">
          {items.map((item, index) => {
            const qty = Number(item.quantity) || 0;
            const sell = qty * (Number(item.sellPrice) || 0);
            const displayMarginPercent = resolveInstallationSupplyMarginPercent(item);
            const rowKind: QuoteMaterialRowKind = isOfferedDeviceRow(item) ? 'device' : 'supply';
            return (
              <div
                key={item.id}
                className={`quote-material-row panel-inset${rowKind === 'device' ? ' quote-material-row-device' : ''}`}
              >
                <div className="quote-line-head">
                  <strong>
                    Rivi {index + 1}
                    {rowKind === 'device' ? ' · Tarjottu laite' : ' · Tarvike'}
                  </strong>
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
                  <label>
                    Rivin tyyppi
                    <select
                      value={rowKind}
                      onChange={(e) =>
                        updateRow(item.id, {
                          rowKind: e.target.value === 'device' ? 'device' : 'supply',
                        })
                      }
                      disabled={!canEdit}
                    >
                      <option value="supply">Tarvike</option>
                      <option value="device">Tarjottu laite</option>
                    </select>
                  </label>
                  <label className="quote-material-row-span-all">
                    {rowKind === 'device' ? 'Laite / tuote' : 'Tuote'}
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
                      value={displayMarginPercent}
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
          {hasDeviceRows ? (
            <>
              <div>Tarjotut laitteet: hankinta {formatEuro(devicePurchase)} · myynti {formatEuro(deviceSell)}</div>
              <div>Tarvikkeet: hankinta {formatEuro(supplyPurchase)} · myynti {formatEuro(supplySell)}</div>
            </>
          ) : null}
          <div>Hankinta yhteensä: {formatEuro(productPurchase)}</div>
          <div>Myynti yhteensä: {formatEuro(sellTotal)}</div>
          <strong>Kate: {formatEuro(productMargin)}</strong>
        </div>
      ) : null}
    </div>
  );
}
