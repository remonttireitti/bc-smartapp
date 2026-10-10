import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  billingQuoteHasData,
  computePartnerNetMargin,
  normalizeBillingQuoteSettings,
  parseBillingQuoteSettings,
  saveBillingQuoteDeviceSeller,
  saveContractorInvoiceStatus,
  saveBillingQuotePrices,
  quoteHasVat,
  resolveActualPurchaseTotal,
  resolveCustomerBillableGrandTotal,
  resolveQuotePurchaseTotal,
  type BillingQuoteSettings,
} from '../lib/workReportBillingQuote';
import {
  collectUnpricedQuoteRows,
  countUnpricedExpenseLines,
  unpricedQuoteRowTotals,
  type UnpricedQuoteRow,
} from '../lib/quoteSeededRows';
import { extractQuotePurchaseLines } from '../lib/quotePurchaseLines';
import {
  billingQuotePriceDraftFromSettings,
  billingQuotePricesChanged,
  billingQuotePricesFromDraft,
  formatMoneyInput,
  parseMoney,
  type BillingQuotePriceDraft,
} from '../lib/billingQuotePriceDraft';
import { mergeActualPurchaseFromWorkReportLogs } from '../lib/quoteRequestActualPurchaseSync';
import { compareQuoteCategories } from '../lib/quoteCategoryComparison';
import { buildQuoteOutcomeSummary } from '../lib/quoteOutcomeSummary';
import QuoteOutcomeSummaryView from './QuoteOutcomeSummaryView';
import UnpricedQuoteRowsTable from './UnpricedQuoteRowsTable';
import {
  collectWorkReportCategoryEntries,
  quoteCategoryLabel,
} from '../lib/workReportEntryCategories';
import {
  formatEuro,
  restoreContractorCostLines,
  type BillableCalculation,
} from '../lib/workReportBilling';
import {
  collectExtraBillingMarginImpactLines,
  extraBillingMarginImpactStatusLabel,
  resolveExtraWorkCustomerRates,
} from '../lib/dailyLogCustomerExtraBilling';
import { quoteDeviceSaleNet, resolveDeviceSellerSaleNet } from '../lib/workReportDeviceSeller';
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
  /** Hinnattoman tarjousrivin toteutunut hinta (yhteensä) → päiväkirjan kulurivi. Palauttaa virheen tai null. */
  onExpenseLinePrice?: (row: UnpricedQuoteRow, totalNet: number) => Promise<string | null>;
  /** "Avaa tarjous · Vaihda tarjous · Poista kohdistus" tarjouksen nimen perään. */
  quoteLinkActions?: ReactNode;
  /** Laitemyyjä-ketjun osapuolet: tilaaja (omistaja) ja raportin laatija (asentaja). */
  ownerCompanyName?: string | null;
  createdByCompanyId?: string | null;
  createdByCompanyName?: string | null;
  /** Raportin kumppanilaskun tila (asentajan lasku). */
  partnerInvoiceState?: { state: 'open' | 'partial' | 'billed'; billed: number; open: number } | null;
};

type ContractorOption = { id: string; name: string };

