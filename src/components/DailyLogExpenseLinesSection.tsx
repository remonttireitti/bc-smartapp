import { useEffect, useState } from 'react';

import ExpenseBillingModeToggles from './ExpenseBillingModeToggles';
import ExpenseExtraBillingToggles from './ExpenseExtraBillingToggles';
import {
  emptyExpense,
  expenseRowSectionTitle,
  isNewExpenseRow,
  patchExpenseDraft,
  type ExpenseDraft,
} from '../lib/dailyLogExpenseDraft';
import {
  classifyExpenseDraftCategory,
  quoteCategoryLabel,
} from '../lib/workReportEntryCategories';
import { formatEuro } from '../lib/workReportBilling';
import {
  applyExpenseBillingMode,
  DEFAULT_PARTNER_EXPENSE_MARGIN_PERCENT,
  DEFAULT_SUPPLY_MARGIN_PERCENT,
  formatExpenseSupplyExtraBillingMarginNote,
  resolveExpenseBillingMode,
  syncSupplyExpenseCustomerPrice,
  type ExpenseBillingMode,
} from '../lib/workReportExpenseBilling';
import { isAutoTripKmExpense, isLikelyAutoTripKmExpense } from '../lib/tripKmExpense';
import { EXPENSE_TYPE_OPTIONS } from '../types';

type Props = {
  expenseDrafts: ExpenseDraft[];
  setExpenseDrafts: React.Dispatch<React.SetStateAction<ExpenseDraft[]>>;
  showPartnerPrices: boolean;
  showCustomerPrices: boolean;
  showQuoteLinkedExtraBilling?: boolean;
  showQuoteLinkedCategories?: boolean;
};

