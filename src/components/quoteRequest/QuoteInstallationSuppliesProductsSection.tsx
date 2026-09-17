import { useEffect, useMemo } from 'react';
import { createEmptyMaterial } from '../../lib/quoteRequest/defaults';
import {
  installationSuppliesDevicePurchaseNet,
  installationSuppliesDeviceSellNet,
  installationSuppliesExpensePurchaseNet,
  installationSuppliesExpenseSellNet,
  installationSuppliesLaborPurchaseNet,
  installationSuppliesLaborSellNet,
  installationSuppliesProductMarginNet,
  installationSuppliesPurchaseNet,
  installationSuppliesSellNet,
  installationSuppliesSupplyPurchaseNet,
  installationSuppliesSupplySellNet,
  hasOfferedDeviceRows,
  migrateLegacyMaterialsToInstallationSupplies,
  patchInstallationSupplies,
  QUOTE_MATERIAL_ROW_KINDS,
  quoteMaterialRowKindLabel,
  resolveInstallationSupplyMarginPercent,
  resolveQuoteMaterialRowKind,
  syncInstallationSupplyRow,
} from '../../lib/quoteRequest/installationSupplies';
import { computeManualDeviceSellNet } from '../../lib/quoteRequest/manualDevicePricing';
import { CUSTOMER_PRINT_QUANTITY_UNIT_OPTIONS } from '../../lib/workReportCustomerPrintSettings';
import type { QuoteMaterial, QuoteMaterialRowKind, QuoteRequestData } from '../../lib/quoteRequest/types';

type Props = {
  form: QuoteRequestData;
  canEdit: boolean;
  onChange: (patch: Partial<QuoteRequestData>) => void;
  rowKindFilter?: QuoteMaterialRowKind;
};

function formatEuro(value: number): string {
  return value.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' });
}

function quantityLabel(kind: QuoteMaterialRowKind): string {
  return kind === 'labor' ? 'Tunnit' : 'Määrä';
}

function defaultUnitForKind(kind: QuoteMaterialRowKind): string {
  return kind === 'labor' ? 'h' : 'kpl';
}

function unitPriceLabel(kind: QuoteMaterialRowKind, side: 'purchase' | 'sell'): string {
  if (kind === 'labor') {
    return side === 'purchase' ? 'Hankinta €/h' : 'Myynti €/h';
  }
  return side === 'purchase' ? 'Hankinta (€)' : 'Myynti / kpl (€)';
}

function productLabel(kind: QuoteMaterialRowKind): string {
  if (kind === 'labor') return 'Työn kuvaus';
  if (kind === 'expense') return 'Kulu';
  if (kind === 'device') return 'Laite / tuote';
  return 'Tuote';
}

const KIND_SECTION_INTRO: Record<QuoteMaterialRowKind, string> = {
  labor: 'Lisää työrivejä tunteineen ja hinnoineen.',
  supply: 'Lisää tarvikkeet ja materiaalit.',
  expense: 'Lisää kulut, kuten matkakulut tai alihankinta.',
  device: 'Lisää myytävät laitteet ja tuotteet.',
};

const KIND_SECTION_TITLE: Record<QuoteMaterialRowKind, string> = {
  labor: 'Työrivit',
  supply: 'Tarvikkeet',
  expense: 'Kulut',
  device: 'Laitteet',
};

const KIND_ADD_LABEL: Record<QuoteMaterialRowKind, string> = {
  labor: '+ Lisää työ',
  supply: '+ Lisää tarvike',
  expense: '+ Lisää kulu',
  device: '+ Lisää laite',
};

