import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  billingQuoteFromQuoteRow,
  billingQuoteHasData,
  computePartnerNetMargin,
  loadBillingQuoteOptions,
  mergeDailyLogExpensePurchaseIntoQuoteSettings,
  normalizeBillingQuoteSettings,
  parseBillingQuoteSettings,
  quoteHasVat,
  resolveActualPurchaseTotal,
  resolveQuotePurchaseTotal,
  saveBillingQuoteSettings,
  type BillingQuoteOption,
  type BillingQuotePurchaseLine,
  type BillingQuoteExtraCustomerLine,
  type BillingQuoteSettings,
} from '../lib/workReportBillingQuote';
import { extractQuotePurchaseLines } from '../lib/quotePurchaseLines';
import { formatEuro } from '../lib/workReportBilling';
import { supabase } from '../lib/supabase';

type Props = {
  workReportId: string;
  customerId: string | null | undefined;
  ownerCompanyId: string | null | undefined;
  installationCostNet: number | null;
  initialSettings: BillingQuoteSettings;
  dailyLogExpensePurchaseNet?: number;
  showPartnerMargin?: boolean;
  showCustomerQuoteMode?: boolean;
  readOnly?: boolean;
  printHref?: string;
  onSaved?: (settings: BillingQuoteSettings) => void;
};

