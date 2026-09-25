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
  expenseDraftCategoryOrNull,
  quoteCategoryLabel,
} from '../lib/workReportEntryCategories';
import { DEVICE_EXPENSE_TYPE, isDeviceExpense } from '../lib/workReportDeviceEntries';
import { formatEuro } from '../lib/workReportBilling';
import {
  applyExpenseBillingMode,
  DEFAULT_PARTNER_EXPENSE_MARGIN_PERCENT,
  DEFAULT_SUPPLY_MARGIN_PERCENT,
  formatExpenseSupplyExtraBillingMarginNote,
  resolveExpenseBillingMode,
  syncSupplyExpenseCustomerPrice,
  type ExpenseBillingMode,
  type ExpenseBillingQuoteContext,
} from '../lib/workReportExpenseBilling';
import { isAutoTripKmExpense, isLikelyAutoTripKmExpense } from '../lib/tripKmExpense';
import { EXPENSE_TYPE_LABELS } from '../types';
import {
  COST_EXPENSE_TYPES,
  DEVICE_EXPENSE_TYPES,
  SUPPLY_EXPENSE_TYPES,
} from '../lib/workReportEntryCategories';

/** Samat ryhmät kuin tarjouspyynnössä ja Tarjous ja kate -vertailussa: Tarvikkeet, Kulut, Laite. */
const EXPENSE_TYPE_GROUPS = [
  { label: 'Tarvikkeet', options: SUPPLY_EXPENSE_TYPES.map((value) => ({ value, label: EXPENSE_TYPE_LABELS[value] ?? value })) },
  { label: 'Kulut', options: COST_EXPENSE_TYPES.map((value) => ({ value, label: EXPENSE_TYPE_LABELS[value] ?? value })) },
  { label: 'Laitteet', options: DEVICE_EXPENSE_TYPES.map((value) => ({ value, label: EXPENSE_TYPE_LABELS[value] ?? value })) },
];

const CATEGORY_HINTS: Record<string, string> = {
  supplies: 'Näkyy Tarjous ja kate -vertailussa rivillä Tarvikkeet.',
  expenses: 'Näkyy Tarjous ja kate -vertailussa rivillä Kulut.',
  device:
    'Näkyy Tarjous ja kate -vertailussa rivillä Laite. Kirjattu laite korvaa tarjouspyynnön laitehinnan — kirjaa silloin kaikki laitteet.',
};

type Props = {
  expenseDrafts: ExpenseDraft[];
  setExpenseDrafts: React.Dispatch<React.SetStateAction<ExpenseDraft[]>>;
  showPartnerPrices: boolean;
  showCustomerPrices: boolean;
  showQuoteLinkedExtraBilling?: boolean;
  showQuoteLinkedCategories?: boolean;
  linkedQuoteRequest?: boolean;
  /** 'device' = Laite-osio (vain laiterivit), 'expenses' = kulut ja tarvikkeet (ei laiterivejä). */
  variant?: 'expenses' | 'device';
  /** Rivi, jonka muokkaus avataan heti (esitäytetty tarjouspyynnön riviltä). */
  initialEditingKey?: string | null;
  onInitialEditingHandled?: () => void;
};