function extrasLineCoveredByParties(line: {
  status: string;
  partnerNet: number;
  piikkiCostNet: number;
}): boolean {
  return line.status !== 'pending' && !(line.partnerNet > 0.005) && !(line.piikkiCostNet > 0.005);
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
  onExpenseLinePrice,
  quoteLinkActions = null,
  ownerCompanyName = null,
  createdByCompanyId = null,
  createdByCompanyName = null,
  partnerInvoiceState = null,
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

  const deviceSellerEditable =
    showPartnerMargin
    && !readOnly
    && (settings.customer_mode === 'quote_fixed' || settings.customer_mode === 'quote_plus_extras');
  const quoteDeviceSale = useMemo(() => quoteDeviceSaleNet(quoteData), [quoteData]);
  const [deviceDraft, setDeviceDraft] = useState<{
    sale: string;
    contractorId: string;
    installerBillsSupplies: boolean;
  } | null>(null);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [contractorOptions, setContractorOptions] = useState<ContractorOption[]>([]);
  const [deviceSettingsOpen, setDeviceSettingsOpen] = useState(false);
  const [contractorInvoiceBusy, setContractorInvoiceBusy] = useState(false);

  useEffect(() => {
    if (!deviceSellerEditable || !createdByCompanyId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('company_partnerships')
        .select('company_a_id, company_b_id')
        .eq('status', 'active')
        .or(`company_a_id.eq.${createdByCompanyId},company_b_id.eq.${createdByCompanyId}`);
      const ids = Array.from(
        new Set(
          ((data ?? []) as Array<{ company_a_id: string; company_b_id: string }>)
            .map((row) => (row.company_a_id === createdByCompanyId ? row.company_b_id : row.company_a_id))
            .filter((id) => id && id !== _ownerCompanyId && id !== createdByCompanyId),
        ),
      );
      if (ids.length === 0) {
        if (!cancelled) setContractorOptions([]);
        return;
      }
      const { data: companies } = await supabase.from('companies').select('id, name').in('id', ids);
      if (cancelled) return;
      setContractorOptions(
        ((companies ?? []) as ContractorOption[])
          .filter((row) => row.name)
          .sort((a, b) => a.name.localeCompare(b.name, 'fi')),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [deviceSellerEditable, createdByCompanyId, _ownerCompanyId]);

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
            quoteData,
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
      quoteData,
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
  /** Kulurivit ilman hintaa (esim. tarjouksesta luodut 0 €-rivit) — tuomio ei ole vielä luotettava. */
  const unpricedRowCount = useMemo(() => countUnpricedExpenseLines(dailyLogs), [dailyLogs]);
  const categoryEntries = useMemo(
    () =>
      collectWorkReportCategoryEntries(
        dailyLogs,
        partnerCalculation ? restoreContractorCostLines(partnerCalculation) : partnerCalculation,
      ),
    [dailyLogs, partnerCalculation],
  );
  const extrasMarginLines = useMemo(
    () =>
      dailyLogs.length && partnerCalculation
        ? collectExtraBillingMarginImpactLines(
            dailyLogs,
            partnerCalculation.ratesUsed,
            resolveExtraWorkCustomerRates(customerCalculation?.ratesUsed, quoteData),
          )
        : [],
    [dailyLogs, partnerCalculation, customerCalculation?.ratesUsed, quoteData],
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


  // Laskutuslaskelma vain, kun ketju on tallennettu (Laskutusketjun asetukset): ei automaattista esikatselua.
  const deviceSellerSaleNet = resolveDeviceSellerSaleNet(effectiveSettings);
  const unpricedQuoteRows = useMemo(
    () => (settings.quote_request_id ? collectUnpricedQuoteRows(dailyLogs, settings) : []),
    [dailyLogs, settings],
  );
  const provisionalCosts = useMemo(() => unpricedQuoteRowTotals(unpricedQuoteRows), [unpricedQuoteRows]);
  const outcomeSummary = useMemo(
    () =>
      buildQuoteOutcomeSummary({
        partnerMargin: showPartnerMargin ? partnerMargin : null,
        comparison: categoryComparison,
        quoteSaleNet: effectiveSettings.quote_sale_net,
        formatEuro,
        deviceSeller:
          deviceSellerSaleNet != null
            ? {
                deviceSaleNet: deviceSellerSaleNet,
                ownerName: ownerCompanyName ?? '',
                contractorName: effectiveSettings.contractor_company_name ?? null,
                installerName: createdByCompanyName ?? '',
                installerBillsSupplies: effectiveSettings.installer_bills_supplies === true,
              }
            : undefined,
        provisionalCosts,
      }),
    [
      showPartnerMargin,
      partnerMargin,
      categoryComparison,
      effectiveSettings.quote_sale_net,
      effectiveSettings.contractor_company_name,
      effectiveSettings.installer_bills_supplies,
      deviceSellerSaleNet,
      provisionalCosts,
      ownerCompanyName,
      createdByCompanyName,
    ],
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

  const savedDeviceDraft = {
    sale: settings.device_sale_net != null
      ? formatMoneyInput(settings.device_sale_net)
      : formatMoneyInput(quoteDeviceSale),
    contractorId: settings.contractor_company_id ?? '',
    installerBillsSupplies: settings.installer_bills_supplies === true,
  };
  const activeDeviceDraft = deviceDraft ?? savedDeviceDraft;
  const deviceDirty =
    settings.device_sale_net == null
    || activeDeviceDraft.sale.trim() !== savedDeviceDraft.sale
    || activeDeviceDraft.contractorId !== savedDeviceDraft.contractorId
    || activeDeviceDraft.installerBillsSupplies !== savedDeviceDraft.installerBillsSupplies;

  async function saveDeviceSeller(clear = false) {
    if (deviceBusy) return;
    const sale = clear ? null : parseMoney(activeDeviceDraft.sale);
    if (!clear && activeDeviceDraft.sale.trim() && (sale == null || sale < 0)) {
      setDeviceError('Tarkista laitteen myyntihinta.');
      return;
    }
    const contractorId = clear ? '' : activeDeviceDraft.contractorId;
    const contractorName =
      contractorOptions.find((row) => row.id === contractorId)?.name
      ?? (contractorId && contractorId === settings.contractor_company_id
        ? settings.contractor_company_name
        : null);
    setDeviceBusy(true);
    setDeviceError(null);
    try {
      const next = await saveBillingQuoteDeviceSeller(supabase, workReportId, {
        deviceSaleNet: sale,
        contractorCompanyId: contractorId || null,
        contractorCompanyName: contractorId ? contractorName ?? null : null,
        installerBillsSupplies: !clear && activeDeviceDraft.installerBillsSupplies,
      });
      setDeviceDraft(null);
      setDeviceSettingsOpen(false);
      await onSaved?.(next);
    } catch (err) {
      setDeviceError(err instanceof Error ? err.message : 'Tallennus epäonnistui');
    } finally {
      setDeviceBusy(false);
    }
  }

  async function setContractorInvoiceBilled(amount: number | null) {
    if (contractorInvoiceBusy) return;
    setContractorInvoiceBusy(true);
    setDeviceError(null);
    try {
      const next = await saveContractorInvoiceStatus(supabase, workReportId, amount);
      await onSaved?.(next);
    } catch (err) {
      setDeviceError(err instanceof Error ? err.message : 'Tallennus epäonnistui');
    } finally {
      setContractorInvoiceBusy(false);
    }
  }

  function invoiceStateLabel(state: 'open' | 'partial' | 'billed', billed: number): string {
    if (state === 'billed') return `Laskutettu ${formatEuro(billed)}`;
    if (state === 'partial') return `Osittain laskutettu ${formatEuro(billed)}`;
    return 'Laskuluonnos · laskuttamatta';
  }

  /** Laskun tila laskutuslaskelman riveillä (vain tallennettu ketju). */
  function partyStatusNodes(): Partial<Record<string, ReactNode>> | undefined {
    if (!outcomeSummary?.parties) return undefined;
    const nodes: Partial<Record<string, ReactNode>> = {};
    const partnerLabel = partnerInvoiceState
      ? invoiceStateLabel(partnerInvoiceState.state, partnerInvoiceState.billed)
      : null;
    const contractorInvoice = partnerCalculation?.contractorInvoice ?? null;
    if (contractorInvoice) {
      // Urakoitsija välissä: asentajan lasku = raportin kumppanilasku, urakoitsijan lasku erillinen.
      if (partnerLabel) nodes.installerInvoice = partnerLabel;
      const paid = settings.contractor_invoice?.status === 'paid';
      const billedAmount = settings.contractor_invoice?.billed_amount ?? contractorInvoice.amount;
      nodes.contractorInvoice = (
        <>
          {paid ? `Laskutettu ${formatEuro(billedAmount)}` : 'Laskuluonnos · laskuttamatta'}
          {!readOnly ? (
            <button
              type="button"
              className="btn-link"
              disabled={contractorInvoiceBusy}
              onClick={() => void setContractorInvoiceBilled(paid ? null : contractorInvoice.amount)}
            >
              {paid ? 'Peru' : 'Merkitse laskutetuksi'}
            </button>
          ) : null}
        </>
      );
    } else if (partnerLabel) {
      nodes.contractorInvoice = partnerLabel;
    }
    return nodes;
  }

  function renderDeviceSellerEditor() {
    if (!deviceSellerEditable || !(Number(settings.quote_sale_net) > 0)) return null;
    if (
      settings.device_sale_net == null
      && quoteDeviceSale == null
      && deviceDraft == null
      && !deviceSettingsOpen
    ) {
      return (
        <p className="muted billing-device-seller-toggle">
          <button type="button" className="btn-link" onClick={() => setDeviceSettingsOpen(true)}>
            Tilaaja myy laitteen…
          </button>
        </p>
      );
    }
    const contractorChoices = [...contractorOptions];
    if (
      settings.contractor_company_id
      && settings.contractor_company_name
      && !contractorChoices.some((row) => row.id === settings.contractor_company_id)
    ) {
      contractorChoices.push({ id: settings.contractor_company_id, name: settings.contractor_company_name });
    }
    return (
      <details
        className="billing-device-seller"
        open={deviceSettingsOpen}
        onToggle={(e) => setDeviceSettingsOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary>
          Laskutusketjun asetukset
          {settings.device_sale_net != null ? ` · laite ${formatEuro(settings.device_sale_net)}` : ''}
          {settings.device_sale_net != null && settings.contractor_company_name
            ? ` · urakoitsija ${settings.contractor_company_name}`
            : ''}
        </summary>
        <div className="form-grid billing-margin-form">
          <label className="form-field">
            <span>Laitteen myyntihinta (alv 0 %)</span>
            <input
              type="text"
              inputMode="decimal"
              value={activeDeviceDraft.sale}
              placeholder={quoteDeviceSale != null ? formatMoneyInput(quoteDeviceSale) : undefined}
              disabled={deviceBusy}
              onChange={(e) => {
                setDeviceDraft({ ...activeDeviceDraft, sale: e.target.value });
                setDeviceError(null);
              }}
            />
          </label>
          <label className="form-field">
            <span>Urakoitsija</span>
            <select
              value={activeDeviceDraft.contractorId}
              disabled={deviceBusy}
              onChange={(e) => setDeviceDraft({ ...activeDeviceDraft, contractorId: e.target.value })}
            >
              <option value="">— ei erillistä —</option>
              {contractorChoices.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          {activeDeviceDraft.contractorId ? (
            <label className="compact-option span-2">
              <input
                type="checkbox"
                checked={activeDeviceDraft.installerBillsSupplies}
                disabled={deviceBusy}
                onChange={(e) =>
                  setDeviceDraft({ ...activeDeviceDraft, installerBillsSupplies: e.target.checked })
                }
              />
              Asentaja laskuttaa tarvikkeet
            </label>
          ) : null}
          <div className="span-2 billing-margin-save-row">
            {deviceDirty ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={deviceBusy}
                onClick={() => void saveDeviceSeller()}
              >
                {deviceBusy ? 'Tallennetaan…' : 'Tallenna laskutukseen'}
              </button>
            ) : null}
            {settings.device_sale_net != null && !deviceBusy ? (
              <button type="button" className="btn-link" onClick={() => void saveDeviceSeller(true)}>
                Poista
              </button>
            ) : null}
            {deviceError ? (
              <span className="error" role="alert">
                {deviceError}
              </span>
            ) : null}
          </div>
        </div>
      </details>
    );
  }

  function renderUnpricedQuoteRows() {
    return (
      <UnpricedQuoteRowsTable
        rows={unpricedQuoteRows}
        readOnly={readOnly}
        onPrice={onExpenseLinePrice ? (row, total) => onExpenseLinePrice(row, total) : undefined}
      />
    );
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

  function renderExtrasMarginLines() {
    if (!showPartnerMargin || !partnerMargin || extrasMarginLines.length === 0) return null;
    // Laskutuslaskelmassa hyväksytty, tilaajalle jäävä lisätyö näkyy jo tilaajan rivillä.
    if (outcomeSummary?.parties && extrasMarginLines.every(extrasLineCoveredByParties)) return null;
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
                <td className="num">{formatEuro(line.customerNet)}</td>
                <td className="num">
                  {line.partnerNet > 0 ? `− ${formatEuro(line.partnerNet)}` : '—'}
                </td>
                <td className="num">
                  {line.piikkiCostNet > 0 ? `− ${formatEuro(line.piikkiCostNet)}` : '—'}
                </td>
                <td className="num">
                  <strong>{formatEuro(line.marginIfApprovedNet)}</strong>
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
              unpricedRowCount={quoteIsLinked ? unpricedRowCount : 0}
              partyStatus={partyStatusNodes()}
            />
          ) : quoteIsLinked ? (
            <p className="billing-quote-linked-summary">
              Tarjous: <strong>{settings.quote_title ?? 'Linkitetty tarjous'}</strong>
              {displayCustomerPrice != null ? <> · kiinteä tarjoushinta {formatEuro(displayCustomerPrice)}</> : null}
              {quoteLinkActions}
            </p>
          ) : null}


          {customerBillableGrandTotal
          && customerBillableGrandTotal.extrasTotal > 0.005
          && !outcomeSummary?.hasMargin ? (
            <p className="billing-quote-linked-summary">
              Asiakkaalta laskutettava yhteensä{' '}
              <strong>{formatEuro(customerBillableGrandTotal.grandTotal)}</strong>
            </p>
          ) : null}

          {renderDeviceSellerEditor()}

          {renderExtrasMarginLines()}

          {renderUnpricedQuoteRows()}

          {renderCategoryEntries()}
      </div>
    </div>
  );
}