function parseMoneyInput(value: string): number | null {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function moneyInputValue(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  return String(value);
}

function newExtraCustomerLine(): BillingQuoteExtraCustomerLine {
  return {
    id: `extra:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    description: '',
    qty: 1,
    unit_price: null,
    amount: null,
  };
}

export default function WorkReportBillingQuotePanel({
  workReportId,
  customerId,
  ownerCompanyId,
  installationCostNet,
  initialSettings,
  dailyLogExpensePurchaseNet = 0,
  showPartnerMargin = false,
  showCustomerQuoteMode = false,
  readOnly = false,
  printHref,
  onSaved,
}: Props) {
  const [settings, setSettings] = useState<BillingQuoteSettings>(() =>
    parseBillingQuoteSettings(initialSettings),
  );
  const [quoteOptions, setQuoteOptions] = useState<BillingQuoteOption[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(() => billingQuoteHasData(initialSettings));

  useEffect(() => {
    setSettings(parseBillingQuoteSettings(initialSettings));
    if (billingQuoteHasData(initialSettings)) setExpanded(true);
  }, [initialSettings]);

  useEffect(() => {
    if (!customerId || readOnly) return;
    let cancelled = false;
    setQuotesLoading(true);
    void loadBillingQuoteOptions(supabase, customerId, ownerCompanyId)
      .then((rows) => {
        if (!cancelled) setQuoteOptions(rows);
      })
      .catch((err) => {
        if (!cancelled) console.error(err);
      })
      .finally(() => {
        if (!cancelled) setQuotesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId, ownerCompanyId, readOnly]);

  useEffect(() => {
    if (!settings.quote_request_id || (settings.purchase_lines?.length ?? 0) > 0 || readOnly) return;
    let cancelled = false;
    void supabase
      .from('quote_requests')
      .select('data')
      .eq('id', settings.quote_request_id)
      .single()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setSettings((prev) =>
          normalizeBillingQuoteSettings({
            ...prev,
            purchase_lines: extractQuotePurchaseLines(data.data),
          }),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [settings.quote_request_id, settings.purchase_lines?.length, readOnly]);

  const partnerMargin = useMemo(
    () =>
      installationCostNet != null
        ? computePartnerNetMargin(settings, installationCostNet)
        : null,
    [settings, installationCostNet],
  );
  const quoteBillingEnabled =
    settings.customer_mode === 'quote_fixed' || settings.customer_mode === 'quote_plus_extras';
  const quotePlusExtrasEnabled = settings.customer_mode === 'quote_plus_extras';
  const extraCustomerLines = settings.extra_customer_lines ?? [];

  function updateExtraLine(id: string, patch: Partial<BillingQuoteExtraCustomerLine>) {
    setSettings((prev) => ({
      ...prev,
      extra_customer_lines: (prev.extra_customer_lines ?? []).map((line) =>
        line.id === id ? { ...line, ...patch } : line,
      ),
    }));
  }

  function removeExtraLine(id: string) {
    setSettings((prev) => ({
      ...prev,
      extra_customer_lines: (prev.extra_customer_lines ?? []).filter((line) => line.id !== id),
    }));
  }

  function renderExtraCustomerLinesSection(editable: boolean) {
    if (!quotePlusExtrasEnabled) return null;
    return (
      <div className="span-2 billing-extra-customer-lines">
        <h4 className="billing-breakdown-heading">Lisätyöt asiakkaalle (tarjouksen päälle)</h4>
        <p className="muted">
          Päiväkirjasta tulevat automaattisesti mukaan kulut, joissa valinta on „Vain asiakas
          laskutetaan“, sekä merkinnät joissa on valittu „Lisätyö tarjouksen päälle“.
        </p>
        {editable ? (
          <>
            <div className="table-wrap">
              <table className="billing-table">
                <thead>
                  <tr>
                    <th>Kuvaus</th>
                    <th className="num">Summa (€)</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {extraCustomerLines.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="muted">
                        Ei manuaalisia lisärivejä — lisää tarvittaessa tai merkitse päiväkirjaan.
                      </td>
                    </tr>
                  ) : (
                    extraCustomerLines.map((line) => (
                      <tr key={line.id}>
                        <td>
                          <input
                            type="text"
                            value={line.description}
                            disabled={busy}
                            placeholder="Esim. lisäasennustyö"
                            onChange={(e) => updateExtraLine(line.id, { description: e.target.value })}
                          />
                        </td>
                        <td className="num">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={moneyInputValue(line.amount ?? line.unit_price)}
                            disabled={busy}
                            onChange={(e) =>
                              updateExtraLine(line.id, {
                                amount: parseMoneyInput(e.target.value),
                                unit_price: parseMoneyInput(e.target.value),
                                qty: 1,
                              })
                            }
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={busy}
                            onClick={() => removeExtraLine(line.id)}
                          >
                            Poista
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() =>
                setSettings((prev) => ({
                  ...prev,
                  extra_customer_lines: [...(prev.extra_customer_lines ?? []), newExtraCustomerLine()],
                }))
              }
            >
              Lisää lisärivi
            </button>
          </>
        ) : extraCustomerLines.length > 0 ? (
          <ul>
            {extraCustomerLines.map((line) => (
              <li key={line.id}>
                {line.description}: {formatEuro(line.amount ?? line.unit_price ?? 0)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Ei manuaalisia lisärivejä.</p>
        )}
      </div>
    );
  }

  function applyQuote(option: BillingQuoteOption) {
    void supabase
      .from('quote_requests')
      .select('data')
      .eq('id', option.id)
      .single()
      .then(({ data }) => {
        if (!data) return;
        setSettings((prev) =>
          billingQuoteFromQuoteRow(option.id, option.title, data.data, {
            fixedCustomerBilling: prev.customer_mode !== 'daily_log',
            previous: prev,
          }),
        );
      });
    setExpanded(true);
  }

  function updatePurchaseLine(id: string, actualPurchaseNet: number | null) {
    setSettings((prev) =>
      normalizeBillingQuoteSettings({
        ...prev,
        purchase_lines: (prev.purchase_lines ?? []).map((line) =>
          line.id === id
            ? {
                ...line,
                actual_purchase_net: actualPurchaseNet ?? line.quote_purchase_net,
              }
            : line,
        ),
      }),
    );
  }

  async function saveSettings() {
    setBusy(true);
    setError(null);
    try {
      const payload = normalizeBillingQuoteSettings(parseBillingQuoteSettings(settings));
      await saveBillingQuoteSettings(supabase, workReportId, payload);
      setSettings(payload);
      onSaved?.(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tallennus epäonnistui');
    } finally {
      setBusy(false);
    }
  }

  if (readOnly && !billingQuoteHasData(settings)) return null;

  const customerTotalLabel = quoteHasVat(settings.quote_vat_rate)
    ? 'Asiakkaalta laskutettava (sis. alv)'
    : 'Asiakkaalta laskutettava (alv 0 %)';

  const purchaseLines = settings.purchase_lines ?? [];
  const quotePurchaseTotal = resolveQuotePurchaseTotal(settings);
  const actualPurchaseTotal = resolveActualPurchaseTotal(settings);

  function renderPurchaseLinesTable(lines: BillingQuotePurchaseLine[], editable: boolean) {
    if (lines.length === 0) return null;
    return (
      <div className="table-wrap billing-purchase-lines-wrap">
        <h4 className="billing-breakdown-heading">Hankintakorjaukset</h4>
        <p className="muted billing-purchase-lines-hint">
          Tarjouksen hankintahinnat ovat vain luku -tilassa. Korjaa todelliset hankintakulut raportilla.
        </p>
        {dailyLogExpensePurchaseNet > 0.005 && editable ? (
          <p className="billing-purchase-lines-hint">
            Päiväkirjan kulujen hankinta yhteensä: <strong>{formatEuro(dailyLogExpensePurchaseNet)}</strong>
            {' · '}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() =>
                setSettings((prev) =>
                  mergeDailyLogExpensePurchaseIntoQuoteSettings(prev, dailyLogExpensePurchaseNet),
                )
              }
            >
              Lisää työraportin kuluista
            </button>
          </p>
        ) : null}
        <table className="billing-table billing-purchase-lines-table">
          <thead>
            <tr>
              <th>Rivi</th>
              <th className="num">Tarjous hankinta</th>
              <th className="num">Todellinen hankinta</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const changed = line.actual_purchase_net !== line.quote_purchase_net;
              return (
                <tr key={line.id} className={changed ? 'billing-purchase-line-changed' : undefined}>
                  <td>
                    {line.label}
                    {line.quantity != null && line.unit ? (
                      <span className="muted">
                        {' '}
                        · {line.quantity} {line.unit}
                      </span>
                    ) : null}
                  </td>
                  <td className="num">{formatEuro(line.quote_purchase_net)}</td>
                  <td className="num">
                    {editable ? (
                      <input
                        type="text"
                        inputMode="decimal"
                        className="billing-purchase-line-input"
                        value={moneyInputValue(line.actual_purchase_net)}
                        disabled={busy}
                        onChange={(e) => updatePurchaseLine(line.id, parseMoneyInput(e.target.value))}
                      />
                    ) : (
                      formatEuro(line.actual_purchase_net)
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>
                <strong>Yhteensä</strong>
              </td>
              <td className="num">
                <strong>{formatEuro(quotePurchaseTotal)}</strong>
              </td>
              <td className="num">
                <strong>{formatEuro(actualPurchaseTotal)}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  return (
    <div className="billing-margin-panel">
      <div className="billing-margin-header">
        <button
          type="button"
          className="billing-margin-toggle"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
        >
          <strong>Tarjous ja kate</strong>
          {partnerMargin ? (
            <span className="billing-margin-headline">
              {' '}
              · puhdas kate {formatEuro(partnerMargin.netMarginNet)}
            </span>
          ) : settings.customer_mode === 'quote_fixed' && settings.customer_invoice_total ? (
            <span className="billing-margin-headline">
              {' '}
              · kiinteä asiakashinta {formatEuro(settings.customer_invoice_total)}
            </span>
          ) : settings.customer_mode === 'quote_plus_extras' && settings.customer_invoice_total ? (
            <span className="billing-margin-headline">
              {' '}
              · tarjous {formatEuro(settings.customer_invoice_total)} + lisät
            </span>
          ) : (
            <span className="muted"> · linkitä tarjous</span>
          )}
        </button>
        {printHref && billingQuoteHasData(settings) ? (
          <Link to={printHref} className="btn btn-secondary btn-sm">
            Tulosta kumppanilasku
          </Link>
        ) : null}
      </div>

      {expanded ? (
        <div className="billing-margin-body">
          {!readOnly ? (
            <div className="form-grid billing-margin-form">
              <label className="form-field span-2">
                <span>Tarjous</span>
                <select
                  value={settings.quote_request_id ?? ''}
                  disabled={busy || quotesLoading || !customerId}
                  onChange={(e) => {
                    const id = e.target.value;
                    if (!id) {
                      setSettings((prev) => ({
                        ...prev,
                        quote_request_id: null,
                        quote_title: null,
                        customer_mode: 'daily_log',
                      }));
                      return;
                    }
                    const option = quoteOptions.find((row) => row.id === id);
                    if (option) applyQuote(option);
                  }}
                >
                  <option value="">
                    {quotesLoading
                      ? 'Ladataan tarjouksia…'
                      : customerId
                        ? 'Valitse tarjous'
                        : 'Ei asiakasta — syötä hinnat käsin'}
                  </option>
                  {quoteOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.title} · {formatEuro(option.customer_invoice_total)}
                    </option>
                  ))}
                </select>
              </label>

              {showCustomerQuoteMode ? (
                <>
                  <label className="form-field span-2 compact-option">
                    <input
                      type="checkbox"
                      checked={quoteBillingEnabled}
                      disabled={busy || !settings.quote_request_id}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                        customer_mode: e.target.checked
                          ? prev.customer_mode === 'quote_fixed'
                            ? 'quote_fixed'
                            : 'quote_plus_extras'
                          : 'daily_log',
                        }))
                      }
                    />
                    Asiakkaalta laskutetaan kiinteä tarjoushinta (ei tunti- ja ajolaskentaa)
                  </label>
                  {quoteBillingEnabled ? (
                    <label className="form-field span-2 compact-option">
                      <input
                        type="checkbox"
                        checked={quotePlusExtrasEnabled}
                        disabled={busy || !settings.quote_request_id}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            customer_mode: e.target.checked ? 'quote_plus_extras' : 'quote_fixed',
                          }))
                        }
                      />
                      Lisää lisätyöt ja -kulut tarjouksen päälle
                    </label>
                  ) : null}
                </>
              ) : null}

              {renderExtraCustomerLinesSection(true)}

              <label className="form-field">
                <span>Tarjoushinta (alv 0 %)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={moneyInputValue(settings.quote_sale_net)}
                  disabled={busy}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      quote_sale_net: parseMoneyInput(e.target.value),
                    }))
                  }
                />
              </label>

              <label className="form-field">
                <span>{customerTotalLabel}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={moneyInputValue(settings.customer_invoice_total)}
                  disabled={busy}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      customer_invoice_total: parseMoneyInput(e.target.value),
                    }))
                  }
                />
              </label>

              <label className="form-field">
                <span>Tarjouksen hankinta yhteensä (alv 0 %)</span>
                <input type="text" value={formatEuro(quotePurchaseTotal)} disabled readOnly />
              </label>

              <label className="form-field">
                <span>Todellinen hankinta yhteensä (alv 0 %)</span>
                <input type="text" value={formatEuro(actualPurchaseTotal)} disabled readOnly />
              </label>

              <div className="span-2">{renderPurchaseLinesTable(purchaseLines, true)}</div>

              <label className="form-field span-2">
                <span>Huomio kumppanille</span>
                <input
                  type="text"
                  value={settings.notes ?? ''}
                  disabled={busy}
                  onChange={(e) => setSettings((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Esim. hankintakorjaus"
                />
              </label>

              <div className="form-actions span-2">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy}
                  onClick={() => void saveSettings()}
                >
                  {busy ? 'Tallennetaan…' : 'Tallenna tarjous'}
                </button>
                {settings.quote_request_id ? (
                  <Link
                    to={`/tarjouspyynnot/${settings.quote_request_id}`}
                    className="btn btn-secondary btn-sm"
                  >
                    Avaa tarjous
                  </Link>
                ) : null}
              </div>
            </div>
          ) : (
            <dl className="billing-margin-readonly">
              {settings.quote_title ? (
                <>
                  <dt>Tarjous</dt>
                  <dd>{settings.quote_title}</dd>
                </>
              ) : null}
              {settings.customer_mode === 'quote_fixed' && settings.customer_invoice_total != null ? (
                <>
                  <dt>Asiakashinta</dt>
                  <dd>{formatEuro(settings.customer_invoice_total)} (kiinteä tarjous)</dd>
                </>
              ) : null}
              {settings.customer_mode === 'quote_plus_extras' && settings.customer_invoice_total != null ? (
                <>
                  <dt>Asiakashinta</dt>
                  <dd>
                    {formatEuro(settings.customer_invoice_total)} (tarjous) + lisätyöt ja -kulut
                  </dd>
                </>
              ) : null}
              {settings.quote_sale_net != null ? (
                <>
                  <dt>Tarjoushinta (alv 0 %)</dt>
                  <dd>{formatEuro(settings.quote_sale_net)}</dd>
                </>
              ) : null}
              {settings.quote_purchase_net != null ? (
                <>
                  <dt>Tarjouksen hankinta yhteensä (alv 0 %)</dt>
                  <dd>{formatEuro(quotePurchaseTotal)}</dd>
                </>
              ) : null}
              {settings.actual_purchase_net != null ? (
                <>
                  <dt>Todellinen hankinta yhteensä (alv 0 %)</dt>
                  <dd>{formatEuro(actualPurchaseTotal)}</dd>
                </>
              ) : null}
              {settings.notes?.trim() ? (
                <>
                  <dt>Huomio</dt>
                  <dd>{settings.notes.trim()}</dd>
                </>
              ) : null}
            </dl>
          )}

          {renderExtraCustomerLinesSection(false)}

          {renderPurchaseLinesTable(purchaseLines, false)}

          {showPartnerMargin && partnerMargin ? (
            <div className="table-wrap">
              <h4 className="billing-breakdown-heading">Kate kumppanille</h4>
              <table className="billing-table billing-margin-table">
                <tbody>
                  <tr>
                    <td>Tarjoushinta (alv 0 %)</td>
                    <td className="num">{formatEuro(partnerMargin.quoteSaleNet)}</td>
                  </tr>
                  <tr>
                    <td>Asennuskulut (työ + ajot + kulut)</td>
                    <td className="num">− {formatEuro(partnerMargin.installationCostNet)}</td>
                  </tr>
                  <tr>
                    <td>Todellinen hankinta yhteensä (alv 0 %)</td>
                    <td className="num">− {formatEuro(partnerMargin.actualPurchaseNet)}</td>
                  </tr>
                  <tr className="billing-margin-total">
                    <td>
                      <strong>Puhdas kate</strong>
                    </td>
                    <td className="num">
                      <strong>{formatEuro(partnerMargin.netMarginNet)}</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="muted billing-margin-formula">
                Kate = tarjoushinta − asennuskulut − todellinen hankinta.
                {partnerMargin.quotePurchaseNet !== partnerMargin.actualPurchaseNet ? (
                  <>
                    {' '}
                    Tarjouksen hankinta oli {formatEuro(partnerMargin.quotePurchaseNet)}.
                  </>
                ) : null}
              </p>
            </div>
          ) : null}

          {error ? <p className="error">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
