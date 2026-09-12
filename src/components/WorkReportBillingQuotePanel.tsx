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
  compareQuoteInstallationToWorkReport,
  type InstallationComparison,
} from '../lib/quoteInstallationComparison';
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
    () => mergeActualPurchaseFromWorkReportLogs(settings, dailyLogs),
    [settings, dailyLogs],
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
  const installationComparison = useMemo(
    () =>
      quoteData && partnerCalculation
        ? compareQuoteInstallationToWorkReport({
            quoteData,
            partnerCalculation,
            logs: dailyLogs,
            partnerRates: partnerCalculation.ratesUsed,
            tripKmRate,
          })
        : null,
    [quoteData, partnerCalculation, dailyLogs, tripKmRate],
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
      const payload = normalizeBillingQuoteSettings(
        mergeActualPurchaseFromWorkReportLogs(parseBillingQuoteSettings(settings), dailyLogs),
      );
      await saveBillingQuoteSettings(supabase, workReportId, payload, {
        logs: dailyLogs,
        syncQuoteRequest: Boolean(payload.quote_request_id),
      });
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
  const showSeparateCustomerTotal =
    quoteHasVat(effectiveSettings.quote_vat_rate)
    || effectiveSettings.customer_mode === 'quote_plus_extras'
    || (
      effectiveSettings.customer_invoice_total != null
      && effectiveSettings.quote_sale_net != null
      && Math.abs(effectiveSettings.customer_invoice_total - effectiveSettings.quote_sale_net) > 0.01
    );
  const purchaseMarginAdjustment = computeQuotePurchaseMarginAdjustment(effectiveSettings);

  function formatComparisonQty(
    row: InstallationComparison['rows'][number],
    value: number | null,
  ): string {
    if (value == null) return '—';
    const suffix =
      row.key === 'hours' ? ' h' : row.key === 'travel_km' ? ' km' : '';
    return `${value.toLocaleString('fi-FI', { maximumFractionDigits: 2 })}${suffix}`;
  }

  function renderInstallationComparisonTable(comparison: InstallationComparison) {
    return (
      <div className="table-wrap billing-purchase-lines-wrap">
        <h4 className="billing-breakdown-heading">Tarjous vs toteutunut (työ ja ajot)</h4>
        <p className="muted billing-purchase-lines-hint">
          Vertailu käyttää tarjouksen työtunteja ja km-määrää sekä kumppanin tunti- ja km-hintoja.
          Materiaalit ovat erillään hankintakorjauksissa.
        </p>
        <table className="billing-table billing-purchase-lines-table">
          <thead>
            <tr>
              <th>Rivi</th>
              <th className="num">Tarjous määrä</th>
              <th className="num">Toteutunut määrä</th>
              <th className="num">Tarjous €</th>
              <th className="num">Toteutunut €</th>
              <th className="num">Ero €</th>
            </tr>
          </thead>
          <tbody>
            {comparison.rows.map((row) => {
              const changed = Math.abs(row.varianceNet) > 0.005;
              const showMoney =
                row.quoteCostNet > 0 || row.actualCostNet > 0 || row.key === 'total';
              return (
                <tr
                  key={row.key}
                  className={changed ? 'billing-purchase-line-changed' : undefined}
                >
                  <td>{row.label}</td>
                  <td className="num">{formatComparisonQty(row, row.quoteQty)}</td>
                  <td className="num">{formatComparisonQty(row, row.actualQty)}</td>
                  <td className="num">
                    {showMoney && (row.quoteCostNet > 0 || row.key === 'total')
                      ? formatEuro(row.quoteCostNet)
                      : '—'}
                  </td>
                  <td className="num">
                    {showMoney && (row.actualCostNet > 0 || row.key === 'total')
                      ? formatEuro(row.actualCostNet)
                      : '—'}
                  </td>
                  <td className="num">
                    {showMoney ? formatEuro(row.varianceNet) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  function renderPurchaseLinesTable(lines: BillingQuotePurchaseLine[], editable: boolean) {
    if (lines.length === 0) return null;
    return (
      <div className="table-wrap billing-purchase-lines-wrap">
        <h4 className="billing-breakdown-heading">Hankinta: tarjous vs toteutunut</h4>
        <p className="muted billing-purchase-lines-hint">
          <strong>Tarjouksen hankinta</strong> on tarjouspyynnön arvio.{' '}
          <strong>Todellinen hankinta</strong> lasketaan päiväkirjan tarvikkeista ja kuluista (lukuun ottamatta
          ajokorvauksia). Laitteen hankinta voidaan korjata käsin laskun mukaan. Tallennus päivittää myös
          tarjouspyynnön hankintahinnat.
        </p>
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
                    {fromDailyLog ? (
                      <span className="muted"> · päiväkirjasta</span>
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
                      Lisätyöt ja -kulut kirjataan päiväkirjan ruudusta{' '}
                      <strong>Lisä työt ja kulut</strong>. Täytetyt kentät laskutetaan automaattisesti
                      tarjouksen päälle.
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

              <label className="form-field">
                <span>Tarjouksen hankinta yhteensä (alv 0 %)</span>
                <input type="text" value={formatEuro(quotePurchaseTotal)} disabled readOnly />
                <span className="muted field-hint">Tarjouspyynnön arvio — ei muutu raportilla.</span>
              </label>

              <label className="form-field">
                <span>Todellinen hankinta yhteensä (alv 0 %)</span>
                <input type="text" value={formatEuro(actualPurchaseTotal)} disabled readOnly />
                <span className="muted field-hint">
                  Lasketaan päiväkirjan tarvikkeista
                  {purchaseCostAnalysis.lines.length > 0
                    ? ` (${purchaseCostAnalysis.lines.length} riviä)`
                    : ''}
                  {purchaseLines.some((line) => line.source === 'device') ? ' + laite' : ''}.
                </span>
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
              Lisätyöt ja -kulut: avaa päiväkirjamerkintä → ruutu <strong>Lisä työt ja kulut</strong>.
            </p>
          ) : null}

          {readOnly ? renderPurchaseLinesTable(purchaseLines, false) : null}

          {installationComparison ? renderInstallationComparisonTable(installationComparison) : null}

          {showPartnerMargin && partnerMargin ? (
            <div className="table-wrap">
              <h4 className="billing-breakdown-heading">Kate kumppanille</h4>
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
                  <tr>
                    <td>Työ ja ajot (kumppani)</td>
                    <td className="num">− {formatEuro(partnerMargin.installationLaborTravelNet)}</td>
                  </tr>
                  <tr>
                    <td>Hankinta (tarjous / tarvikkeet)</td>
                    <td className="num">− {formatEuro(partnerMargin.effectiveMaterialCostNet)}</td>
                  </tr>
                  {partnerMargin.marginEatingExpenseNet > 0.005 ? (
                    <tr>
                      <td>Katetta syövät kulut (ei lisälaskutusta)</td>
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
                  <tr className="muted">
                    <td>Todellinen hankinta (tarjousrivit)</td>
                    <td className="num">{formatEuro(partnerMargin.actualPurchaseNet)}</td>
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
                Kate = tarjoushinta + lisälaskutus − työ ja ajot − hankinta (tarjous + tarvikkeet) −
                katetta syövät kulut − piikkiostot.
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
