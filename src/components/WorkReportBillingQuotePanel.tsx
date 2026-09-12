import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  billingQuoteFromQuoteRow,
  billingQuoteHasData,
  computePartnerNetMargin,
  computeQuotePurchaseMarginAdjustment,
  loadBillingQuoteOptions,
  normalizeBillingQuoteSettings,
  parseBillingQuoteSettings,
  quoteHasVat,
  resolveActualPurchaseTotal,
  resolveQuotePurchaseTotal,
  saveBillingQuoteSettings,
  type BillingQuoteOption,
  type BillingQuotePurchaseLine,
  type BillingQuoteSettings,
} from '../lib/workReportBillingQuote';
import { extractQuotePurchaseLines } from '../lib/quotePurchaseLines';
import { analyzeWorkReportPurchaseCosts } from '../lib/workReportActualPurchase';
import { mergeActualPurchaseFromWorkReportLogs } from '../lib/quoteRequestActualPurchaseSync';
import {
  compareQuoteCategories,
  formatCategoryQty,
  type QuoteCategoryComparison,
  type QuoteCategoryRow,
} from '../lib/quoteCategoryComparison';
import {
  collectWorkReportCategoryEntries,
  quoteCategoryLabel,
} from '../lib/workReportEntryCategories';
import { formatEuro, type BillableCalculation } from '../lib/workReportBilling';
import { computeQuoteExtrasMarginFromLogs } from '../lib/dailyLogCustomerExtraBilling';
import type { WorkReportDailyLog } from '../types';
import { supabase } from '../lib/supabase';