export default function QuoteInstallationSuppliesProductsSection({
  form,
  canEdit,
  onChange,
  rowKindFilter,
}: Props) {
  const items = form.installationSupplies ?? [];
  const visibleItems = rowKindFilter
    ? items.filter((row) => resolveQuoteMaterialRowKind(row) === rowKindFilter)
    : items;
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
    if (named.length === 1) {
      const row = named[0];
      const rowPurchase = (Number(row.quantity) || 0) * (Number(row.purchasePrice) || 0);
      if (Math.abs(rowPurchase - devicePurchase) <= 0.05) {
        onChange({
          installationSupplies: items.map((entry) =>
            entry.id === row.id ? { ...entry, rowKind: 'device' as const } : entry,
          ),
          devicePurchaseOverrideNet: null,
          deviceSaleOverrideNet: null,
        });
        return;
      }
    }

    const label = [form.deviceBrand, form.deviceModel]
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)
      .join(' ')
      .trim() || 'Laite';
    const sell =
      form.deviceSaleOverrideNet != null
        ? Number(form.deviceSaleOverrideNet) || 0
        : computeManualDeviceSellNet(devicePurchase, form.deviceMarginPercent);

    onChange({
      installationSupplies: [
        ...items,
        createEmptyMaterial({
          name: label,
          quantity: 1,
          purchasePrice: devicePurchase,
          marginPercent: Number(form.deviceMarginPercent) || 0,
          sellPrice: sell,
          rowKind: 'device',
        }),
      ],
      devicePurchaseOverrideNet: null,
      deviceSaleOverrideNet: null,
    });
  }, [
    form.deviceBrand,
    form.deviceMarginPercent,
    form.deviceModel,
    form.devicePurchaseOverrideNet,
    form.deviceSaleOverrideNet,
    items,
    onChange,
  ]);

  const devicePurchase = installationSuppliesDevicePurchaseNet(items);
  const deviceSell = installationSuppliesDeviceSellNet(items);
  const supplyPurchase = installationSuppliesSupplyPurchaseNet(items);
  const supplySell = installationSuppliesSupplySellNet(items);
  const laborPurchase = installationSuppliesLaborPurchaseNet(items);
  const laborSell = installationSuppliesLaborSellNet(items);
  const expensePurchase = installationSuppliesExpensePurchaseNet(items);
  const expenseSell = installationSuppliesExpenseSellNet(items);
  const productPurchase = installationSuppliesPurchaseNet(items);
  const sellTotal = installationSuppliesSellNet(items);
  const productMargin = installationSuppliesProductMarginNet(form);
  const hasDeviceRows = devicePurchase > 0.005 || items.some((row) => resolveQuoteMaterialRowKind(row) === 'device');
  const hasLaborRows = laborPurchase > 0.005 || items.some((row) => resolveQuoteMaterialRowKind(row) === 'labor');
  const hasExpenseRows = expensePurchase > 0.005 || items.some((row) => resolveQuoteMaterialRowKind(row) === 'expense');

  function updateItems(nextItems: QuoteMaterial[]) {
    onChange(patchInstallationSupplies(nextItems));
  }

  function updateRow(rowId: string, patch: Partial<QuoteMaterial>) {
    updateItems(
      items.map((row) => (row.id === rowId ? syncInstallationSupplyRow(row, patch) : row)),
    );
  }

  const defaultRowKind = rowKindFilter ?? 'supply';
  const sectionTitle = rowKindFilter ? KIND_SECTION_TITLE[rowKindFilter] : 'Rivit';
  const addLabel = rowKindFilter ? KIND_ADD_LABEL[rowKindFilter] : '+ Lisää rivi';

  return (
    <div className="quote-installation-supplies">
      <p className="muted">
        {rowKindFilter
          ? KIND_SECTION_INTRO[rowKindFilter]
          : (
            <>
              Lisää rivit yhdellä painikkeella ja valitse rivityyppi: <strong>Työ</strong>,{' '}
              <strong>Tarvike</strong>, <strong>Kulu</strong> tai <strong>Laite</strong> — samat tyypit
              kuin työraportissa. Asiakkaan tarjouksessa jokainen rivi näkyy tuotekentän tekstillä. Kun
              myyntihinta on sovittu, hankinnan muutos päivittää kate-%:n.
            </>
          )}
      </p>

      <div className="section-header-row">
        <h3>{sectionTitle}</h3>
        {canEdit ? (
          <div className="form-actions" style={{ margin: 0 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() =>
                updateItems([
                  ...items,
                  createEmptyMaterial({
                    quantity: 1,
                    rowKind: defaultRowKind,
                  }),
                ])
              }
            >
              {addLabel}
            </button>
          </div>
        ) : null}
      </div>

      {visibleItems.length === 0 ? (
        <p className="muted">Ei rivejä vielä.</p>
      ) : (
        <div className="quote-material-rows">
          {visibleItems.map((item, index) => {
            const qty = Number(item.quantity) || 0;
            const sell = qty * (Number(item.sellPrice) || 0);
            const displayMarginPercent = resolveInstallationSupplyMarginPercent(item);
            const rowKind = resolveQuoteMaterialRowKind(item);
            const rowKindClass =
              rowKind === 'device'
                ? ' quote-material-row-device'
                : rowKind === 'labor'
                  ? ' quote-material-row-labor'
                  : rowKind === 'expense'
                    ? ' quote-material-row-expense'
                    : '';
            return (
              <div
                key={item.id}
                className={`quote-material-row panel-inset${rowKindClass}`}
              >
                <div className="quote-line-head">
                  <strong>
                    Rivi {index + 1} · {quoteMaterialRowKindLabel(rowKind)}
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
                  {!rowKindFilter ? (
                    <label>
                      Rivin tyyppi
                      <select
                        value={rowKind}
                        onChange={(e) =>
                          updateRow(item.id, {
                            rowKind: e.target.value as QuoteMaterialRowKind,
                          })
                        }
                        disabled={!canEdit}
                      >
                        {QUOTE_MATERIAL_ROW_KINDS.map((kind) => (
                          <option key={kind} value={kind}>
                            {quoteMaterialRowKindLabel(kind)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label className="quote-material-row-span-all">
                    {productLabel(rowKind)}
                    <input
                      value={item.name}
                      onChange={(e) => updateRow(item.id, { name: e.target.value })}
                      disabled={!canEdit}
                      placeholder="Kuvaus"
                    />
                  </label>
                  <label>
                    {quantityLabel(rowKind)}
                    <input
                      type="number"
                      min="0"
                      step={rowKind === 'labor' ? '0.25' : '0.001'}
                      value={item.quantity}
                      onChange={(e) => updateRow(item.id, { quantity: Number(e.target.value) })}
                      disabled={!canEdit}
                    />
                  </label>
                  <label>
                    Yksikkö
                    <select
                      value={item.unit ?? defaultUnitForKind(rowKind)}
                      onChange={(e) => updateRow(item.id, { unit: e.target.value })}
                      disabled={!canEdit}
                    >
                      {CUSTOMER_PRINT_QUANTITY_UNIT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {unitPriceLabel(rowKind, 'purchase')}
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
                    {unitPriceLabel(rowKind, 'sell')}
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

      {visibleItems.length > 0 ? (
        <div className="quote-summary-box">
          {rowKindFilter === 'labor' || (!rowKindFilter && hasLaborRows) ? (
            <div>Työt: hankinta {formatEuro(laborPurchase)} · myynti {formatEuro(laborSell)}</div>
          ) : null}
          {rowKindFilter === 'expense' || (!rowKindFilter && hasExpenseRows) ? (
            <div>Kulut: hankinta {formatEuro(expensePurchase)} · myynti {formatEuro(expenseSell)}</div>
          ) : null}
          {rowKindFilter === 'device' || (!rowKindFilter && hasDeviceRows) ? (
            <div>
              Laitteet: hankinta {formatEuro(devicePurchase)} · myynti {formatEuro(deviceSell)}
            </div>
          ) : null}
          {rowKindFilter === 'supply' || (!rowKindFilter && (supplyPurchase > 0.005 || supplySell > 0.005)) ? (
            <div>
              Tarvikkeet: hankinta {formatEuro(supplyPurchase)} · myynti {formatEuro(supplySell)}
            </div>
          ) : null}
          {rowKindFilter ? (
            <strong>
              Yhteensä: hankinta{' '}
              {formatEuro(
                rowKindFilter === 'labor'
                  ? laborPurchase
                  : rowKindFilter === 'expense'
                    ? expensePurchase
                    : rowKindFilter === 'device'
                      ? devicePurchase
                      : supplyPurchase,
              )}{' '}
              · myynti{' '}
              {formatEuro(
                rowKindFilter === 'labor'
                  ? laborSell
                  : rowKindFilter === 'expense'
                    ? expenseSell
                    : rowKindFilter === 'device'
                      ? deviceSell
                      : supplySell,
              )}
            </strong>
          ) : (
            <>
              <div>Hankinta yhteensä: {formatEuro(productPurchase)}</div>
              <div>Myynti yhteensä: {formatEuro(sellTotal)}</div>
              <strong>Kate: {formatEuro(productMargin)}</strong>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
