import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  billingQuoteHasData,
  computePartnerNetMargin,
  DEFAULT_PARTNER_COMMISSION_PERCENT,
  formatCommissionPercent,
  normalizeBillingQuoteSettings,
  parseBillingQuoteSettings,
  quoteHasVat,
  resolveActualPurchaseTotal,
  resolveCustomerBillableGrandTotal,
  resolvePartnerCommissionAmount,
  resolvePartnerCommissionPercent,
  resolveQuotePurchaseTotal,
  saveBillingQuoteCommission,
  saveBillingQuoteDeviceActuals,
  type BillingQuotePurchaseLine,
  type BillingQuoteSettings,
  type DeviceActualCorrection,
} from '../lib/workReportBillingQuote';
import {
  quoteLinesByCategory,
  showQuoteLineAmounts,
  type QuoteLineEntry,
} from '../lib/quoteLineEntries';
import { extractQuotePurchaseLines } from '../lib/quotePurchaseLines';
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
  /** "Avaa tarjous · Vaihda tarjous · Poista kohdistus" tarjouksen nimen perään. */
  quoteLinkActions?: ReactNode;
  /** "Kirjaa toteutunut" tarjouspyynnön riviltä → avaa esitäytetyn työkirjauksen. */
  onRecordQuoteLine?: (line: QuoteLineEntry) => void;
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
}: Props) {
  const [settings, setSettings] = useState<BillingQuoteSettings>(() =>
    parseBillingQuoteSettings(initialSettings),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Syöttökenttien luonnokset; null = näytä laskettu arvo. */
  const [commissionPercentDraft, setCommissionPercentDraft] = useState<string | null>(null);
  const [commissionAmountDraft, setCommissionAmountDraft] = useState<string | null>(null);
  const [commissionEditOpen, setCommissionEditOpen] = useState(false);
  const [quoteData, setQuoteData] = useState<unknown>(null);
  /** Laitteen oikaisun luonnokset rivin id:n mukaan. */
  const [deviceDrafts, setDeviceDrafts] = useState<Record<string, string>>({});
  const [deviceEditOpen, setDeviceEditOpen] = useState(false);

  useEffect(() => {
    setSettings(parseBillingQuoteSettings(initialSettings));
    setCommissionPercentDraft(null);
    setCommissionAmountDraft(null);
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
  const outcomeHasDeviceRow = !!outcomeSummary?.rows.some((row) => row.key === 'device');

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
  const initialParsed = parseBillingQuoteSettings(initialSettings);
  const commissionMode: 'amount' | 'percent' =
    resolvePartnerCommissionAmount(settings) != null ? 'amount' : 'percent';
  const commissionDirty =
    resolvePartnerCommissionAmount(settings) !== resolvePartnerCommissionAmount(initialParsed)
    || (commissionMode === 'percent'
      && resolvePartnerCommissionPercent(settings) !== resolvePartnerCommissionPercent(initialParsed));

  async function saveCommission() {
    setBusy(true);
    setError(null);
    try {
      const amount = resolvePartnerCommissionAmount(settings);
      const next = await saveBillingQuoteCommission(supabase, workReportId, {
        percent: resolvePartnerCommissionPercent(settings),
        amount,
      });
      setCommissionPercentDraft(null);
      setCommissionAmountDraft(null);
      onSaved?.(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Provision tallennus epäonnistui');
    } finally {
      setBusy(false);
    }
  }

  function renderCommissionEditor() {
    if (!partnerMargin || readOnly) return null;
    const dailyLogCommission = partnerMargin.commissionSource === 'daily_log';
    const percentValue =
      commissionPercentDraft
      ?? formatCommissionPercent(
        commissionMode === 'amount'
          ? partnerMargin.commissionPercent
          : resolvePartnerCommissionPercent(settings),
      );
    const amountValue =
      commissionAmountDraft
      ?? (commissionMode === 'amount'
        ? moneyInputValue(resolvePartnerCommissionAmount(settings)).replace('.', ',')
        : partnerMargin.commissionSource === 'percent'
          ? moneyInputValue(partnerMargin.commissionNet).replace('.', ',')
          : '');
    const summaryText = dailyLogCommission
      ? `Tarjouksen provisio ${formatCommissionPercent(resolvePartnerCommissionPercent(settings))} % ei käytössä`
      : 'Muokkaa provisiota';
    return (
      <details
        className={`quote-outcome-commission-edit${dailyLogCommission ? ' is-inactive' : ''}`}
        open={commissionEditOpen || commissionDirty}
        onToggle={(e) => setCommissionEditOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary>{summaryText}</summary>
        {dailyLogCommission ? (
          <p className="muted quote-outcome-commission-note">
            Provisio tulee päiväkirjan Myyntiprovisio-merkinnöistä — alla olevat % / € eivät vaikuta,
            ennen kuin merkinnät poistetaan.
          </p>
        ) : null}
        <div className="quote-outcome-commission-fields">
          <label className="form-field">
            <span>Provisio %</span>
            <input
              type="text"
              inputMode="decimal"
              value={percentValue}
              disabled={busy || dailyLogCommission}
              onChange={(e) => {
                const raw = e.target.value;
                setCommissionPercentDraft(raw);
                setCommissionAmountDraft(null);
                const parsed = parseMoneyInput(raw);
                setSettings((prev) => ({
                  ...prev,
                  partner_commission_percent: parsed,
                  partner_commission_amount: null,
                }));
              }}
            />
          </label>
          <label className="form-field">
            <span>tai Provisio € (alv 0 %)</span>
            <input
              type="text"
              inputMode="decimal"
              value={amountValue}
              disabled={busy || dailyLogCommission}
              placeholder="sovittu summa"
              onChange={(e) => {
                const raw = e.target.value;
                setCommissionAmountDraft(raw);
                setCommissionPercentDraft(null);
                const parsed = parseMoneyInput(raw);
                setSettings((prev) => ({
                  ...prev,
                  partner_commission_amount: parsed,
                }));
              }}
            />
          </label>
          {commissionDirty ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() => void saveCommission()}
            >
              {busy ? 'Tallennetaan…' : 'Tallenna provisio'}
            </button>
          ) : null}
        </div>
        {!dailyLogCommission ? (
          <p className="muted quote-outcome-commission-note">
            {commissionMode === 'percent'
              ? `Käytössä: prosentti katteesta (oletus ${DEFAULT_PARTNER_COMMISSION_PERCENT} %).`
              : 'Käytössä: sovittu summa (% johdetaan katteesta).'}
          </p>
        ) : null}
      </details>
    );
  }

  const deviceLines: BillingQuotePurchaseLine[] = (effectiveSettings.purchase_lines ?? []).filter(
    (line) => line.source === 'device',
  );
  const deviceCorrected = deviceLines.some((line) => line.actual_corrected);
  const canCorrectDevice = quoteIsLinked && !readOnly && deviceLines.length > 0;

  function deviceDraftValue(line: BillingQuotePurchaseLine): string {
    return deviceDrafts[line.id] ?? moneyInputValue(line.actual_purchase_net).replace('.', ',');
  }

  function dirtyDeviceCorrections(): DeviceActualCorrection[] | null {
    const corrections: DeviceActualCorrection[] = [];
    for (const line of deviceLines) {
      const raw = deviceDrafts[line.id];
      if (raw == null) continue;
      const parsed = parseMoneyInput(raw);
      if (parsed == null || parsed < 0) return null;
      if (Math.abs(parsed - line.actual_purchase_net) < 0.005) continue;
      corrections.push({ line, actualNet: parsed });
    }
    return corrections;
  }

  async function saveDeviceActuals(corrections: DeviceActualCorrection[]) {
    if (corrections.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const next = await saveBillingQuoteDeviceActuals(
        supabase,
        workReportId,
        corrections,
        effectiveSettings.purchase_lines,
      );
      setDeviceDrafts({});
      setSettings(next);
      onSaved?.(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Laitteen hinnan tallennus epäonnistui');
    } finally {
      setBusy(false);
    }
  }

  function openDeviceEditor() {
    setDeviceEditOpen(true);
    window.requestAnimationFrame(() => {
      document
        .getElementById(`device-correction-${workReportId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function renderDeviceEditor() {
    if (!canCorrectDevice) return null;
    const hasDrafts = Object.keys(deviceDrafts).length > 0;
    const corrections = dirtyDeviceCorrections();
    const invalid = corrections == null;
    return (
      <details
        id={`device-correction-${workReportId}`}
        className="quote-outcome-commission-edit quote-outcome-device-edit"
        open={deviceEditOpen || hasDrafts}
        onToggle={(e) => setDeviceEditOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary>{deviceCorrected ? 'Laitteen hankinta oikaistu · muokkaa' : 'Oikaise laitteen hankinta'}</summary>
        <p className="muted quote-outcome-commission-note">
          Toteutunut on esitäytetty tarjouspyynnön hinnalla. Jos laite maksoi eri summan, kirjaa tähän
          todellinen hankintahinta (alv 0 %). Oikaisu säilyy, vaikka tarjous päivittyy tai kohdistetaan
          uudelleen.
        </p>
        {deviceLines.map((line) => (
          <div className="quote-outcome-commission-fields" key={line.id}>
            <label className="form-field quote-outcome-device-field">
              <span>
                {line.label} · tarjouspyyntö {formatEuro(line.quote_purchase_net)}
              </span>
              <input
                type="text"
                inputMode="decimal"
                aria-label={`${line.label}: toteutunut hankinta (alv 0 %)`}
                value={deviceDraftValue(line)}
                disabled={busy}
                onChange={(e) => {
                  const raw = e.target.value;
                  setDeviceDrafts((prev) => ({ ...prev, [line.id]: raw }));
                }}
              />
            </label>
            {line.actual_corrected ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={busy}
                onClick={() => void saveDeviceActuals([{ line, actualNet: null }])}
              >
                Palauta tarjouspyynnön hinta
              </button>
            ) : null}
          </div>
        ))}
        {invalid ? <p className="error quote-outcome-commission-note">Anna hinta numerona (esim. 1180,50).</p> : null}
        {hasDrafts ? (
          <div className="quote-outcome-commission-fields">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy || invalid || corrections.length === 0}
              onClick={() => corrections && void saveDeviceActuals(corrections)}
            >
              {busy ? 'Tallennetaan…' : 'Tallenna laitteen hinta'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() => setDeviceDrafts({})}
            >
              Peruuta
            </button>
          </div>
        ) : null}
      </details>
    );
  }

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
                          <button type="button" className="btn-link" onClick={openDeviceEditor}>
                            Oikaise
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
            <div className="form-grid billing-margin-form">
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
              commissionEditor={renderCommissionEditor()}
              commissionExceedsGross={!!partnerMargin?.commissionExceedsGross}
              deviceEditor={outcomeHasDeviceRow ? renderDeviceEditor() : null}
              deviceCorrected={deviceCorrected}
            />
          ) : quoteIsLinked ? (
            <p className="billing-quote-linked-summary">
              Tarjous: <strong>{settings.quote_title ?? 'Linkitetty tarjous'}</strong>
              {displayCustomerPrice != null ? <> · kiinteä tarjoushinta {formatEuro(displayCustomerPrice)}</> : null}
              {quoteLinkActions}
            </p>
          ) : null}

          {!outcomeHasDeviceRow ? renderDeviceEditor() : null}

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

          {!readOnly ? (
            <label className="form-field">
              <span>Huomio kumppanille</span>
              <input
                type="text"
                value={settings.notes ?? ''}
                disabled={busy}
                onChange={(e) => setSettings((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Esim. hankintakorjaus"
              />
            </label>
          ) : settings.notes?.trim() ? (
            <p className="billing-margin-formula">
              <strong>Huomio:</strong> {settings.notes.trim()}
            </p>
          ) : null}

          {error ? <p className="error">{error}</p> : null}
      </div>
    </div>
  );
}