export default function DailyLogExpenseLinesSection({
  expenseDrafts,
  setExpenseDrafts,
  showPartnerPrices,
  showCustomerPrices,
  showQuoteLinkedExtraBilling = false,
  showQuoteLinkedCategories = false,
}: Props) {
  const [editingExpenseKey, setEditingExpenseKey] = useState<string | null>(null);
  const manualExpenseDrafts = expenseDrafts.filter((row) => !isLikelyAutoTripKmExpense(row));
  const editingIndex = editingExpenseKey
    ? expenseDrafts.findIndex((row) => row.key === editingExpenseKey)
    : -1;
  const editingRow = editingIndex >= 0 ? expenseDrafts[editingIndex] : null;

  useEffect(() => {
    if (editingExpenseKey && editingIndex < 0) setEditingExpenseKey(null);
  }, [editingExpenseKey, editingIndex]);

  function openNewExpense() {
    const newRow = emptyExpense();
    setExpenseDrafts((current) => [...current, newRow]);
    setEditingExpenseKey(newRow.key);
  }

  function closeEditor() {
    setEditingExpenseKey(null);
  }

  function removeExpense(key: string) {
    setExpenseDrafts((current) => current.filter((row) => row.key !== key));
    if (editingExpenseKey === key) setEditingExpenseKey(null);
  }

  return (
    <div className="expense-section expense-section-in-dialog">
      <p className="muted expense-section-hint">
        Lisää pysäköinti, varaosat ja muut kulut. Avaa rivi muokataksesi hintoja ja laskutusta.
      </p>
      <button type="button" className="btn btn-secondary" onClick={openNewExpense}>
        + Lisää kulu tai tarvike
      </button>

      {manualExpenseDrafts.length === 0 ? (
        <p className="muted">Esim. pysäköinti, varaosat, tarvikkeet…</p>
      ) : (
        <ul className="expense-line-list">
          {manualExpenseDrafts.map((row) => (
            <li key={row.key}>
              <button
                type="button"
                className="expense-line-list-item"
                onClick={() => setEditingExpenseKey(row.key)}
              >
                <span className="expense-line-list-item-title">
                  {expenseRowSectionTitle(row, showPartnerPrices, showCustomerPrices)}
                </span>
                <span className="expense-line-list-item-action">Muokkaa</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {editingRow && editingIndex >= 0 ? (
        <div
          className="leave-draft-overlay leave-draft-overlay--nested"
          role="presentation"
          onClick={closeEditor}
        >
          <div
            className="leave-draft-dialog panel expense-line-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="expense-line-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="expense-line-dialog-title">
              {isNewExpenseRow(editingRow) ? 'Uusi kulu tai tarvike' : 'Muokkaa riviä'}
            </h3>
            <ExpenseLineEditor
              row={editingRow}
              index={editingIndex}
              setExpenseDrafts={setExpenseDrafts}
              showPartnerPrices={showPartnerPrices}
              showCustomerPrices={showCustomerPrices}
              showQuoteLinkedExtraBilling={showQuoteLinkedExtraBilling}
              showQuoteLinkedCategories={showQuoteLinkedCategories}
            />
            <div className="leave-draft-actions expense-line-dialog-actions">
              {!isAutoTripKmExpense(editingRow) ? (
                <button
                  type="button"
                  className="btn btn-secondary expense-line-dialog-delete"
                  onClick={() => removeExpense(editingRow.key)}
                >
                  Poista rivi
                </button>
              ) : null}
              <button type="button" className="btn btn-primary" onClick={closeEditor}>
                Valmis
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ExpenseLineEditor({
  row,
  index,
  setExpenseDrafts,
  showPartnerPrices,
  showCustomerPrices,
  showQuoteLinkedExtraBilling,
  showQuoteLinkedCategories,
}: {
  row: ExpenseDraft;
  index: number;
  setExpenseDrafts: React.Dispatch<React.SetStateAction<ExpenseDraft[]>>;
  showPartnerPrices: boolean;
  showCustomerPrices: boolean;
  showQuoteLinkedExtraBilling: boolean;
  showQuoteLinkedCategories: boolean;
}) {
  const autoTripKm = isAutoTripKmExpense(row);
  const billingMode = resolveExpenseBillingMode(row);
  const updateExpenseRow = (nextRow: ExpenseDraft) =>
    setExpenseDrafts((current) => current.map((r, i) => (i === index ? nextRow : r)));
  const applyBillingMode = (mode: ExpenseBillingMode) => {
    let next = applyExpenseBillingMode(row, mode);
    if (mode === 'customer_only') {
      next = {
        ...next,
        bill_to_partner: false,
        extra_billable: next.extra_billable ?? false,
        extra_billing_allowed: next.extra_billing_allowed ?? false,
        customer_margin_percent:
          next.customer_margin_percent || String(DEFAULT_SUPPLY_MARGIN_PERCENT),
      };
      next = syncSupplyExpenseCustomerPrice(next);
    } else if (mode === 'partner_and_customer') {
      next = patchExpenseDraft(next, {});
    }
    updateExpenseRow(next);
  };
  const partnerCustomerPreview =
    billingMode === 'partner_and_customer' && Number(row.customer_unit_price) > 0
      ? Number(row.customer_unit_price)
      : null;

  return (
    <div className={`expense-row-fields expense-line-dialog-fields${autoTripKm ? ' expense-row-auto' : ''}`}>
      {showQuoteLinkedCategories ? (
        <p className="quote-category-row-hint">
          <span
            className={`quote-category-badge quote-category-badge-${classifyExpenseDraftCategory(row)}`}
          >
            {quoteCategoryLabel(classifyExpenseDraftCategory(row))}
          </span>
          <span className="muted">
            {classifyExpenseDraftCategory(row) === 'supplies'
              ? 'Hankintahinta vähennetään katteesta tai laskutetaan lisänä.'
              : 'Kulu laskutetaan kumppanilaskutuksessa (esim. ajo, pysäköinti).'}
          </span>
        </p>
      ) : null}
      <label>
        Tyyppi
        <select
          value={row.expense_type}
          disabled={autoTripKm}
          onChange={(e) => updateExpenseRow({ ...row, expense_type: e.target.value })}
        >
          <option value="">Valitse tyyppi…</option>
          {EXPENSE_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Kuvaus
        <input
          value={row.description}
          readOnly={autoTripKm}
          disabled={autoTripKm}
          onChange={(e) => updateExpenseRow({ ...row, description: e.target.value })}
          placeholder="Esim. Varaosa X"
        />
      </label>
      <label>
        Määrä
        <input
          type="number"
          step="0.001"
          min="0"
          value={row.qty}
          readOnly={autoTripKm}
          disabled={autoTripKm}
          onChange={(e) => updateExpenseRow({ ...row, qty: e.target.value })}
        />
      </label>

      {showPartnerPrices ? (
        <div className="expense-billing-panel">
          <p className="expense-billing-panel-title">Laskutus</p>
          <ExpenseBillingModeToggles
            partnerPurchaseOn={billingMode === 'customer_only'}
            billFromPartnerOn={billingMode === 'partner_and_customer'}
            includedInContractOn={billingMode === 'included_in_contract'}
            showIncludedInContract={showQuoteLinkedExtraBilling}
            disabled={autoTripKm}
            onBillFromPartnerChange={(checked) => {
              if (checked) applyBillingMode('partner_and_customer');
              else if (billingMode === 'partner_and_customer') applyBillingMode('customer_only');
            }}
            onPartnerPurchaseChange={(checked) => {
              if (checked) applyBillingMode('customer_only');
              else if (billingMode === 'customer_only') applyBillingMode('partner_and_customer');
            }}
            onIncludedInContractChange={(checked) => {
              if (checked) applyBillingMode('included_in_contract');
              else if (billingMode === 'included_in_contract') {
                applyBillingMode('partner_and_customer');
              }
            }}
          />
          {billingMode === 'included_in_contract' && (
            <div className="expense-billing-fields">
              <label>
                Hankintahinta (€)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={row.unit_price}
                  readOnly={autoTripKm}
                  disabled={autoTripKm}
                  onChange={(e) => updateExpenseRow({ ...row, unit_price: e.target.value })}
                  placeholder="Suora kulu urakkaan"
                />
              </label>
              <p className="muted expense-billing-preview">
                Kuuluu kiinteään tarjoukseen — suora kulu, ei kate laskentaa eikä erillistä
                asiakaslaskutusta.
              </p>
            </div>
          )}
          {billingMode === 'customer_only' && (
            <div className="expense-billing-fields">
              <label>
                Hankintahinta (€)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={row.unit_price}
                  readOnly={autoTripKm}
                  disabled={autoTripKm}
                  onChange={(e) =>
                    updateExpenseRow(patchExpenseDraft(row, { unit_price: e.target.value }))
                  }
                  placeholder="Esim. toimittajan lasku"
                />
              </label>
              <label>
                Kate (%)
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="99.9"
                  value={row.customer_margin_percent}
                  readOnly={autoTripKm}
                  disabled={autoTripKm}
                  onChange={(e) =>
                    updateExpenseRow(
                      patchExpenseDraft(row, { customer_margin_percent: e.target.value }),
                    )
                  }
                />
              </label>
              {showQuoteLinkedExtraBilling ? (
                <>
                  <ExpenseExtraBillingToggles
                    extraBillable={row.extra_billable}
                    extraBillingAllowed={row.extra_billing_allowed}
                    disabled={autoTripKm}
                    onExtraBillableChange={(checked) =>
                      setExpenseDrafts((current) =>
                        current.map((r, i) =>
                          i === index
                            ? patchExpenseDraft(r, {
                                extra_billable: checked,
                                extra_billing_allowed: checked ? r.extra_billing_allowed : false,
                              })
                            : r,
                        ),
                      )
                    }
                    onExtraBillingAllowedChange={(checked) =>
                      setExpenseDrafts((current) =>
                        current.map((r, i) =>
                          i === index ? patchExpenseDraft(r, { extra_billing_allowed: checked }) : r,
                        ),
                      )
                    }
                  />
                  {row.extra_billable && row.extra_billing_allowed ? (
                    <label>
                      Asiakashinta (€)
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={row.customer_unit_price}
                        readOnly={autoTripKm}
                        disabled={autoTripKm}
                        onChange={(e) =>
                          updateExpenseRow({ ...row, customer_unit_price: e.target.value })
                        }
                        placeholder="Lasketaan automaattisesti"
                      />
                    </label>
                  ) : null}
                </>
              ) : null}
              {Number(row.unit_price) > 0 ? (
                <p className="muted expense-billing-preview">
                  {formatExpenseSupplyExtraBillingMarginNote(row, formatEuro)}
                  {row.extra_billable && row.extra_billing_allowed && Number(row.customer_unit_price) > 0 ? (
                    <>
                      {' '}
                      · Asiakkaalle laskutettava:{' '}
                      <strong>{formatEuro(Number(row.customer_unit_price))}</strong>
                      {' '}
                      (hankinta {formatEuro(Number(row.unit_price))} + kate{' '}
                      {row.customer_margin_percent || DEFAULT_SUPPLY_MARGIN_PERCENT} %)
                    </>
                  ) : null}
                </p>
              ) : null}
            </div>
          )}
          {billingMode === 'partner_and_customer' && (
            <div className="expense-billing-fields">
              <label>
                Kumppanihinta (€)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={row.unit_price}
                  readOnly={autoTripKm}
                  disabled={autoTripKm}
                  onChange={(e) =>
                    updateExpenseRow(patchExpenseDraft(row, { unit_price: e.target.value }))
                  }
                  placeholder="0 = ei kumppanilaskutusta"
                />
              </label>
              <label>
                Kumppanin kate (%)
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="99.9"
                  value={row.partner_expense_margin_percent}
                  readOnly={autoTripKm}
                  disabled={autoTripKm}
                  onChange={(e) =>
                    updateExpenseRow(
                      patchExpenseDraft(row, { partner_expense_margin_percent: e.target.value }),
                    )
                  }
                />
              </label>
              {partnerCustomerPreview != null ? (
                <p className="muted expense-billing-preview">
                  Asiakkaalle laskutettava: <strong>{formatEuro(partnerCustomerPreview)}</strong>
                  {Number(row.unit_price) > 0 ? (
                    <>
                      {' '}
                      (kumppani {formatEuro(Number(row.unit_price))} + kate{' '}
                      {row.partner_expense_margin_percent || DEFAULT_PARTNER_EXPENSE_MARGIN_PERCENT}{' '}
                      %)
                    </>
                  ) : null}
                </p>
              ) : (
                <p className="muted expense-billing-preview">
                  Täytä kumppanihinta — asiakashinta lasketaan automaattisesti.
                </p>
              )}
            </div>
          )}
        </div>
      ) : showCustomerPrices ? (
        <>
          <label>
            Ostohinta (€)
            <input
              type="number"
              step="0.01"
              min="0"
              value={row.unit_price}
              readOnly={autoTripKm}
              disabled={autoTripKm}
              onChange={(e) => updateExpenseRow({ ...row, unit_price: e.target.value })}
            />
          </label>
          <label>
            Asiakashinta (€)
            <input
              type="number"
              step="0.01"
              min="0"
              value={row.customer_unit_price}
              readOnly={autoTripKm}
              disabled={autoTripKm}
              onChange={(e) => updateExpenseRow({ ...row, customer_unit_price: e.target.value })}
              placeholder={row.unit_price.trim() || 'Esim. laskutushinta'}
            />
          </label>
          <div className="expense-billing-panel">
            <p className="expense-billing-panel-title">Laskutus</p>
            <ExpenseBillingModeToggles
              partnerPurchaseLabel="Laskutetaan asiakkaalta"
              partnerPurchaseHint="Veloitus näkyy asiakkaan laskulla."
              billFromPartnerLabel="Kuulu urakkaan — ei veloiteta"
              billFromPartnerHint="Ei veloiteta asiakkaalta."
              partnerPurchaseOn={billingMode === 'partner_and_customer'}
              billFromPartnerOn={billingMode === 'included_in_contract'}
              disabled={autoTripKm}
              onPartnerPurchaseChange={(checked) => {
                if (checked) applyBillingMode('partner_and_customer');
                else if (billingMode === 'partner_and_customer') {
                  applyBillingMode('included_in_contract');
                }
              }}
              onBillFromPartnerChange={(checked) => {
                if (checked) applyBillingMode('included_in_contract');
                else if (billingMode === 'included_in_contract') {
                  applyBillingMode('partner_and_customer');
                }
              }}
            />
          </div>
        </>
      ) : (
        <label>
          á hinta (€)
          <input
            type="number"
            step="0.01"
            min="0"
            value={row.unit_price}
            readOnly={autoTripKm}
            disabled={autoTripKm}
            onChange={(e) => updateExpenseRow({ ...row, unit_price: e.target.value })}
          />
        </label>
      )}

      {autoTripKm ? (
        <p className="muted expense-auto-note">Päivittyy automaattisesti ajomatkoista</p>
      ) : null}
    </div>
  );
}
