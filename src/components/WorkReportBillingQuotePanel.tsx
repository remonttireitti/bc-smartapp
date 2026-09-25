import { useEffect, useMemo, useState } from 'react';
import {
  billingQuoteHasData,
  computePartnerNetMargin,
  DEFAULT_PARTNER_COMMISSION_PERCENT,
  formatPartnerMarginDeductionAmount,
  formatUrakkaOutcomeSummary,
  normalizeBillingQuoteSettings,
  parseBillingQuoteSettings,
  quoteHasVat,
  resolveActualPurchaseTotal,
  resolveCustomerBillableGrandTotal,
  resolvePartnerCommissionPercent,
  resolveQuotePurchaseTotal,
  type BillingQuoteSettings,
} from '../lib/workReportBillingQuote';
import { extractQuotePurchaseLines, sumQuotePurchaseLines } from '../lib/quotePurchaseLines';
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
import {
  collectExtraBillingMarginImpactLines,
  extraBillingMarginImpactStatusLabel,
  formatExtraBillingMarginImpactCell,
} from '../lib/dailyLogCustomerExtraBilling';
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
  readOnly?: boolean;
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
  customerId: _customerId,
  ownerCompanyId: _ownerCompanyId,
  installationCostNet,
  initialSettings,
  dailyLogs = [],
  partnerCalculation = null,
  customerCalculation = null,
  tripKmRate = null,
  showPartnerMargin = false,
  readOnly = false,
}: Props) {
  const [settings, setSettings] = useState<BillingQuoteSettings>(() =>
    parseBillingQuoteSettings(initialSettings),
  );
  const [busy] = useState(false);
  const [error] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(() => billingQuoteHasData(initialSettings));
  const [quoteData, setQuoteData] = useState<unknown>(null);

  useEffect(() => {
    setSettings(parseBillingQuoteSettings(initialSettings));
    if (billingQuoteHasData(initialSettings)) setExpanded(true);
  }, [initialSettings]);

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
  const quoteOnlyPurchaseLines = useMemo(
    () => (quoteData ? extractQuotePurchaseLines(quoteData) : []),
    [quoteData],
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
      partnerCalculation,
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
        ? collectExtraBillingMarginImpactLines(
            dailyLogs,
            partnerCalculation.ratesUsed,
            customerCalculation?.ratesUsed,
          )
        : [],
    [dailyLogs, partnerCalculation, customerCalculation?.ratesUsed],
  );
  const quoteBillingEnabled =
    settings.customer_mode === 'quote_fixed' || settings.customer_mode === 'quote_plus_extras';
  const customerBillableGrandTotal = useMemo(
    () =>
      quoteBillingEnabled
        ? resolveCustomerBillableGrandTotal({
            settings: effectiveSettings,
            logs: dailyLogs,
            customerCalculation,
            rates: customerCalculation?.ratesUsed,
            ratesSource: customerCalculation?.ratesSource,
          })
        : null,
    [effectiveSettings, dailyLogs, customerCalculation, quoteBillingEnabled],
  );

  if (!billingQuoteHasData(settings)) return null;

  const quoteIsLinked = !!settings.quote_request_id;

  const customerTotalLabel = quoteHasVat(settings.quote_vat_rate)
    ? 'Asiakkaalta laskutettava (sis. alv)'
    : 'Asiakkaalta laskutettava (alv 0 %)';

  const quotePurchaseTotal = resolveQuotePurchaseTotal(effectiveSettings);
  const actualPurchaseTotal = resolveActualPurchaseTotal(effectiveSettings);
  const linkedQuotePurchaseTotal =
    quoteOnlyPurchaseLines.length > 0
      ? sumQuotePurchaseLines(quoteOnlyPurchaseLines, 'quote_purchase_net')
      : quotePurchaseTotal;
  const displayPurchaseTotal = quoteIsLinked ? linkedQuotePurchaseTotal : quotePurchaseTotal;
  const displayCustomerPrice =
    effectiveSettings.customer_invoice_total ?? effectiveSettings.quote_sale_net ?? null;
  const linkedQuoteMarginEstimate =
    quoteIsLinked
    && displayCustomerPrice != null
    && displayPurchaseTotal > 0
      ? roundMoney(displayCustomerPrice - displayPurchaseTotal)
      : null;
  const showSeparateCustomerTotal =
    quoteHasVat(effectiveSettings.quote_vat_rate)
    || effectiveSettings.customer_mode === 'quote_plus_extras'
    || (
      effectiveSettings.customer_invoice_total != null
      && effectiveSettings.quote_sale_net != null
      && Math.abs(effectiveSettings.customer_invoice_total - effectiveSettings.quote_sale_net) > 0.01
    );
  function renderQuoteVsActualIntro() {
    return (
      <p className="muted span-2" style={{ margin: 0 }}>
        Verrataan tarjouksen arviota toteutuneisiin kustannuksiin — niitä ei lasketa yhteen.
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
        <td className="num">
          {showMoney
            ? formatEuro(row.quoteNet - row.actualNet)
            : '—'}
        </td>
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
              <th className="num">Budjetti jäljellä</th>
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
              <td className="num">
                <strong>{formatEuro(comparison.quoteTotalNet - comparison.actualTotalNet)}</strong>
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
              {customerBillableGrandTotal && customerBillableGrandTotal.extrasTotal > 0.005 ? (
                <>
                  {' '}
                  · asiakkaalta {formatEuro(customerBillableGrandTotal.grandTotal)}
                </>
              ) : null}
            </span>
          ) : customerBillableGrandTotal ? (
            <span className="billing-margin-headline">
              {' '}
              · asiakkaalta {formatEuro(customerBillableGrandTotal.grandTotal)}
            </span>
          ) : settings.customer_mode === 'quote_fixed' && settings.customer_invoice_total ? (
            <span className="billing-margin-headline">
              {' '}
              · kiinteä asiakashinta {formatEuro(settings.customer_invoice_total)}
            </span>
          ) : null}
        </button>

      </div>

      {expanded ? (
        <div className="billing-margin-body">
          {!readOnly ? (
            <div className="form-grid billing-margin-form">
              {quoteIsLinked ? (
                <div className="form-field span-2 billing-quote-linked-summary">
                  <span>Tarjous:</span>
                  <strong>{settings.quote_title ?? 'Linkitetty tarjous'}</strong>
                </div>
              ) : null}

              {quoteIsLinked ? (
                <div className="span-2 billing-quote-linked-prices">
                  {displayCustomerPrice != null ? (
                    <p style={{ margin: '0 0 .35rem' }}>
                      <strong>Kiinteä tarjoushinta:</strong> {formatEuro(displayCustomerPrice)}
                    </p>
                  ) : null}
                  {displayPurchaseTotal > 0 ? (
                    <p style={{ margin: '0 0 .35rem' }}>
                      <strong>Hankinta:</strong> {formatEuro(displayPurchaseTotal)}
                    </p>
                  ) : null}
                  {linkedQuoteMarginEstimate != null ? (
                    <p style={{ margin: '0 0 .35rem' }}>
                      <strong>Kate (arvio):</strong> {formatEuro(linkedQuoteMarginEstimate)}
                    </p>
                  ) : null}

                </div>
              ) : (
                <>
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
                </>
              )}

              <div className="span-2">
                {categoryComparison ? renderCategoryComparisonTable(categoryComparison) : null}
              </div>

              {showPartnerMargin ? (
                <label className="form-field">
                  <span>Provisio %</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={String(resolvePartnerCommissionPercent(settings))}
                    disabled={busy}
                    onChange={(e) => {
                      const parsed = parseMoneyInput(e.target.value);
                      setSettings((prev) => ({
                        ...prev,
                        partner_commission_percent: parsed,
                      }));
                    }}
                  />
                  <span className="muted field-hint">
                    Osuus puhtaasta katteesta ennen provisiota (oletus{' '}
                    {DEFAULT_PARTNER_COMMISSION_PERCENT} %). Explicit 0 sallittu.
                  </span>
                </label>
              ) : null}

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


            </div>
          ) : (
            <dl className="billing-margin-readonly">
              {settings.quote_title ? (
                <>
                  <dt>Tarjous</dt>
                  <dd>{settings.quote_title}</dd>
                </>
              ) : null}
              {quoteIsLinked ? (
                <>
                  {displayCustomerPrice != null ? (
                    <>
                      <dt>Kiinteä tarjoushinta</dt>
                      <dd>
                        {formatEuro(displayCustomerPrice)}
                        {effectiveSettings.customer_mode === 'quote_fixed'
                          ? ' (+ mahdolliset lisät päiväkirjasta)'
                          : ''}
                      </dd>
                    </>
                  ) : null}
                  {displayPurchaseTotal > 0 ? (
                    <>
                      <dt>Hankinta yhteensä (alv 0 %)</dt>
                      <dd>{formatEuro(displayPurchaseTotal)}</dd>
                    </>
                  ) : null}
                  {linkedQuoteMarginEstimate != null ? (
                    <>
                      <dt>Kate (arvio)</dt>
                      <dd>{formatEuro(linkedQuoteMarginEstimate)}</dd>
                    </>
                  ) : null}
                </>
              ) : (
                <>
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
                  {settings.actual_purchase_net != null
                  && Math.abs(actualPurchaseTotal - quotePurchaseTotal) > 0.005 ? (
                    <>
                      <dt>Todellinen hankinta yhteensä (alv 0 %)</dt>
                      <dd>{formatEuro(actualPurchaseTotal)}</dd>
                    </>
                  ) : null}
                </>
              )}
              {showPartnerMargin ? (
                <>
                  <dt>Provisio %</dt>
                  <dd>{resolvePartnerCommissionPercent(settings)} %</dd>
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



          {readOnly ? (
            <div className="span-2">
              {categoryComparison ? renderCategoryComparisonTable(categoryComparison) : null}
            </div>
          ) : null}

          {showPartnerMargin && partnerMargin ? (
            <div className="table-wrap">
              <h4 className="billing-breakdown-heading">Puhdas kate</h4>
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
                  {customerBillableGrandTotal && customerBillableGrandTotal.extrasTotal > 0.005 ? (
                    <tr className="billing-margin-customer-total">
                      <td>
                        <strong>Asiakkaalta laskutettava yhteensä</strong>
                      </td>
                      <td className="num">
                        <strong>{formatEuro(customerBillableGrandTotal.grandTotal)}</strong>
                      </td>
                    </tr>
                  ) : null}

                  {partnerMargin.deductionRows.map((row) => (
                    <tr key={row.key}>
                      <td>
                        {row.label}
                        {row.details && row.details.length > 0 ? (
                          <div className="muted billing-margin-impact-note">
                            {row.details
                              .map((detail) => `${detail.description} ${formatEuro(detail.total)}`)
                              .join(' · ')}
                          </div>
                        ) : null}
                      </td>
                      <td className="num">{formatPartnerMarginDeductionAmount(row.amount)}</td>
                    </tr>
                  ))}

                  <tr className="billing-margin-subtotal">
                    <td>
                      <strong>Kate ennen provisiota</strong>
                    </td>
                    <td className="num">
                      <strong>{formatEuro(partnerMargin.grossMarginNet)}</strong>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      Provisio ({String(partnerMargin.commissionPercent).replace('.', ',')} %)
                    </td>
                    <td className="num">− {formatEuro(partnerMargin.commissionNet)}</td>
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
                      <th className="num">Hankinta</th>
                      <th className="num">Kate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extrasMarginLines.map((line) => (
                      <tr
                        key={`${line.logId}:${line.kind}:${line.description}:${line.status}`}
                        className={line.status === 'pending' ? 'billing-margin-pending' : undefined}
                      >
                        <td>
                          <div>
                            {line.kind === 'extra_work' ? `Lisätyö: ${line.description}` : line.description}
                          </div>
                          <div className="muted billing-margin-impact-note">
                            {extraBillingMarginImpactStatusLabel(line)}
                          </div>
                        </td>
                        <td className="num">
                          {line.status === 'approved' ? formatEuro(line.customerNet) : '—'}
                        </td>
                        <td className="num">
                          {line.status === 'approved' && line.partnerNet > 0
                            ? `− ${formatEuro(line.partnerNet)}`
                            : '—'}
                        </td>
                        <td className="num">
                          {line.status === 'approved' && line.piikkiCostNet > 0
                            ? `− ${formatEuro(line.piikkiCostNet)}`
                            : '—'}
                        </td>
                        <td className="num">
                          {(() => {
                            const marginCell = formatExtraBillingMarginImpactCell(
                              line,
                              formatEuro,
                              partnerMargin?.netMarginNet,
                            );
                            if (marginCell.approved) {
                              return <strong>{marginCell.approved}</strong>;
                            }
                            return <strong>{marginCell.withPermission}</strong>;
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              {categoryComparison ? (
                <p className="billing-urakka-outcome">
                  <strong>Urakka meni näin:</strong>{' '}
                  {formatUrakkaOutcomeSummary({
                    varianceNet: categoryComparison.varianceNet,
                    quoteTotalNet: categoryComparison.quoteTotalNet,
                    actualTotalNet: categoryComparison.actualTotalNet,
                  })}
                </p>
              ) : null}

            </div>
          ) : null}

          {error ? <p className="error">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
