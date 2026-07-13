import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  billingQuoteFromQuoteRow,
  billingQuoteHasData,
  computePartnerNetMargin,
  loadBillingQuoteOptions,
  parseBillingQuoteSettings,
  quoteHasVat,
  saveBillingQuoteSettings,
  type BillingQuoteOption,
  type BillingQuoteSettings,
} from '../lib/workReportBillingQuote';
import { formatEuro } from '../lib/workReportBilling';
import { supabase } from '../lib/supabase';

type Props = {
  workReportId: string;
  customerId: string | null | undefined;
  ownerCompanyId: string | null | undefined;
  installationCostNet: number | null;
  initialSettings: BillingQuoteSettings;
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

export default function WorkReportBillingQuotePanel({
  workReportId,
  customerId,
  ownerCompanyId,
  installationCostNet,
  initialSettings,
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

  const partnerMargin = useMemo(
    () =>
      installationCostNet != null
        ? computePartnerNetMargin(settings, installationCostNet)
        : null,
    [settings, installationCostNet],
  );

  function applyQuote(option: BillingQuoteOption) {
    void supabase
      .from('quote_requests')
      .select('data')
      .eq('id', option.id)
      .single()
      .then(({ data }) => {
        if (!data) return;
        setSettings((prev) => ({
          ...billingQuoteFromQuoteRow(option.id, option.title, data.data, {
            fixedCustomerBilling: prev.customer_mode !== 'daily_log',
          }),
          notes: prev.notes ?? null,
          actual_purchase_net: prev.actual_purchase_net ?? option.quote_purchase_net,
        }));
      });
    setExpanded(true);
  }

  async function saveSettings() {
    setBusy(true);
    setError(null);
    try {
      const payload = parseBillingQuoteSettings(settings);
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
                <label className="form-field span-2 compact-option">
                  <input
                    type="checkbox"
                    checked={settings.customer_mode === 'quote_fixed'}
                    disabled={busy || !settings.quote_request_id}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        customer_mode: e.target.checked ? 'quote_fixed' : 'daily_log',
                      }))
                    }
                  />
                  Asiakkaalta laskutetaan kiinteä tarjoushinta (ei tunti- ja ajolaskentaa)
                </label>
              ) : null}

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
                <span>Tarjouksen hankinta (alv 0 %)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={moneyInputValue(settings.quote_purchase_net)}
                  disabled={busy}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      quote_purchase_net: parseMoneyInput(e.target.value),
                    }))
                  }
                />
              </label>

              <label className="form-field">
                <span>Todellinen hankinta (alv 0 %)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={moneyInputValue(settings.actual_purchase_net)}
                  disabled={busy}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      actual_purchase_net: parseMoneyInput(e.target.value),
                    }))
                  }
                />
              </label>

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
              {settings.quote_sale_net != null ? (
                <>
                  <dt>Tarjoushinta (alv 0 %)</dt>
                  <dd>{formatEuro(settings.quote_sale_net)}</dd>
                </>
              ) : null}
              {settings.quote_purchase_net != null ? (
                <>
                  <dt>Tarjouksen hankinta (alv 0 %)</dt>
                  <dd>{formatEuro(settings.quote_purchase_net)}</dd>
                </>
              ) : null}
              {settings.actual_purchase_net != null ? (
                <>
                  <dt>Todellinen hankinta (alv 0 %)</dt>
                  <dd>{formatEuro(settings.actual_purchase_net)}</dd>
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
                    <td>Todellinen hankinta (alv 0 %)</td>
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