export default function DailyLogExpenseLinesSection({
  expenseDrafts,
  setExpenseDrafts,
  showPartnerPrices,
  showCustomerPrices,
  showQuoteLinkedExtraBilling = false,
  showQuoteLinkedCategories = false,
  linkedQuoteRequest = false,
  initialEditingKey = null,
  onInitialEditingHandled,
  variant = 'expenses',
}: Props) {
  const deviceVariant = variant === 'device';
  const expenseQuoteContext: ExpenseBillingQuoteContext = { linkedQuoteRequest };
  const [editingExpenseKey, setEditingExpenseKey] = useState<string | null>(initialEditingKey);

  useEffect(() => {
    if (initialEditingKey) onInitialEditingHandled?.();
    // Vain avautuessa: esitäytetty rivi avataan kerran.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const manualExpenseDrafts = expenseDrafts.filter(
    (row) => !isLikelyAutoTripKmExpense(row) && isDeviceExpense(row) === deviceVariant,
  );
  const editingIndex = editingExpenseKey
    ? expenseDrafts.findIndex((row) => row.key === editingExpenseKey)
    : -1;
  const editingRow = editingIndex >= 0 ? expenseDrafts[editingIndex] : null;

  useEffect(() => {
    if (editingExpenseKey && editingIndex < 0) setEditingExpenseKey(null);
  }, [editingExpenseKey, editingIndex]);

  function openNewExpense() {
    const newRow = deviceVariant
      ? { ...emptyExpense(), expense_type: DEVICE_EXPENSE_TYPE }
      : emptyExpense();
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
        {deviceVariant
          ? 'Kirjaa hankittu tai asiakkaalle myyty laite: nimi / malli, hankintahinta, asiakashinta ja kuka laitteen osti.'
          : 'Lisää pysäköinti, varaosat ja muut kulut. Avaa rivi muokataksesi hintoja ja laskutusta.'}
      </p>
      <button type="button" className="btn btn-secondary" onClick={openNewExpense}>
        {deviceVariant ? '+ Lisää laite' : '+ Lisää kulu tai tarvike'}
      </button>

      {manualExpenseDrafts.length === 0 ? (
        <p className="muted">{deviceVariant ? 'Ei laitetta tässä kirjauksessa.' : 'Esim. pysäköinti, varaosat, tarvikkeet…'}</p>
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
                  {expenseRowSectionTitle(row, showPartnerPrices, showCustomerPrices, expenseQuoteContext)}
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
              {isDeviceExpense(editingRow)
                ? isNewExpenseRow(editingRow) ? 'Uusi laite' : 'Muokkaa laitetta'
                : isNewExpenseRow(editingRow) ? 'Uusi kulu tai tarvike' : 'Muokkaa riviä'}
            </h3>
            <ExpenseLineEditor
              row={editingRow}
              index={editingIndex}
              setExpenseDrafts={setExpenseDrafts}
              showPartnerPrices={showPartnerPrices}
              showCustomerPrices={showCustomerPrices}
              showQuoteLinkedExtraBilling={showQuoteLinkedExtraBilling}
              showQuoteLinkedCategories={showQuoteLinkedCategories}
              expenseQuoteContext={expenseQuoteContext}
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
  expenseQuoteContext,
}: {
  row: ExpenseDraft;
  index: number;
  setExpenseDrafts: React.Dispatch<React.SetStateAction<ExpenseDraft[]>>;
  showPartnerPrices: boolean;
  showCustomerPrices: boolean;
  showQuoteLinkedExtraBilling: boolean;
  showQuoteLinkedCategories: boolean;
  expenseQuoteContext: ExpenseBillingQuoteContext;
}) {
  const autoTripKm = isAutoTripKmExpense(row);
  const category = expenseDraftCategoryOrNull(row);
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
      next = syncSupplyExpenseCustomerPrice(next, expenseQuoteContext);
    } else if (mode === 'partner_and_customer') {
      next = patchExpenseDraft(next, {}, expenseQuoteContext);
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
        category ? (
          <p className="quote-category-row-hint">
            <span className={`quote-category-badge quote-category-badge-${category}`}>
              {quoteCategoryLabel(category)}
            </span>
            <span className="muted">{CATEGORY_HINTS[category] ?? ''}</span>
          </p>
        ) : (
          <p className="quote-category-row-hint">
            <span className="quote-category-badge quote-category-badge-none">Valitse tyyppi</span>
            <span className="muted">
              Valitse tyyppi, niin rivi osuu oikeaan Tarjous ja kate -riviin: Tarvike / Varaosa →
              Tarvikkeet, Pysäköinti / KM-korvaus / Muu kulu → Kulut, Laite → Laite.
            </span>
          </p>
        )
      ) : null}
      <label>
        Tyyppi
        <select
          value={row.expense_type}
          disabled={autoTripKm}
          onChange={(e) => updateExpenseRow({ ...row, expense_type: e.target.value })}
        >
          <option value="">Valitse tyyppi…</option>
          {EXPENSE_TYPE_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </optgroup>
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
          placeholder={isDeviceExpense(row) ? 'Laitteen nimi / malli' : 'Esim. Varaosa X'}
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
                    updateExpenseRow(
                      patchExpenseDraft(row, { unit_price: e.target.value }, expenseQuoteContext),
                    )
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
                      patchExpenseDraft(
                        row,
                        { customer_margin_percent: e.target.value },
                        expenseQuoteContext,
                      ),
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
                            ? patchExpenseDraft(
                                r,
                                {
                                  extra_billable: checked,
                                  extra_billing_allowed: checked ? r.extra_billing_allowed : false,
                                },
                                expenseQuoteContext,
                              )
                            : r,
                        ),
                      )
                    }
                    onExtraBillingAllowedChange={(checked) =>
                      setExpenseDrafts((current) =>
                        current.map((r, i) =>
                          i === index
                            ? patchExpenseDraft(r, { extra_billing_allowed: checked }, expenseQuoteContext)
                            : r,
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
                  {formatExpenseSupplyExtraBillingMarginNote(row, formatEuro, expenseQuoteContext)}
                  {(!showQuoteLinkedExtraBilling || (row.extra_billable && row.extra_billing_allowed))
                    && Number(row.customer_unit_price) > 0 ? (
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
