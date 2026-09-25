import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  billingQuoteHasData,
  computePartnerNetMargin,
  normalizeBillingQuoteSettings,
  parseBillingQuoteSettings,
  saveBillingQuotePrices,
  quoteHasVat,
  resolveActualPurchaseTotal,
  resolveCustomerBillableGrandTotal,
  resolveQuotePurchaseTotal,
  type BillingQuotePurchaseLine,
  type BillingQuoteSettings,
} from '../lib/workReportBillingQuote';
import {
  quoteLinesByCategory,
  showQuoteLineAmounts,
  type QuoteLineEntry,
} from '../lib/quoteLineEntries';
import { extractQuotePurchaseLines } from '../lib/quotePurchaseLines';
import {
  billingQuotePriceDraftFromSettings,
  billingQuotePricesChanged,
  billingQuotePricesFromDraft,
  type BillingQuotePriceDraft,
} from '../lib/billingQuotePriceDraft';
import { mergeActualPurchaseFromWorkReportLogs } from '../lib/quoteRequestActualPurchaseSync';
import { compareQuoteCategories } from '../lib/quoteCategoryComparison';
import { buildQuoteOutcomeSummary } from '../lib/quoteOutcomeSummary';
import QuoteOutcomeSummaryView from './QuoteOutcomeSummaryView';
import {
  collectWorkReportCategoryEntries,
  quoteCategoryLabel,
} from '../lib/workReportEntryCategories';
import { formatEuro, type BillableCalculation } from '../lib/workReportBilling';
import {
  collectExtraBillingMarginImpactLines,
  extraBillingCommissionContextFromMargin,
  extraBillingCommissionNote,
  extraBillingMarginImpactStatusLabel,
  formatExtraBillingMarginImpactCell,
} from '../lib/dailyLogCustomerExtraBilling';
import type { WorkReportDailyLog } from '../types';
import { supabase } from '../lib/supabase';

type Props = {
  /** Hintakenttien tallennus (tarjousta ei kohdistettu). */
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
  /** Hinnat tallennettu → sivu päivittää billing_quoten ja laskelmat (kate, provisio, partner_total). */
  onSaved?: (settings: BillingQuoteSettings) => void | Promise<void>;
  /** "Avaa tarjous · Vaihda tarjous · Poista kohdistus" tarjouksen nimen perään. */
  quoteLinkActions?: ReactNode;
  /** "Kirjaa toteutunut" tarjouspyynnön riviltä → avaa esitäytetyn työkirjauksen. */
  onRecordQuoteLine?: (line: QuoteLineEntry) => void;
  /** Avaa LAITE-lomakkeen (esitäytetty tarjouspyynnöstä tai kirjattu laite). */
  onOpenDevice?: () => void;
};

function formatQty(value: number | null, unit: string | null): string {
  if (value == null || !(value > 0)) return '';
  const qty = value.toLocaleString('fi-FI', { maximumFractionDigits: 2 });
  return unit ? `${qty} ${unit}` : qty;
}

const RECORD_LABELS: Record<Exclude<QuoteLineEntry['action'], 'device'>, string> = {
  labor: 'Kirjaa tunnit',
  expense: 'Kirjaa toteutunut',
  trip: 'Kirjaa ajo',
};