type Props = {
  workReportId: string;
  customerId: string | null | undefined;
  ownerCompanyId: string | null | undefined;
  installationCostNet: number | null;
  initialSettings: BillingQuoteSettings;
  dailyLogs?: WorkReportDailyLog[];
  partnerCalculation?: BillableCalculation | null;
  customerCalculation?: BillableCalculation | null;
  tripKmRate?: number | null;
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

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export default function WorkReportBillingQuotePanel({
  workReportId,
  customerId,
  ownerCompanyId,
  installationCostNet,
  initialSettings,
  dailyLogs = [],
  partnerCalculation = null,
  customerCalculation = null,
  tripKmRate = null,
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
  const [quoteData, setQuoteData] = useState<unknown>(null);

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
    if (!settings.quote_request_id) {
      setQuoteData(null);
      return;
    }
    let cancelled = false;
    void supabase
      .from('quote_requests')
      .select('data')
      .eq('id', settings.quote_request_id)
      .single()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setQuoteData(data.data);
        if ((settings.purchase_lines?.length ?? 0) > 0 || readOnly) return;
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

  const effectiveSettings = useMemo(
    () => mergeActualPurchaseFromWorkReportLogs(settings, dailyLogs, quoteData),
    [settings, quoteData, dailyLogs],
  );
  const purchaseCostAnalysis = useMemo(
    () => analyzeWorkReportPurchaseCosts(dailyLogs),
    [dailyLogs],
  );
  const partnerMargin = useMemo(
    () =>
      installationCostNet != null
        ? computePartnerNetMargin(effectiveSettings, installationCostNet, {
            logs: dailyLogs,
            partnerRates: partnerCalculation?.ratesUsed,
            customerRates: customerCalculation?.ratesUsed,
            customerExtrasNet: customerCalculation?.quoteExtrasTotal,
            partnerCalculation,
          })
        : null,
    [
      effectiveSettings,
      installationCostNet,
      dailyLogs,
      partnerCalculation?.ratesUsed,
      customerCalculation?.ratesUsed,
      customerCalculation?.quoteExtrasTotal,
    ],
  );
  const categoryComparison = useMemo(
    () =>
      quoteData && partnerCalculation
        ? compareQuoteCategories({
            quoteData,
            partnerCalculation,
            logs: dailyLogs,
            partnerRates: partnerCalculation.ratesUsed,
            tripKmRate,
            billingSettings: effectiveSettings,
          })
        : null,
    [quoteData, partnerCalculation, dailyLogs, tripKmRate, effectiveSettings],
  );
  const categoryEntries = useMemo(
    () => collectWorkReportCategoryEntries(dailyLogs, partnerCalculation),
    [dailyLogs, partnerCalculation],
  );
  const extrasMarginLines = useMemo(
    () =>
      dailyLogs.length && partnerCalculation
        ? computeQuoteExtrasMarginFromLogs(
            dailyLogs,
            partnerCalculation.ratesUsed,
            customerCalculation?.ratesUsed,
          ).lines
        : [],
    [dailyLogs, partnerCalculation, customerCalculation?.ratesUsed],
  );
  const quoteBillingEnabled =
    settings.customer_mode === 'quote_fixed' || settings.customer_mode === 'quote_plus_extras';

  function applyQuote(option: BillingQuoteOption) {
    void supabase
      .from('quote_requests')
      .select('data')
      .eq('id', option.id)
      .single()
      .then(({ data }) => {
        if (!data) return;
        setQuoteData(data.data);
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
    const currentLines = effectiveSettings.purchase_lines ?? [];
    const target = currentLines.find((line) => line.id === id);
    if (!target) return;

    setSettings((prev) => {
      const saved = [...(prev.purchase_lines ?? [])];
      const index = saved.findIndex((line) => line.id === id);
      const nextLine = {
        ...target,
        actual_purchase_net: actualPurchaseNet ?? target.quote_purchase_net,
      };
      if (index >= 0) saved[index] = nextLine;
      else saved.push(nextLine);
      return normalizeBillingQuoteSettings({ ...prev, purchase_lines: saved });
    });
  }

  async function saveSettings() {
    setBusy(true);
    setError(null);
    try {
      const payload = normalizeBillingQuoteSettings(
        mergeActualPurchaseFromWorkReportLogs(
          parseBillingQuoteSettings(settings),
          dailyLogs,
          quoteData,
        ),
      );
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

  const purchaseLines = effectiveSettings.purchase_lines ?? [];
  const quotePurchaseTotal = resolveQuotePurchaseTotal(effectiveSettings);
  const actualPurchaseTotal = resolveActualPurchaseTotal(effectiveSettings);
  const devicePurchaseLines = purchaseLines.filter((line) => line.source === 'device');
  const suppliesPurchaseLines = purchaseLines.filter((line) => line.source !== 'device');
  const deviceActualTotal = devicePurchaseLines.reduce(
    (sum, line) => sum + line.actual_purchase_net,
    0,
  );
  const suppliesActualTotal = suppliesPurchaseLines.reduce(
    (sum, line) => sum + line.actual_purchase_net,
    0,
  );
  const showSeparateCustomerTotal =
    quoteHasVat(effectiveSettings.quote_vat_rate)
    || effectiveSettings.customer_mode === 'quote_plus_extras'
    || (
      effectiveSettings.customer_invoice_total != null
      && effectiveSettings.quote_sale_net != null
      && Math.abs(effectiveSettings.customer_invoice_total - effectiveSettings.quote_sale_net) > 0.01
    );
  const purchaseMarginAdjustment = computeQuotePurchaseMarginAdjustment(effectiveSettings);

  function renderQuoteVsActualIntro() {
    return (
      <p className="muted span-2" style={{ margin: 0 }}>
        Tarjouspyynnön <strong>työt</strong>, <strong>tarvikkeet</strong>, <strong>kulut</strong> ja{' '}
        <strong>laite</strong> vastaavat työraportin merkintöjä. Arviota ja toteutunutta{' '}
        <strong>verrataan</strong> — niitä ei lasketa yhteen. Kateen laskennassa käytetään vain
        toteutuneita kustannuksia.
      </p>
    );
  }

  function renderCategoryComparisonRow(row: QuoteCategoryRow) {
    const changed = Math.abs(row.varianceNet) > 0.005;
    const showQty = row.key === 'labor' || row.key === 'expenses';
    const showMoney = row.quoteNet > 0.005 || row.actualNet > 0.005;
    return (
      <tr key={row.key} className={changed ? 'billing-purchase-line-changed' : undefined}>
        <td>{row.label}</td>
        <td className="num">{showQty ? formatCategoryQty(row, row.quoteQty) : '—'}</td>
        <td className="num">{showQty ? formatCategoryQty(row, row.actualQty) : '—'}</td>
        <td className="num">{showMoney ? formatEuro(row.quoteNet) : '—'}</td>
        <td className="num">{showMoney ? formatEuro(row.actualNet) : '—'}</td>
        <td className="num">{showMoney ? formatEuro(row.varianceNet) : '—'}</td>
      </tr>
    );
  }

  function renderCategoryComparisonTable(comparison: QuoteCategoryComparison) {
    return (
      <div className="table-wrap billing-purchase-lines-wrap span-2">
        <h4 className="billing-breakdown-heading">Tarjous vs toteutunut</h4>
        {renderQuoteVsActualIntro()}
        <table className="billing-table billing-purchase-lines-table">
          <thead>
            <tr>
              <th>Kategoria</th>
              <th className="num">Tarjous määrä</th>
              <th className="num">Toteutunut määrä</th>
              <th className="num">Tarjous €</th>
              <th className="num">Toteutunut €</th>
              <th className="num">Ero €</th>
            </tr>
          </thead>
          <tbody>
            {comparison.rows.map((row) => renderCategoryComparisonRow(row))}
          </tbody>
          <tfoot>
            <tr>
              <td><strong>Yhteensä</strong></td>
              <td className="num">—</td>
              <td className="num">—</td>
              <td className="num"><strong>{formatEuro(comparison.quoteTotalNet)}</strong></td>
              <td className="num"><strong>{formatEuro(comparison.actualTotalNet)}</strong></td>
              <td className="num">
                <strong>{formatEuro(comparison.varianceNet)}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
        {categoryEntries.length > 0 ? (
          <details className="billing-purchase-lines-details">
            <summary>Työraportin merkinnät kategorioittain ({categoryEntries.length})</summary>
            <table className="billing-table billing-purchase-lines-table">
              <thead>
                <tr>
                  <th>Päivä</th>
                  <th>Kategoria</th>
                  <th>Kuvaus</th>
                  <th className="num">Määrä</th>
                  <th className="num">Toteutunut €</th>
                </tr>
              </thead>
              <tbody>
                {categoryEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.logDate}</td>
                    <td>
                      <span className={`quote-category-badge quote-category-badge-${entry.category}`}>
                        {quoteCategoryLabel(entry.category)}
                      </span>
                    </td>
                    <td>{entry.description}</td>
                    <td className="num">
                      {entry.qty != null && entry.qty > 0
                        ? `${entry.qty.toLocaleString('fi-FI', { maximumFractionDigits: 2 })}${entry.qtyLabel ? ` ${entry.qtyLabel}` : ''}`
                        : '—'}
                    </td>
                    <td className="num">
                      {entry.actualNet > 0.005 ? formatEuro(entry.actualNet) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        ) : null}
      </div>
    );
  }

  function renderPurchaseLinesTable(lines: BillingQuotePurchaseLine[], editable: boolean) {
    if (lines.length === 0) return null;
    return (
      <div className="table-wrap billing-purchase-lines-wrap">
        <h4 className="billing-breakdown-heading">Tarvikkeet ja laite: rivierittely</h4>
        <p className="muted billing-purchase-lines-hint">
          Tarvikkeet (päiväkirjan tarvikerivit) ja laite (oikaisukenttä) eriteltynä. Yhteenveto yllä olevassa
          vertailutaulukossa.
        </p>
        <table className="billing-table billing-purchase-lines-table">
          <thead>
            <tr>
              <th>Rivi</th>
              <th className="num">Tarjous (arvio)</th>
              <th className="num">Toteutunut</th>
              <th className="num">Ero</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const variance = roundMoney(line.actual_purchase_net - line.quote_purchase_net);
              const changed = Math.abs(variance) > 0.005;
              const deviceEditable = editable && line.source === 'device';
              const fromDailyLog = line.source !== 'device';
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
                    {line.source === 'device' ? (
                      <span className="muted"> · oikaisu: toteutunut hankinta</span>
                    ) : null}
                    {fromDailyLog ? (
                      <span className="muted"> · laskettu päiväkirjasta</span>
                    ) : null}
                  </td>
                  <td className="num">{formatEuro(line.quote_purchase_net)}</td>
                  <td className="num">
                    {deviceEditable ? (
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
                  <td className="num">
                    {changed ? formatEuro(variance) : '—'}
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
              <td className="num">
                <strong>
                  {Math.abs(actualPurchaseTotal - quotePurchaseTotal) > 0.005
                    ? formatEuro(roundMoney(actualPurchaseTotal - quotePurchaseTotal))
                    : '—'}
                </strong>
              </td>
            </tr>
          </tfoot>
        </table>
        {purchaseMarginAdjustment
        && Math.abs(purchaseMarginAdjustment.purchaseDeltaNet) > 0.005 ? (
          <p className="muted billing-purchase-lines-hint">
            Hankinta {purchaseMarginAdjustment.purchaseDeltaNet > 0 ? 'nousi' : 'laski'}{' '}
            {formatEuro(Math.abs(purchaseMarginAdjustment.purchaseDeltaNet))} → kate tarjoushinnasta{' '}
            {purchaseMarginAdjustment.marginPercentAtQuote.toLocaleString('fi-FI', {
              maximumFractionDigits: 1,
            })}{' '}
            % →{' '}
            <strong>
              {purchaseMarginAdjustment.marginPercentAfterActual.toLocaleString('fi-FI', {
                maximumFractionDigits: 1,
              })}{' '}
              %
            </strong>
          </p>
        ) : null}
        {purchaseCostAnalysis.lines.length > 0 ? (
          <details className="billing-purchase-lines-details">
            <summary>Päiväkirjan hankintarivit ({purchaseCostAnalysis.lines.length})</summary>
            <table className="billing-table billing-purchase-lines-table">
              <thead>
                <tr>
                  <th>Päivä</th>
                  <th>Kuvaus</th>
                  <th className="num">Hankinta</th>
                </tr>
              </thead>
              <tbody>
                {purchaseCostAnalysis.lines.map((line) => (
                  <tr key={line.key}>
                    <td>{line.logDate}</td>
                    <td>{line.description}</td>
                    <td className="num">{formatEuro(line.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>
                    <strong>Yhteensä päiväkirjasta</strong>
                  </td>
                  <td className="num">
                    <strong>{formatEuro(purchaseCostAnalysis.suppliesNet)}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
            {purchaseCostAnalysis.purchasePricesMissing ? (
              <p className="muted billing-purchase-lines-hint">
                Joistakin riveistä puuttuu hankintahinta — ne eivät ole mukana summassa.
              </p>
            ) : null}
          </details>
        ) : null}
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
                          customer_mode: e.target.checked ? 'quote_fixed' : 'daily_log',
                        }))
                      }
                    />
                    Asiakkaalta laskutetaan kiinteä tarjoushinta (ei tunti- ja ajolaskentaa)
                  </label>
                  {quoteBillingEnabled ? (
                    <p className="muted span-2" style={{ margin: 0 }}>
                      Lisälaskutettavat tarvikkeet merkitään päiväkirjassa ruudussa{' '}
                      <strong>Kulut ja tarvikkeet</strong>: kytkin &quot;Lisälaskutettavissa&quot; ja
                      erikseen &quot;Lupa lisälaskutukseen&quot;.
                    </p>
                  ) : null}
                </>
              ) : null}

              <label className="form-field">
                <span>
                  {showSeparateCustomerTotal
                    ? 'Tarjoushinta (alv 0 %)'
                    : 'Kiinteä tarjoushinta asiakkaalle (alv 0 %)'}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={moneyInputValue(settings.quote_sale_net)}
                  disabled={busy}
                  onChange={(e) => {
                    const parsed = parseMoneyInput(e.target.value);
                    setSettings((prev) => ({
                      ...prev,
                      quote_sale_net: parsed,
                      customer_invoice_total:
                        showSeparateCustomerTotal ? prev.customer_invoice_total : parsed,
                    }));
                  }}
                />
              </label>

              {showSeparateCustomerTotal ? (
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
                  <span className="muted field-hint">
                    Sisältää ALV:n tai lisälaskutuksen, jos eri kuin tarjoushinta.
                  </span>
                </label>
              ) : (
                <p className="muted span-2" style={{ margin: 0 }}>
                  Asiakkaalta laskutetaan sama kiinteä summa kuin tarjoushinta (alv 0 %).
                </p>
              )}

              {categoryComparison ? renderCategoryComparisonTable(categoryComparison) : renderQuoteVsActualIntro()}

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
                  <dd>
                    {formatEuro(settings.customer_invoice_total)} (kiinteä tarjous + mahdolliset lisät
                    päiväkirjasta)
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

          {quoteBillingEnabled && !readOnly ? (
            <p className="muted">
              Lisälaskutus: päiväkirjamerkintä → <strong>Kulut ja tarvikkeet</strong> →
              lisälaskutettavissa + lupa lisälaskutukseen.
            </p>
          ) : null}

          {readOnly ? (
            <>
              {categoryComparison ? renderCategoryComparisonTable(categoryComparison) : null}
              {renderPurchaseLinesTable(purchaseLines, false)}
            </>
          ) : null}

          {showPartnerMargin && partnerMargin ? (
            <div className="table-wrap">
              <h4 className="billing-breakdown-heading">Puhdas kate (toteutuneista kustannuksista)</h4>
              <p className="muted billing-purchase-lines-hint">
                Vähennetään vain toteutunut työ, kulut, tarvikkeet ja laite. Tarjousarviot ovat vertailua —
                eivät lisäkulua.
              </p>
              <table className="billing-table billing-margin-table">
                <tbody>
                  <tr>
                    <td>Tarjoushinta (alv 0 %)</td>
                    <td className="num">{formatEuro(partnerMargin.quoteSaleNet)}</td>
                  </tr>
                  {partnerMargin.customerExtrasNet > 0.005 ? (
                    <tr>
                      <td>Lisälaskutus asiakkaalta</td>
                      <td className="num">+ {formatEuro(partnerMargin.customerExtrasNet)}</td>
                    </tr>
                  ) : null}
                  {categoryComparison?.rows.map((row) => (
                    <tr key={`compare-${row.key}`} className="muted">
                      <td>{row.label} (vertailu arvio → toteutunut)</td>
                      <td className="num">
                        {formatEuro(row.quoteNet)} → {formatEuro(row.actualNet)}
                      </td>
                    </tr>
                  ))}
                  {(() => {
                    const laborRow = categoryComparison?.rows.find((row) => row.key === 'labor');
                    const expensesRow = categoryComparison?.rows.find((row) => row.key === 'expenses');
                    const laborActual = laborRow?.actualNet ?? 0;
                    const expensesActual = expensesRow?.actualNet ?? 0;
                    const laborTravelTotal = roundMoney(
                      laborActual > 0.005 || expensesActual > 0.005
                        ? laborActual + expensesActual
                        : partnerMargin.installationLaborTravelNet,
                    );
                    return (
                      <>
                        {laborActual > 0.005 ? (
                          <tr>
                            <td>Työt (vähennetään katteesta)</td>
                            <td className="num">− {formatEuro(laborActual)}</td>
                          </tr>
                        ) : null}
                        {expensesActual > 0.005 ? (
                          <tr>
                            <td>Kulut (vähennetään katteesta)</td>
                            <td className="num">− {formatEuro(expensesActual)}</td>
                          </tr>
                        ) : null}
                        {laborActual <= 0.005 && expensesActual <= 0.005 && laborTravelTotal > 0.005 ? (
                          <tr>
                            <td>Työ ja kulut (vähennetään katteesta)</td>
                            <td className="num">− {formatEuro(laborTravelTotal)}</td>
                          </tr>
                        ) : null}
                      </>
                    );
                  })()}
                  {deviceActualTotal > 0.005 ? (
                    <tr>
                      <td>Laite (toteutunut hankinta)</td>
                      <td className="num">− {formatEuro(deviceActualTotal)}</td>
                    </tr>
                  ) : null}
                  {suppliesActualTotal > 0.005 ? (
                    <tr>
                      <td>Tarvikkeet (toteutunut, päiväkirja)</td>
                      <td className="num">− {formatEuro(suppliesActualTotal)}</td>
                    </tr>
                  ) : null}
                  {roundMoney(
                    partnerMargin.effectiveMaterialCostNet - deviceActualTotal - suppliesActualTotal,
                  ) > 0.005 ? (
                    <tr>
                      <td>Kumppanille laskutetut tarvikkeet</td>
                      <td className="num">
                        −{' '}
                        {formatEuro(
                          roundMoney(
                            partnerMargin.effectiveMaterialCostNet
                              - deviceActualTotal
                              - suppliesActualTotal,
                          ),
                        )}
                      </td>
                    </tr>
                  ) : null}
                  {partnerMargin.marginEatingExpenseNet > 0.005 ? (
                    <tr>
                      <td>Muut katetta syövät kulut</td>
                      <td className="num">− {formatEuro(partnerMargin.marginEatingExpenseNet)}</td>
                    </tr>
                  ) : null}
                  {partnerMargin.partnerPiikkiPurchaseNet > 0.005 ? (
                    <tr>
                      <td>Kumppanin piikkiostot</td>
                      <td className="num">− {formatEuro(partnerMargin.partnerPiikkiPurchaseNet)}</td>
                    </tr>
                  ) : null}
                  {partnerMargin.piikkiMaterialCostNet > 0.005 ? (
                    <tr>
                      <td>Lisätilauksen piikki-hankinta</td>
                      <td className="num">− {formatEuro(partnerMargin.piikkiMaterialCostNet)}</td>
                    </tr>
                  ) : null}
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
              {extrasMarginLines.length > 0 ? (
                <table className="billing-table billing-margin-table">
                  <thead>
                    <tr>
                      <th>Lisälaskutus</th>
                      <th className="num">Asiakas</th>
                      <th className="num">Kumppani</th>
                      <th className="num">Piikki</th>
                      <th className="num">Kate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extrasMarginLines.map((line) => (
                      <tr key={`${line.logId}:${line.kind}:${line.description}`}>
                        <td>
                          {line.kind === 'extra_work' ? `Lisätyö: ${line.description}` : line.description}
                        </td>
                        <td className="num">{formatEuro(line.customerNet)}</td>
                        <td className="num">
                          {line.partnerNet > 0 ? `− ${formatEuro(line.partnerNet)}` : '—'}
                        </td>
                        <td className="num">
                          {line.piikkiCostNet > 0 ? `− ${formatEuro(line.piikkiCostNet)}` : '—'}
                        </td>
                        <td className="num">
                          <strong>+ {formatEuro(line.marginNet)}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              <p className="muted billing-margin-formula">
                Kate = tarjoushinta + lisälaskutus − työt − kulut − tarvikkeet − laite − katetta syövät
                kulut − piikkiostot.
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