export default function WorkReportBillingQuotePanel({
  workReportId,
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
  onSaved,
  quoteLinkActions = null,
  onRecordQuoteLine,
  onOpenDevice,
}: Props) {
  const [settings, setSettings] = useState<BillingQuoteSettings>(() =>
    parseBillingQuoteSettings(initialSettings),
  );
  const [quoteData, setQuoteData] = useState<unknown>(null);
  /** Tarjoushinta / asiakashinta -luonnos; laskelma päivittyy vasta tallennuksen jälkeen. */
  const [priceDraft, setPriceDraft] = useState<BillingQuotePriceDraft>(() =>
    billingQuotePriceDraftFromSettings(parseBillingQuoteSettings(initialSettings)),
  );
  const [priceBusy, setPriceBusy] = useState(false);
  const [priceStatus, setPriceStatus] = useState<{ kind: 'saved' | 'error'; message: string } | null>(
    null,
  );

  useEffect(() => {
    const parsed = parseBillingQuoteSettings(initialSettings);
    setSettings(parsed);
    setPriceDraft(billingQuotePriceDraftFromSettings(parsed));
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
  const quoteLineGroups = useMemo(() => quoteLinesByCategory(quoteData), [quoteData]);
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


  const outcomeSummary = useMemo(
    () =>
      buildQuoteOutcomeSummary({
        partnerMargin: showPartnerMargin ? partnerMargin : null,
        comparison: categoryComparison,
        quoteSaleNet: effectiveSettings.quote_sale_net,
        formatEuro,
      }),
    [showPartnerMargin, partnerMargin, categoryComparison, effectiveSettings.quote_sale_net],
  );

  if (!billingQuoteHasData(settings)) return null;

  const quoteIsLinked = !!settings.quote_request_id;

  const customerTotalLabel = quoteHasVat(settings.quote_vat_rate)
    ? 'Asiakkaalta laskutettava (sis. alv)'
    : 'Asiakkaalta laskutettava (alv 0 %)';

  const quotePurchaseTotal = resolveQuotePurchaseTotal(effectiveSettings);
  const actualPurchaseTotal = resolveActualPurchaseTotal(effectiveSettings);
  const displayCustomerPrice =
    effectiveSettings.customer_invoice_total ?? effectiveSettings.quote_sale_net ?? null;
  const showSeparateCustomerTotal =
    quoteHasVat(effectiveSettings.quote_vat_rate)
    || effectiveSettings.customer_mode === 'quote_plus_extras'
    || (
      effectiveSettings.customer_invoice_total != null
      && effectiveSettings.quote_sale_net != null
      && Math.abs(effectiveSettings.customer_invoice_total - effectiveSettings.quote_sale_net) > 0.01
    );

  const priceParse = billingQuotePricesFromDraft(priceDraft, {
    separateCustomerTotal: showSeparateCustomerTotal,
  });
  const savedPriceDraft = billingQuotePriceDraftFromSettings(settings);
  const priceDirty =
    priceDraft.saleNet.trim() !== savedPriceDraft.saleNet
    || (showSeparateCustomerTotal && priceDraft.customerTotal.trim() !== savedPriceDraft.customerTotal);

  async function savePrices() {
    if (priceBusy) return;
    if ('error' in priceParse) {
      setPriceStatus({ kind: 'error', message: priceParse.error });
      return;
    }
    if (!billingQuotePricesChanged(priceParse.value, settings)) {
      setPriceDraft(savedPriceDraft);
      return;
    }
    setPriceBusy(true);
    setPriceStatus(null);
    try {
      const next = await saveBillingQuotePrices(supabase, workReportId, priceParse.value);
      await onSaved?.(next);
      setPriceStatus({ kind: 'saved', message: 'Tallennettu' });
    } catch (err) {
      setPriceStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Tallennus epäonnistui',
      });
    } finally {
      setPriceBusy(false);
    }
  }

  function updatePriceDraft(patch: Partial<BillingQuotePriceDraft>) {
    setPriceDraft((prev) => ({ ...prev, ...patch }));
    setPriceStatus(null);
  }

  function renderCategoryEntries() {
    if (categoryEntries.length === 0) return null;
    return (
      <details className="billing-purchase-lines-details">
        <summary>Työraportin merkinnät kategorioittain ({categoryEntries.length})</summary>
        <div className="table-wrap">
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
        </div>
      </details>
    );
  }

  const extrasCommissionContext = extraBillingCommissionContextFromMargin(partnerMargin);
  const deviceLines: BillingQuotePurchaseLine[] = (effectiveSettings.purchase_lines ?? []).filter(
    (line) => line.source === 'device',
  );
  // Rivilistan "Kirjaa / oikaise" avaa LAITE-lomakkeen (vertailutaulukossa ei omaa linkkiä).
  const canCorrectDevice = quoteIsLinked && !readOnly && deviceLines.length > 0 && !!onOpenDevice;

  function renderQuoteLines() {
    if (!quoteIsLinked || quoteLineGroups.length === 0) return null;
    return (
      <details className="billing-purchase-lines-details quote-line-entries">
        <summary>Tarjouspyynnön rivit – mihin toteutunut kirjataan</summary>
        <p className="muted quote-line-entries-intro">
          Samat ryhmät kuin yllä olevassa vertailussa.
          {onRecordQuoteLine ? ' Kirjaa-painike avaa uuden työkirjauksen valmiiksi oikeaan kohtaan.' : ''}
        </p>
        {quoteLineGroups.map((group) => {
          const showAmounts = showQuoteLineAmounts(group);
          return (
            <div className="quote-line-entries-group" key={group.category}>
              <span className={`quote-category-badge quote-category-badge-${group.category}`}>
                {group.label}
              </span>
              <ul className="quote-line-entries-list">
                {group.lines.map((line) => {
                  const meta = [
                    formatQty(line.qty, line.unit),
                    showAmounts && line.quoteNet != null ? formatEuro(line.quoteNet) : '',
                  ].filter(Boolean).join(' · ');
                  return (
                    <li key={line.id}>
                      <div className="quote-line-entries-text">
                        <span className="quote-line-entries-label">{line.label}</span>
                        {meta ? <span className="muted"> · {meta}</span> : null}
                        {line.hint ? <span className="muted quote-line-entries-hint">{line.hint}</span> : null}
                      </div>
                      {line.action === 'device' ? (
                        canCorrectDevice ? (
                          <button type="button" className="btn-link" onClick={onOpenDevice}>
                            Kirjaa / oikaise
                          </button>
                        ) : null
                      ) : onRecordQuoteLine ? (
                        <button type="button" className="btn-link" onClick={() => onRecordQuoteLine(line)}>
                          {RECORD_LABELS[line.action]}
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </details>
    );
  }

  function renderExtrasMarginLines() {
    if (!showPartnerMargin || !partnerMargin || extrasMarginLines.length === 0) return null;
    return (
      <div className="table-wrap">
        <table className="billing-table billing-margin-table">
          <thead>
            <tr>
              <th>Lisälaskutus</th>
              <th className="num">Asiakas</th>
              <th className="num">Kumppani</th>
              <th className="num">Hankinta</th>
              <th className="num">Kate</th>
            </tr>
            {extraBillingCommissionNote(extrasCommissionContext) ? (
              <tr>
                <th colSpan={5} className="muted billing-margin-impact-note">
                  Odottavan rivin kate = puhdas kate, jos lisälaskutuslupa saadaan.{' '}
                  {extraBillingCommissionNote(extrasCommissionContext)}
                </th>
              </tr>
            ) : null}
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
                      extrasCommissionContext,
                    );
                    return <strong>{marginCell.approved || marginCell.withPermission}</strong>;
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="billing-margin-panel">
      <div className="billing-margin-body">
          {!quoteIsLinked && !readOnly ? (
            <div
              className="form-grid billing-margin-form"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
                  e.preventDefault();
                  void savePrices();
                }
              }}
            >
              <label className="form-field">
                <span>
                  {showSeparateCustomerTotal
                    ? 'Tarjoushinta (alv 0 %)'
                    : 'Kiinteä tarjoushinta asiakkaalle (alv 0 %)'}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={priceDraft.saleNet}
                  disabled={priceBusy}
                  onChange={(e) => updatePriceDraft({ saleNet: e.target.value })}
                />
              </label>

              {showSeparateCustomerTotal ? (
                <label className="form-field">
                  <span>{customerTotalLabel}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={priceDraft.customerTotal}
                    disabled={priceBusy}
                    onChange={(e) => updatePriceDraft({ customerTotal: e.target.value })}
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

              {priceDirty || priceBusy || priceStatus ? (
                <div className="span-2 billing-margin-save-row">
                  {priceDirty || priceBusy ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={priceBusy}
                        onClick={() => void savePrices()}
                      >
                        {priceBusy ? 'Tallennetaan…' : 'Tallenna'}
                      </button>
                      {!priceBusy ? (
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() => {
                            setPriceDraft(savedPriceDraft);
                            setPriceStatus(null);
                          }}
                        >
                          Peru
                        </button>
                      ) : null}
                    </>
                  ) : null}
                  {priceStatus ? (
                    <span
                      className={priceStatus.kind === 'error' ? 'error' : 'muted billing-margin-saved'}
                      role={priceStatus.kind === 'error' ? 'alert' : 'status'}
                    >
                      {priceStatus.kind === 'saved' ? `✓ ${priceStatus.message}` : priceStatus.message}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {!quoteIsLinked && readOnly ? (
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
              {settings.actual_purchase_net != null
              && Math.abs(actualPurchaseTotal - quotePurchaseTotal) > 0.005 ? (
                <>
                  <dt>Todellinen hankinta yhteensä (alv 0 %)</dt>
                  <dd>{formatEuro(actualPurchaseTotal)}</dd>
                </>
              ) : null}
            </dl>
          ) : null}

          {outcomeSummary ? (
            <QuoteOutcomeSummaryView
              summary={outcomeSummary}
              quoteTitle={quoteIsLinked ? settings.quote_title ?? 'Linkitetty tarjous' : null}
              quoteTitleActions={quoteIsLinked ? quoteLinkActions : null}
              commissionExceedsGross={!!partnerMargin?.commissionExceedsGross}
            />
          ) : quoteIsLinked ? (
            <p className="billing-quote-linked-summary">
              Tarjous: <strong>{settings.quote_title ?? 'Linkitetty tarjous'}</strong>
              {displayCustomerPrice != null ? <> · kiinteä tarjoushinta {formatEuro(displayCustomerPrice)}</> : null}
              {quoteLinkActions}
            </p>
          ) : null}

          {renderQuoteLines()}

          {customerBillableGrandTotal
          && customerBillableGrandTotal.extrasTotal > 0.005
          && !outcomeSummary?.hasMargin ? (
            <p className="billing-quote-linked-summary">
              Asiakkaalta laskutettava yhteensä{' '}
              <strong>{formatEuro(customerBillableGrandTotal.grandTotal)}</strong>
            </p>
          ) : null}

          {renderExtrasMarginLines()}

          {renderCategoryEntries()}
      </div>
    </div>
  );
}
