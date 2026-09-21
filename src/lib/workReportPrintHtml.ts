import type { BillableCalculation } from './workReportBilling';
import {
  APPROVED_EXTRA_BILLING_CUSTOMER_PRINT_LABEL,
  expenseApprovedExtraBillingCustomerPrintLabel,
  expenseCustomerPriceMissing,
  expenseIncludedInCustomerInvoice,
  expensePrintBillingNote,
  resolveExpenseCustomerUnitPrice,
  formatExpenseSupplyExtraBillingMarginNote,
  expensePurchaseLineTotal,
  expensePurchasePriceMissing,
  resolveExpensePurchaseUnitPrice,
  resolveLogExpenseExtraBillingFlags,
} from './workReportExpenseBilling';
import { computeBasicWorkReportNetMargin } from './workReportBasicNetMargin';
import {
  billableUsers,
  billableUserLines,
  hasIncludedBillableLines,
} from './workReportPrintBillingGuards';

/** Asiakas = vain työn kuvaus ilman hintoja. Sisäinen = kumppani- ja asiakaslaskutus mukana. */
export type WorkReportPrintMode = 'customer' | 'internal';
import { formatEuro } from './workReportBilling';
import { BILLABLE_RATES_SOURCE_LABELS } from './management';
import {
  collectExtraBillingMarginImpactLines,
  extraBillingMarginImpactStatusLabel,
  formatExtraBillingMarginImpactCell,
  hoursApprovedExtraBillingCustomerPrintLabel,
  hoursExtraBillingLabel,
  parseDailyLogCustomerExtraBilling,
} from './dailyLogCustomerExtraBilling';
import {
  billingQuoteHasData,
  computePartnerNetMargin,
  customerUsesQuoteBasedBilling,
  parseBillingQuoteSettings,
  quoteHasVat,
  resolveCustomerBillableGrandTotal,
  renderBillingQuotePurchaseLinesHtml,
  workReportHasLinkedQuoteRequest,
  type BillingQuoteSettings,
} from './workReportBillingQuote';
import {
  compareQuoteCategories,
  renderQuoteCategoryComparisonHtml,
} from './quoteCategoryComparison';
import {
  formatRefrigerantLineLabelForReport,
  refrigerantBillingReminder,
  refrigerantCustomerUnitPrice,
  refrigerantIncludedInCustomerBilling,
  refrigerantLineTotal,
} from './refrigerantInventory';
import { resolveTripKmCustomerPrintDescription } from './tripKmExpense';
import {
  DEFAULT_CUSTOMER_PRINT_QUANTITY_SETTINGS,
  type CustomerPrintQuantitySettings,
} from './workReportCustomerPrintSettings';
import {
  formatCustomerPrintExpenseQuantity,
  formatCustomerPrintHourSummary,
  formatCustomerPrintRefrigerantQuantity,
} from './workReportCustomerPrintQuantity';
import type { CompanySettings } from './management';
import {
  buildLampokatsastusWorkReportFooterHtml,
  buildLampokatsastusWorkReportHeaderHtml,
  isLampokatsastusCompanyName,
  lampokatsastusBrandingStyles,
} from './lampokatsastusBranding';
import {
  EXPENSE_TYPE_LABELS,
  HOUR_ENTRY_LABELS,
  WORK_STATUS_LABELS,
  expenseLineTotal,
  formatDate,
  formatDateTime,
  formatHourEntry,
  resolveWorkReportDisplayPeople,
  resolveWorkReportDescription,
  resolveWorkReportHeading,
  buildWorkReportPrintHeadline,
  resolveDailyLogAuthorLabel,
  resolveWorkReportLogPeriod,
  type WorkReport,
  type WorkReportDailyLog,
} from '../types';
import {
  formatWorkReportEquipmentList,
  type WorkReportEquipmentLink,
} from './workReportEquipment';

const LINE_KIND_LABELS: Record<string, string> = {
  hours_regular: 'Tunnit',
  hours_overtime: 'Ylitötunnit',
  hours_overtime_50: 'Ylityö 50 %',
  hours_overtime_100: 'Ylityö 100 %',
  hours_on_call: 'Päivystys',
  fixed_price: 'Urakka',
  commission: 'Provisio',
  expense: 'Kulu',
  refrigerant: 'Kylmäaine',
};

export type WorkReportPrintMeta = {
  companyName: string;
  logoUrl?: string;
  settings?: CompanySettings | null;
};

export type WorkReportPrintSummary = {
  brandingName: string;
  reportDateLabel: string;
  customerLabel: string;
  headingText: string;
  descriptionText: string;
};

export type WorkReportPrintLogImage = {
  fileName: string;
  url: string;
  caption?: string;
};

export function getWorkReportPrintSummary(
  report: WorkReport,
  meta?: Pick<WorkReportPrintMeta, 'companyName'>,
): WorkReportPrintSummary {
  const reportDate = report.completed_at ?? report.scheduled_start;
  const printDate = new Date().toLocaleDateString('fi-FI');

  return {
    brandingName: report.branding_company?.name ?? report.owner_company?.name ?? meta?.companyName ?? '—',
    reportDateLabel: reportDate ? formatDateTime(reportDate) : printDate,
    customerLabel: report.customers?.name ?? report.location_text ?? '—',
    headingText: resolveWorkReportHeading(report),
    descriptionText: [
      resolveWorkReportDescription(report),
      report.location_text && report.customers?.name ? report.location_text : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
  };
}

/** Used as document title when saving print output as PDF. */
export function buildWorkReportPrintTitle(
  report: WorkReport,
  meta?: Pick<WorkReportPrintMeta, 'companyName'>,
): string {
  const summary = getWorkReportPrintSummary(report, meta);
  const reportDate = report.completed_at ?? report.scheduled_start;
  const dateLabel = reportDate ? formatDate(reportDate) : new Date().toLocaleDateString('fi-FI');
  const headingLine = summary.headingText.replace(/\s+/g, ' ').trim() || 'Työraportti';

  return [
    sanitizePrintFileNamePart(summary.customerLabel, 50),
    sanitizePrintFileNamePart(headingLine, 70),
    sanitizePrintFileNamePart(dateLabel, 20),
  ].join(' — ');
}

function sanitizePrintFileNamePart(value: string, maxLength = 50): string {
  return (
    value
      .replace(/[\r\n]+/g, ' ')
      .replace(/[\\/:*?"<>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\.+$/, '')
      .slice(0, maxLength)
      .trim() || '—'
  );
}

function formatBillableLineQty(kind: string, qty: number): string {
  if (kind === 'refrigerant') return `${qty.toFixed(3)} kg`;
  if (kind === 'hours_regular' || kind === 'hours_overtime' || kind === 'hours_on_call') {
    return `${qty.toFixed(2)} h`;
  }
  return String(qty);
}

function partnerBillingLinesForPrint(
  lines: BillableCalculation['byUser'][number]['lines'] | undefined,
  showPartnerPrices: boolean,
) {
  const safeLines = lines ?? [];
  if (!showPartnerPrices) return safeLines;
  return safeLines.filter((line) => line.included || line.kind === 'refrigerant');
}

function formatBillablePriceCell(unitPrice: number, priceMissing?: boolean): string {
  if (priceMissing) {
    return '<span class="billing-price-missing" title="Hinta puuttuu">?</span>';
  }
  return formatEuro(unitPrice);
}

function customerBillingPrintSection(
  customerCalculation: BillableCalculation,
  customerLabel: string,
  billingQuote?: BillingQuoteSettings | null,
): string {
  const isQuoteFixed = customerCalculation.billingMode === 'quote_fixed';
  const isQuotePlusExtras = customerCalculation.billingMode === 'quote_plus_extras';

  if (isQuoteFixed) {
    const quoteTitle = customerCalculation.quoteTitle ?? billingQuote?.quote_title ?? 'Tarjous';
    const vatRate = Number(billingQuote?.quote_vat_rate) || 0;
    const vatNote = quoteHasVat(vatRate) ? ` (sis. ALV ${vatRate} %)` : ' (alv 0 %)';
    return printBox(
      'Asiakkaalta laskutettava',
      `<p class="meta-line">Asiakas: <strong>${esc(customerLabel)}</strong></p>
      <p class="meta-line">Kiinteä tarjoushinta — tunti- ja ajolaskentaa ei käytetä.</p>
      <table>
        <thead>
          <tr><th>Tarjous</th><th class="num">Summa</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>${esc(quoteTitle)}${esc(vatNote)}</td>
            <td class="num"><strong>${formatEuro(customerCalculation.grandTotal)}</strong></td>
          </tr>
        </tbody>
      </table>
      <p class="grand-total"><strong>Asiakkaalta laskutettava yhteensä: ${formatEuro(customerCalculation.grandTotal)}</strong></p>`,
    );
  }

  if (isQuotePlusExtras) {
    const quoteTitle = customerCalculation.quoteTitle ?? billingQuote?.quote_title ?? 'Tarjous';
    const vatRate = Number(billingQuote?.quote_vat_rate) || 0;
    const vatNote = quoteHasVat(vatRate) ? ` (sis. ALV ${vatRate} %)` : ' (alv 0 %)';
    const quoteUser = customerCalculation.byUser.find((user) => user.userId === 'quote');
    const quoteTotal = quoteUser?.subtotal ?? customerCalculation.grandTotal - (customerCalculation.quoteExtrasTotal ?? 0);
    const extraUsers = customerCalculation.byUser.filter((user) => user.userId !== 'quote');
    const extraRows = extraUsers
      .flatMap((user) =>
        billableUserLines(user)
          .filter((line) => line.included)
          .map(
            (line) => `<tr>
            <td>${esc(formatDate(line.logDate))}</td>
            <td>${esc(user.userName)}</td>
            <td>${esc(LINE_KIND_LABELS[line.kind] ?? line.kind)}</td>
            <td>${esc(line.description)} <span class="muted">· ${esc(APPROVED_EXTRA_BILLING_CUSTOMER_PRINT_LABEL)}</span></td>
            <td class="num">${formatBillableLineQty(line.kind, line.qty)}</td>
            <td class="num">${formatBillablePriceCell(line.unitPrice, line.priceMissing)}</td>
            <td class="num"><strong>${line.priceMissing ? '<span class="billing-price-missing">?</span>' : formatEuro(line.total)}</strong></td>
          </tr>`,
          ),
      )
      .join('');
    return printBox(
      'Asiakkaalta laskutettava',
      `<p class="meta-line">Asiakas: <strong>${esc(customerLabel)}</strong></p>
      <p class="meta-line">Tarjoushinta + lisätyöt ja -kulut.</p>
      <table>
        <thead>
          <tr><th>Tarjous</th><th class="num">Summa</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>${esc(quoteTitle)}${esc(vatNote)}</td>
            <td class="num"><strong>${formatEuro(quoteTotal)}</strong></td>
          </tr>
        </tbody>
      </table>
      ${extraRows ? `<h3 class="billing-subheading">Lisätyöt ja -kulut (tarjouksen päälle)</h3>
      <table>
        <thead>
          <tr><th>Päivä</th><th>Henkilö</th><th>Tyyppi</th><th>Kuvaus</th><th class="num">Määrä</th><th class="num">á hinta</th><th class="num">Yhteensä</th></tr>
        </thead>
        <tbody>${extraRows}</tbody>
      </table>` : ''}
      <p class="grand-total"><strong>Asiakkaalta laskutettava yhteensä: ${formatEuro(customerCalculation.grandTotal)}</strong></p>
      <p class="meta-line billing-price-missing-note">Punainen <span class="billing-price-missing">?</span> = hinta puuttuu, määritä asiakkaalle laskutettava hinta.</p>`,
    );
  }

  const users = billableUsers(customerCalculation);
  const detailRows = users
    .flatMap((user) =>
      billableUserLines(user)
        .filter((line) => line.included)
        .map(
          (line) => `<tr>
            <td>${esc(formatDate(line.logDate))}</td>
            <td>${esc(user.userName)}</td>
            <td>${esc(LINE_KIND_LABELS[line.kind] ?? line.kind)}</td>
            <td>${esc(line.description)}</td>
            <td class="num">${formatBillableLineQty(line.kind, line.qty)}</td>
            <td class="num">${formatBillablePriceCell(line.unitPrice, line.priceMissing)}</td>
            <td class="num"><strong>${line.priceMissing ? '<span class="billing-price-missing">?</span>' : formatEuro(line.total)}</strong></td>
          </tr>`,
        ),
    )
    .join('');

  return printBox(
    'Asiakkaalta laskutettava',
    `<p class="meta-line">Asiakas: <strong>${esc(customerLabel)}</strong></p>
    <table>
      <thead>
        <tr><th>Henkilö</th><th class="num">Työt (€)</th><th class="num">Kulut / urakat</th><th class="num">Yhteensä</th></tr>
      </thead>
      <tbody>
        ${users
          .map(
            (u) => `<tr>
              <td>${esc(u.userName)}</td>
              <td class="num">${formatEuro(u.hoursTotal)}</td>
              <td class="num">${formatEuro(u.expensesTotal + u.fixedTotal + (u.commissionTotal ?? 0))}</td>
              <td class="num"><strong>${formatEuro(u.subtotal)}</strong></td>
            </tr>`,
          )
          .join('')}
      </tbody>
    </table>
    <h3 class="billing-subheading">Laskurivit</h3>
    <table>
      <thead>
        <tr><th>Päivä</th><th>Henkilö</th><th>Tyyppi</th><th>Kuvaus</th><th class="num">Määrä</th><th class="num">á hinta</th><th class="num">Yhteensä</th></tr>
      </thead>
      <tbody>${detailRows || '<tr><td colspan="7">Ei laskutettavia rivejä.</td></tr>'}</tbody>
    </table>
    <p class="grand-total"><strong>Asiakkaalta laskutettava yhteensä: ${formatEuro(customerCalculation.grandTotal)}</strong></p>
    <p class="meta-line billing-price-missing-note">Punainen <span class="billing-price-missing">?</span> = hinta puuttuu, määritä asiakkaalle laskutettava hinta.</p>`,
  );
}

function basicNetMarginPrintSection(
  customerCalculation: BillableCalculation,
  partnerCalculation: BillableCalculation | null,
  logs: WorkReportDailyLog[],
  showPartnerTotal: boolean,
): string {
  const margin = computeBasicWorkReportNetMargin({
    customerCalculation,
    partnerCalculation,
    logs,
  });

  if (!margin.ok) {
    return printBox(
      'Puhdas kate',
      `<p class="meta-line">${esc(margin.reason)}</p>
      <p class="meta-line">Kate = asiakkaalta laskutettava − hankintahinta − kumppanilta laskutettava.</p>`,
    );
  }

  const purchaseRow =
    margin.purchaseNet > 0.005
      ? margin.purchaseLines
          .map(
            (line) =>
              `<tr><td>Hankinta: ${esc(line.description)}</td><td class="num">− ${formatEuro(line.total)}</td></tr>`,
          )
          .join('')
      : `<tr><td>Hankintahinta</td><td class="num muted">—</td></tr>`;
  const partnerRow = showPartnerTotal
    ? `<tr><td>Kumppanilta laskutettava</td><td class="num">− ${formatEuro(margin.partnerTotal)}</td></tr>`
    : '';

  return printBox(
    'Puhdas kate',
    `<table>
      <tbody>
        <tr><td>Asiakkaalta laskutettava</td><td class="num">${formatEuro(margin.customerTotal)}</td></tr>
        ${purchaseRow}
        ${partnerRow}
        <tr class="profit-row"><td><strong>Puhdas kate</strong></td><td class="num"><strong>${formatEuro(margin.netMarginNet)}</strong></td></tr>
      </tbody>
    </table>
    <p class="meta-line">Kate = asiakkaalta laskutettava − hankintahinta − kumppanilta laskutettava.</p>`,
  );
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function quoteMarginPrintSection(
  billingQuote: BillingQuoteSettings,
  partnerCalculation: BillableCalculation | null,
  logs: WorkReportDailyLog[],
  customerCalculation?: BillableCalculation | null,
  quoteData?: unknown,
  tripKmRate?: number | null,
): string {
  if (!billingQuoteHasData(billingQuote)) return '';

  const categoryComparison =
    quoteData && partnerCalculation
      ? compareQuoteCategories({
          quoteData,
          partnerCalculation,
          logs,
          partnerRates: partnerCalculation.ratesUsed,
          tripKmRate,
          billingSettings: billingQuote,
        })
      : null;

  const partnerMargin = partnerCalculation
    ? computePartnerNetMargin(billingQuote, partnerCalculation.grandTotal, {
        logs,
        partnerRates: partnerCalculation.ratesUsed,
        customerRates: customerCalculation?.ratesUsed,
        customerExtrasNet: customerCalculation?.quoteExtrasTotal,
        partnerCalculation,
      })
    : null;

  const extrasDetail =
    logs.length && partnerCalculation
      ? collectExtraBillingMarginImpactLines(
          logs,
          partnerCalculation.ratesUsed,
          customerCalculation?.ratesUsed,
        )
      : [];
  const customerBillableGrandTotal = resolveCustomerBillableGrandTotal({
    settings: billingQuote,
    logs,
    customerCalculation,
    rates: customerCalculation?.ratesUsed,
    ratesSource: customerCalculation?.ratesSource,
  });

  const purchaseLines = billingQuote.purchase_lines ?? [];
  const deviceActualTotal = roundMoney(
    purchaseLines
      .filter((line) => line.source === 'device')
      .reduce((sum, line) => sum + line.actual_purchase_net, 0),
  );
  const suppliesActualTotal = roundMoney(
    purchaseLines
      .filter((line) => line.source !== 'device')
      .reduce((sum, line) => sum + line.actual_purchase_net, 0),
  );

  const rows: string[] = [];
  if (billingQuote.quote_title?.trim()) {
    rows.push(`<tr><td>Tarjous</td><td>${esc(billingQuote.quote_title.trim())}</td></tr>`);
  }
  if (billingQuote.quote_sale_net != null) {
    rows.push(
      `<tr><td>Tarjoushinta (alv 0 %)</td><td class="num">${formatEuro(billingQuote.quote_sale_net)}</td></tr>`,
    );
  }
  if (partnerMargin) {
    if (partnerMargin.customerExtrasNet > 0.005) {
      rows.push(
        `<tr><td>Lisälaskutus asiakkaalta</td><td class="num">+ ${formatEuro(partnerMargin.customerExtrasNet)}</td></tr>`,
      );
    }
    if (customerBillableGrandTotal && customerBillableGrandTotal.extrasTotal > 0.005) {
      rows.push(
        `<tr class="profit-row"><td><strong>Asiakkaalta laskutettava yhteensä</strong></td><td class="num"><strong>${formatEuro(customerBillableGrandTotal.grandTotal)}</strong></td></tr>`,
      );
    }

    for (const row of categoryComparison?.rows ?? []) {
      rows.push(
        `<tr class="muted"><td>${esc(row.label)} (vertailu arvio → toteutunut)</td><td class="num">${formatEuro(row.quoteNet)} → ${formatEuro(row.actualNet)}</td></tr>`,
      );
    }

    const laborRow = categoryComparison?.rows.find((row) => row.key === 'labor');
    const expensesRow = categoryComparison?.rows.find((row) => row.key === 'expenses');
    const laborActual = laborRow?.actualNet ?? 0;
    const expensesActual = expensesRow?.actualNet ?? 0;

    if (laborActual > 0.005) {
      rows.push(
        `<tr><td>Työt (vähennetään katteesta)</td><td class="num">− ${formatEuro(laborActual)}</td></tr>`,
      );
    }
    if (expensesActual > 0.005) {
      rows.push(
        `<tr><td>Kulut (vähennetään katteesta)</td><td class="num">− ${formatEuro(expensesActual)}</td></tr>`,
      );
    }
    if (laborActual <= 0.005 && expensesActual <= 0.005 && partnerMargin.installationLaborTravelNet > 0.005) {
      rows.push(
        `<tr><td>Työ ja kulut (vähennetään katteesta)</td><td class="num">− ${formatEuro(partnerMargin.installationLaborTravelNet)}</td></tr>`,
      );
    }
    if (deviceActualTotal > 0.005) {
      rows.push(
        `<tr><td>Laite (toteutunut hankinta)</td><td class="num">− ${formatEuro(deviceActualTotal)}</td></tr>`,
      );
    }
    if (suppliesActualTotal > 0.005) {
      rows.push(
        `<tr><td>Tarvikkeet (toteutunut, päiväkirja)</td><td class="num">− ${formatEuro(suppliesActualTotal)}</td></tr>`,
      );
    }
    const partnerBilledMaterials = roundMoney(
      partnerMargin.effectiveMaterialCostNet - deviceActualTotal - suppliesActualTotal,
    );
    if (partnerBilledMaterials > 0.005) {
      rows.push(
        `<tr><td>Kumppanille laskutetut tarvikkeet</td><td class="num">− ${formatEuro(partnerBilledMaterials)}</td></tr>`,
      );
    }
    if (partnerMargin.marginEatingExpenseNet > 0.005) {
      rows.push(
        `<tr><td>Katetta syövät kulut (ei lisälaskutusta)</td><td class="num">− ${formatEuro(partnerMargin.marginEatingExpenseNet)}</td></tr>`,
      );
    }
    if (partnerMargin.partnerPiikkiPurchaseNet > 0.005) {
      rows.push(
        `<tr><td>Kumppanin tililtä hankitut</td><td class="num">− ${formatEuro(partnerMargin.partnerPiikkiPurchaseNet)}</td></tr>`,
      );
    }
    if (partnerMargin.piikkiMaterialCostNet > 0.005) {
      rows.push(
        `<tr><td>Lisätilauksen hankintakulut</td><td class="num">− ${formatEuro(partnerMargin.piikkiMaterialCostNet)}</td></tr>`,
      );
    }
    rows.push(
      `<tr class="profit-row"><td><strong>Puhdas kate</strong></td><td class="num"><strong>${formatEuro(partnerMargin.netMarginNet)}</strong></td></tr>`,
    );
  }

  const purchaseLinesHtml = renderBillingQuotePurchaseLinesHtml(purchaseLines, {
    escapeHtml: esc,
  });

  const categoryComparisonHtml =
    categoryComparison
      ? renderQuoteCategoryComparisonHtml(categoryComparison, {
          escapeHtml: esc,
          formatEuro,
        })
      : '';

  const extrasDetailHtml =
    extrasDetail.length > 0
      ? `<h3 class="billing-subheading">Lisälaskutuksen kate-erittely</h3>
      <table>
        <thead>
          <tr><th>Päivä</th><th>Rivi</th><th class="num">Asiakas</th><th class="num">Kumppani</th><th class="num">Hankinta</th><th class="num">Kate</th></tr>
        </thead>
        <tbody>${extrasDetail
          .map((line) => {
            const marginCellParts = formatExtraBillingMarginImpactCell(
              line,
              formatEuro,
              partnerMargin?.netMarginNet,
            );
            const marginCell = marginCellParts.approved
              ? `<strong>${marginCellParts.approved}</strong>`
              : `<strong>${marginCellParts.withPermission}</strong>`;
            const statusLabel = extraBillingMarginImpactStatusLabel(line);
            return `<tr class="${line.status === 'pending' ? 'billing-margin-pending' : ''}">
            <td>${esc(formatDate(line.logDate))}</td>
            <td>${esc(line.kind === 'extra_work' ? `Lisätyö: ${line.description}` : line.description)}<div class="muted">${esc(statusLabel)}</div></td>
            <td class="num">${line.status === 'approved' ? formatEuro(line.customerNet) : '—'}</td>
            <td class="num">${line.status === 'approved' && line.partnerNet > 0 ? `− ${formatEuro(line.partnerNet)}` : '—'}</td>
            <td class="num">${line.status === 'approved' && line.piikkiCostNet > 0 ? `− ${formatEuro(line.piikkiCostNet)}` : '—'}</td>
            <td class="num">${marginCell}</td>
          </tr>`;
          })
          .join('')}</tbody>
      </table>
      ${
        customerBillableGrandTotal && customerBillableGrandTotal.extrasTotal > 0.005
          ? `<p class="meta-line">Asiakkaalta laskutettava yhteensä: tarjous ${formatEuro(customerBillableGrandTotal.quoteTotal)} + lisät ${formatEuro(customerBillableGrandTotal.extrasTotal)} = <strong>${formatEuro(customerBillableGrandTotal.grandTotal)}</strong></p>`
          : ''
      }`
      : '';

  if (rows.length === 0 && !purchaseLinesHtml && !categoryComparisonHtml && !extrasDetailHtml) {
    return '';
  }

  return printBox(
    'Tarjous ja kate',
    `${categoryComparisonHtml}
    ${purchaseLinesHtml}
    <table>
      <tbody>${rows.join('')}</tbody>
    </table>
    ${extrasDetailHtml}
    ${
      partnerMargin
        ? '<p class="meta-line">Kate = tarjoushinta + lisälaskutus − työt − kulut − tarvikkeet − laite − katetta syövät kulut − suorat hankintakulut. Vertailurivit ovat informatiivisia — katteeseen vähennetään vain toteutuneet summat.</p>'
        : ''
    }
    ${billingQuote.notes?.trim() ? `<p class="meta-line">Huom: ${esc(billingQuote.notes.trim())}</p>` : ''}`,
  );
}

export function generateWorkReportPrintHtml(input: {
  report: WorkReport;
  logs: WorkReportDailyLog[];
  logImages?: Record<string, WorkReportPrintLogImage[]>;
  printMode?: WorkReportPrintMode;
  showPartnerPrices: boolean;
  calculation: BillableCalculation | null;
  customerCalculation?: BillableCalculation | null;
  billingQuote?: BillingQuoteSettings | null;
  quoteData?: unknown;
  tripKmRate?: number | null;
  meta: WorkReportPrintMeta;
  hideAssignee?: boolean;
  viewerCompanyId?: string | null;
  customerPrintQuantitySettings?: CustomerPrintQuantitySettings;
  /** Junction-linked devices; when set, print lists all (not only legacy equipment_id). */
  equipmentLinks?: WorkReportEquipmentLink[] | null;
}) {
  const {
    report,
    logs,
    logImages = {},
    printMode = input.showPartnerPrices ? 'internal' : 'customer',
    showPartnerPrices,
    calculation,
    customerCalculation,
    billingQuote: inputBillingQuote,
    quoteData,
    tripKmRate,
    meta,
    hideAssignee,
    viewerCompanyId,
    customerPrintQuantitySettings: inputCustomerPrintQuantitySettings,
    equipmentLinks = null,
  } = input;
  const customerPrintQuantitySettings =
    printMode === 'customer'
      ? (inputCustomerPrintQuantitySettings ?? DEFAULT_CUSTOMER_PRINT_QUANTITY_SETTINGS)
      : DEFAULT_CUSTOMER_PRINT_QUANTITY_SETTINGS;
  const linkedEquipment =
    equipmentLinks && equipmentLinks.length > 0
      ? equipmentLinks
      : report.equipment
        ? [{ id: report.equipment_id ?? 'legacy', name: report.equipment.name, tag: report.equipment.tag }]
        : [];
  const equipmentPrintLabel = linkedEquipment.length > 1 ? 'Laitteet' : 'Laite';
  const equipmentPrintValue = formatWorkReportEquipmentList(linkedEquipment);
  const billingQuote = parseBillingQuoteSettings(inputBillingQuote ?? {});
  const customerQuoteBased = customerUsesQuoteBasedBilling(billingQuote);
  const linkedQuoteRequest = workReportHasLinkedQuoteRequest(billingQuote);
  const expenseQuoteContext = { linkedQuoteRequest };
  const showInternalPrices = printMode === 'internal';
  const showCustomerPricesInPrint =
    showInternalPrices && !!customerCalculation && !customerQuoteBased;
  const isDelegatedOrder =
    !!report.delegate_company_id && report.created_by_company_id === report.owner_company_id;
  const billedPartnerName = isDelegatedOrder
    ? (report.delegate_company?.name ?? '—')
    : (report.owner_company?.name ?? '—');
  const isPartnerReport =
    report.created_by_company_id !== report.owner_company_id || isDelegatedOrder;

  const logPeriod = resolveWorkReportLogPeriod(logs);
  const workStartLabel = logPeriod.startDate
    ? formatDate(logPeriod.startDate)
    : formatDateTime(report.scheduled_start);
  const workEndLabel = logPeriod.endDate
    ? formatDate(logPeriod.endDate)
    : formatDateTime(report.completed_at);

  const logSections = logs
    .map((log) => {
      const expenses = log.expense_lines ?? [];
      const supplyLineFlags = parseDailyLogCustomerExtraBilling(log.customer_extra_billing).supply_line_flags;
      const refrigerantLines = log.refrigerant_lines ?? [];
      const showCustomerExpensePrices = showCustomerPricesInPrint;
      const expenseRows = expenses
        .map((line, index) => {
          const extraBilling = resolveLogExpenseExtraBillingFlags(line, index, expenses, supplyLineFlags);
          const label = EXPENSE_TYPE_LABELS[line.expense_type] ?? line.expense_type;
          const descriptionForPrint =
            printMode === 'customer'
              ? resolveTripKmCustomerPrintDescription(line) ?? line.description
              : line.description;
          const qty = Number(line.qty);
          const unit = Number(line.unit_price);
          const total = expenseLineTotal(line);
          const customerUnit =
            line.customer_unit_price != null && Number(line.customer_unit_price) > 0
              ? Number(line.customer_unit_price)
              : unit;
          const customerTotal = expenseLineTotal({ ...line, unit_price: customerUnit });
          if (showPartnerPrices) {
            const partnerNote = expensePrintBillingNote(line, {
              showPartner: true,
              showCustomer: showCustomerExpensePrices,
            }, expenseQuoteContext);
            const customerOnly = line.bill_to_partner === false && line.bill_to_customer !== false;
            if (customerOnly) {
              const purchaseUnit = resolveExpensePurchaseUnitPrice(line) ?? 0;
              const purchaseTotal = expensePurchaseLineTotal(line);
              const purchaseMissing = expensePurchasePriceMissing(line);
              const customerMissing = expenseCustomerPriceMissing(line, expenseQuoteContext);
              const resolvedCustomerUnit = resolveExpenseCustomerUnitPrice(line, expenseQuoteContext);
              const resolvedCustomerTotal = expenseLineTotal({ ...line, unit_price: resolvedCustomerUnit });
              const purchaseCell = purchaseMissing
                ? `hankinta <span class="billing-price-missing">?</span>`
                : `hankinta ${qty} × ${formatEuro(purchaseUnit)} = ${formatEuro(purchaseTotal)}`;
              const supplyExtraLabel = formatExpenseSupplyExtraBillingMarginNote(line, formatEuro, expenseQuoteContext);
              const customerCell =
                linkedQuoteRequest && customerQuoteBased && !extraBilling.extra_billing_allowed
                  ? supplyExtraLabel
                    ? ` · <span class="muted">${esc(supplyExtraLabel)}</span>`
                    : ' · <span class="muted">kuuluu tarjoukseen</span>'
                  : linkedQuoteRequest && customerQuoteBased && extraBilling.extra_billing_allowed
                    ? customerMissing
                      ? ` · asiakas <span class="billing-price-missing">?</span>`
                      : ` · asiakas ${qty} × ${formatEuro(resolvedCustomerUnit)} = ${formatEuro(resolvedCustomerTotal)}${supplyExtraLabel ? ` · <span class="muted">${esc(supplyExtraLabel)}</span>` : ''}`
                  : customerMissing
                    ? ` · asiakas <span class="billing-price-missing">?</span>`
                    : ` · asiakas ${qty} × ${formatEuro(resolvedCustomerUnit)} = ${formatEuro(resolvedCustomerTotal)}`;
              return `<tr><td>${esc(label)}</td><td>${esc(descriptionForPrint)}</td><td class="num">${purchaseCell}${customerCell}${esc(partnerNote)}</td></tr>`;
            }
            const customerNote =
              showCustomerExpensePrices && line.bill_to_customer !== false && customerUnit !== unit
                ? ` · asiakas ${formatEuro(customerUnit)} = ${formatEuro(customerTotal)}`
                : showCustomerExpensePrices && line.bill_to_customer !== false
                  ? ` · asiakas ${formatEuro(customerTotal)}`
                  : '';
            return `<tr><td>${esc(label)}</td><td>${esc(descriptionForPrint)}</td><td class="num">${qty} × ${formatEuro(unit)} = ${formatEuro(total)}${esc(partnerNote)}${esc(customerNote)}</td></tr>`;
          }
          if (showCustomerExpensePrices && expenseIncludedInCustomerInvoice(line, expenseQuoteContext)) {
            const billedUnit = resolveExpenseCustomerUnitPrice(line, expenseQuoteContext);
            const billedTotal = expenseLineTotal({ ...line, unit_price: billedUnit });
            const priceMissing = expenseCustomerPriceMissing(line, expenseQuoteContext);
            const priceCell = priceMissing
              ? `${qty} · <span class="billing-price-missing">?</span>`
              : `${qty} × ${formatEuro(billedUnit)} = ${formatEuro(billedTotal)}`;
            const extraBillingCustomerNote = expenseApprovedExtraBillingCustomerPrintLabel(line, expenseQuoteContext);
            const descriptionCell = extraBillingCustomerNote
              ? `${esc(descriptionForPrint)} <span class="muted">· ${esc(extraBillingCustomerNote)}</span>`
              : esc(descriptionForPrint);
            return `<tr><td>${esc(label)}</td><td>${descriptionCell}</td><td class="num">${priceCell}</td></tr>`;
          }
          const customerQtyCell =
            printMode === 'customer'
              && customerPrintQuantitySettings.showQuantities
              && customerPrintQuantitySettings.showExpenseQuantities
              ? formatCustomerPrintExpenseQuantity(line.expense_type, qty, customerPrintQuantitySettings)
              : '';
          const qtyCell = customerQtyCell
            ? `<td class="num">${esc(customerQtyCell)}</td>`
            : printMode === 'customer' && !customerPrintQuantitySettings.showExpenseQuantities
              ? ''
              : `<td class="num">${qty}</td>`;
          return `<tr><td>${esc(label)}</td><td>${esc(descriptionForPrint)}</td>${qtyCell}</tr>`;
        })
        .join('');

      const showCustomerRefrigerantPrices = showCustomerPricesInPrint;
      const showCustomerRefrigerantQuantities =
        printMode !== 'customer'
        || (customerPrintQuantitySettings.showQuantities
          && customerPrintQuantitySettings.showRefrigerantQuantities);
      const refrigerantRows = refrigerantLines
        .map((line) => {
          const reminder = refrigerantBillingReminder(line, report);
          const includedInCustomerBilling = refrigerantIncludedInCustomerBilling(line);
          const customerUnit = refrigerantCustomerUnitPrice(line);
          const customerTotal = refrigerantLineTotal(line);
          const priceMissing = includedInCustomerBilling && !(customerUnit > 0);
          const logAuthor = resolveDailyLogAuthorLabel(log);
          const sellerLabel = logAuthor.name === '—' ? null : logAuthor.name;
          let billingNote = '';
          if (showInternalPrices) {
            if (showPartnerPrices && line.bill_to_customer) {
              billingNote = ` · laskutetaan asiakkaalta ${formatEuro(refrigerantLineTotal(line))}`;
            } else if (showCustomerRefrigerantPrices && includedInCustomerBilling) {
              billingNote = priceMissing
                ? ' · asiakashinta ?'
                : ` · asiakas ${formatEuro(customerUnit)}/kg = ${formatEuro(customerTotal)}`;
            } else if (reminder) {
              billingNote = ` · ${reminder}`;
            }
          }
          const qtyCell = showCustomerRefrigerantPrices && includedInCustomerBilling
            ? `${Number(line.qty_kg).toFixed(3)} kg${priceMissing ? ' · ?' : ` · ${formatEuro(customerTotal)}`}`
            : printMode === 'customer' && showCustomerRefrigerantQuantities
              ? formatCustomerPrintRefrigerantQuantity(Number(line.qty_kg))
              : `${Number(line.qty_kg).toFixed(3)} kg`;
          const refrigerantQtyColumn = showCustomerRefrigerantQuantities || showInternalPrices
            ? `<td class="num">${qtyCell}</td>`
            : '';
          return `<tr><td>${esc(formatRefrigerantLineLabelForReport(line, report, viewerCompanyId, sellerLabel, { customerPrint: printMode === 'customer' }))}${esc(billingNote)}</td>${refrigerantQtyColumn}</tr>`;
        })
        .join('');

      const hourSummary =
        printMode === 'customer'
          ? (() => {
              const qtySummary = formatCustomerPrintHourSummary(log, customerPrintQuantitySettings);
              const extraLabel = hoursApprovedExtraBillingCustomerPrintLabel(log.customer_extra_billing);
              if (qtySummary && extraLabel) return `${qtySummary} · ${extraLabel}`;
              return qtySummary ?? extraLabel ?? '';
            })()
          : formatHourEntryForPrint(
              log,
              showInternalPrices && (showPartnerPrices || showCustomerPricesInPrint),
              showCustomerPricesInPrint,
              false,
            );
      const quoteHourNote =
        customerQuoteBased && showInternalPrices
          ? ' · <span class="muted">kuuluu tarjoukseen (kalenteri)</span>'
          : '';
      const logAuthor = resolveDailyLogAuthorLabel(log);
      const logAuthorLabel = logAuthor.deleted
        ? `${logAuthor.name}*`
        : logAuthor.name;
      const commission =
        Number(log.commission_amount) > 0 || log.commission_note
          ? showInternalPrices && Number(log.commission_amount) > 0
            ? `<p class="sub"><strong>Provisio:</strong> ${formatEuro(Number(log.commission_amount))}${log.commission_note ? ` — ${esc(log.commission_note)}` : ''}</p>`
            : `<p class="sub"><strong>Provisio</strong>${log.commission_note ? `: ${esc(log.commission_note)}` : Number(log.commission_amount) > 0 ? ' kirjattu' : ''}</p>`
          : '';
      const showExpenseMoneyColumn = showPartnerPrices || showCustomerExpensePrices;
      const showExpenseQuantityColumn =
        showExpenseMoneyColumn
        || (printMode === 'customer'
          && customerPrintQuantitySettings.showQuantities
          && customerPrintQuantitySettings.showExpenseQuantities);

      const images = logImages[log.id] ?? [];
      const imageSection =
        images.length > 0
          ? `<div class="log-images-wrap">
              <div class="log-images-label">Liitteet</div>
              <div class="log-images">${images
                .map(
                  (image) =>
                    `<figure class="log-image"><a href="${esc(image.url)}" class="log-image-full-link" target="_blank" rel="noopener noreferrer"><img src="${esc(image.url)}" alt="${esc(image.caption?.trim() || image.fileName)}" /></a><figcaption>${esc(image.caption?.trim() || image.fileName)}</figcaption></figure>`,
                )
                .join('')}</div>
            </div>`
          : '';

      return `
        <article class="log-block">
          <div class="log-head">
            <strong>${formatDate(log.log_date)}</strong>
            <span>${esc(logAuthorLabel)}</span>
            <span>${esc(HOUR_ENTRY_LABELS[log.entry_type])}</span>
            <span>${esc(hourSummary)}${quoteHourNote}</span>
          </div>
          <div class="log-body">${esc(log.work_done).replace(/\n/g, '<br />')}</div>
          ${commission}
          ${imageSection}
          ${
            expenses.length > 0
              ? `<table class="mini-table">
                  <thead><tr>${
                    showExpenseMoneyColumn
                      ? '<th>Kulu</th><th>Kuvaus</th><th class="num">Summa</th>'
                      : showExpenseQuantityColumn
                        ? '<th>Kulu</th><th>Kuvaus</th><th class="num">Määrä</th>'
                        : '<th>Kulu</th><th>Kuvaus</th>'
                  }</tr></thead>
                  <tbody>${expenseRows}</tbody>
                </table>`
              : ''
          }
          ${
            refrigerantLines.length > 0
              ? `<table class="mini-table">
                  <thead><tr><th>Kylmäaine</th>${
                    showCustomerRefrigerantQuantities || showInternalPrices
                      ? '<th class="num">Määrä</th>'
                      : ''
                  }</tr></thead>
                  <tbody>${refrigerantRows}</tbody>
                </table>`
              : ''
          }
        </article>`;
    })
    .join('');

  const totals = summarizeLogs(logs, showInternalPrices);
  const showCustomerSummaryQuantities =
    printMode === 'customer'
    && customerPrintQuantitySettings.showQuantities
    && customerPrintQuantitySettings.showSummaryQuantities;
  const printDate = new Date().toLocaleDateString('fi-FI');
  const { brandingName, reportDateLabel, customerLabel, descriptionText } = getWorkReportPrintSummary(
    report,
    meta,
  );
  const printTitle = buildWorkReportPrintTitle(report, meta);
  const printHeadline = buildWorkReportPrintHeadline(report);
  const displayPeople = resolveWorkReportDisplayPeople(report, { hideAssignee: hideAssignee });

  const isLampokatsastusPrint = isLampokatsastusCompanyName(meta.companyName);
  const lampokatsastusBrandHeaderHtml = isLampokatsastusPrint
    ? buildLampokatsastusWorkReportHeaderHtml(
        {
          companyName: meta.companyName,
          logoUrl: meta.logoUrl,
          settings: meta.settings,
        },
        {
          esc,
          attrUrl: (url: string) => String(url).replace(/"/g, '&quot;'),
          logoSrc: meta.logoUrl ?? '',
        },
      )
    : '';

  const summaryHeadHtml = isLampokatsastusPrint
    ? `<div class="lk-work-title-row">
      <div class="lk-work-title-main">
        <div class="doc-label">Työraportti</div>
        <h1>${esc(printHeadline)}</h1>
      </div>
      <div class="lk-print-date">
        <span class="doc-label">Tulostettu</span>
        <strong>${esc(printDate)}</strong>
      </div>
    </div>`
    : `<div class="summary-head">
      <div class="summary-brand">
        ${meta.logoUrl ? `<img class="logo" src="${esc(meta.logoUrl)}" alt="" />` : `<div class="logo-fallback">${esc(meta.companyName)}</div>`}
      </div>
      <div class="summary-title-block">
        <div class="doc-label">Työraportti</div>
        <h1>${esc(printHeadline)}</h1>
      </div>
      <div class="summary-print-date">
        <span class="field-label">Tulostettu</span>
        <strong>${esc(printDate)}</strong>
      </div>
    </div>`;

  const summaryBox = printBox(
    null,
    `
    ${summaryHeadHtml}
    <div class="summary-grid">
      <div class="summary-field">
        <span class="field-label">Yritys</span>
        <strong>${esc(brandingName)}</strong>
      </div>
      <div class="summary-field">
        <span class="field-label">Pvm</span>
        <strong>${esc(reportDateLabel)}</strong>
      </div>
      <div class="summary-field">
        <span class="field-label">Asiakas</span>
        <strong>${esc(customerLabel)}</strong>
      </div>
      <div class="summary-field summary-field-wide">
        <span class="field-label">Kuvaus</span>
        <div class="summary-description">${descriptionText ? esc(descriptionText).replace(/\n/g, '<br />') : '—'}</div>
      </div>
    </div>`,
  );

  const detailsBox = printBox(
    'Perustiedot',
    `<dl class="info-grid">
      <dt>Tila</dt><dd>${esc(WORK_STATUS_LABELS[report.status])}</dd>
      <dt>Laatija</dt><dd>${formatPrintUserLabel(displayPeople.authorName, displayPeople.authorDeleted)}</dd>
      ${
        !hideAssignee && displayPeople.performerName
          ? `<dt>Tekijä</dt><dd>${esc(displayPeople.performerName)}</dd>`
          : ''
      }
      ${
        report.orderer_name?.trim()
          ? `<dt>Tilaaja</dt><dd>${esc(report.orderer_name.trim())}</dd>`
          : ''
      }
      <dt>${equipmentPrintLabel}</dt><dd>${esc(equipmentPrintValue)}</dd>
      <dt>Aloitus</dt><dd>${esc(workStartLabel)}</dd>
      <dt>Valmistuminen</dt><dd>${esc(workEndLabel)}</dd>
      ${
        isDelegatedOrder
          ? `<dt>Toimeksisaaja</dt><dd>${esc(report.delegate_company?.name ?? '—')}</dd>`
          : ''
      }
    </dl>`,
  );

  const logsBox = printBox(
    'Päiväkirjaus',
    `<div class="summary-row">
      ${
        showInternalPrices || showCustomerSummaryQuantities
          ? `<span class="chip"><strong>Tunnit yhteensä:</strong> ${totals.hours.toFixed(2)} h</span>`
          : ''
      }
      ${
        showInternalPrices && totals.fixed > 0
          ? `<span class="chip"><strong>Urakat:</strong> ${formatEuro(totals.fixed)}</span>`
          : (showInternalPrices || showCustomerSummaryQuantities) && totals.fixedEntries > 0
            ? `<span class="chip"><strong>Urakkamerkintöjä:</strong> ${totals.fixedEntries}</span>`
            : ''
      }
      ${
        showInternalPrices && totals.expenses > 0
          ? `<span class="chip"><strong>Kulut:</strong> ${formatEuro(totals.expenses)}</span>`
          : (showInternalPrices || showCustomerSummaryQuantities) && totals.expenseLines > 0
            ? `<span class="chip"><strong>Kulurivejä:</strong> ${totals.expenseLines}</span>`
            : ''
      }
      ${
        showInternalPrices && totals.commission > 0
          ? `<span class="chip"><strong>Provisio:</strong> ${formatEuro(totals.commission)}</span>`
          : showInternalPrices && totals.commissionNotes > 0
            ? `<span class="chip"><strong>Provisio:</strong> ${totals.commissionNotes} merkintää</span>`
            : ''
      }
      ${
        (showInternalPrices || showCustomerSummaryQuantities) && totals.refrigerantKg > 0
          ? `<span class="chip"><strong>Kylmäaine:</strong> ${totals.refrigerantKg.toFixed(3)} kg</span>`
          : ''
      }
    </div>
    ${logSections || '<p class="muted-line">Ei päiväkirjauksia.</p>'}`,
  );

  const billingSection =
    showInternalPrices && isPartnerReport && calculation && billableUsers(calculation).length > 0
      ? printBox(
          'Keskenään laskutettava',
          `<p class="meta-line">
            Laskuttaja: <strong>${esc(report.created_by_company?.name ?? '—')}</strong>
            • Laskutettava: <strong>${esc(billedPartnerName)}</strong>
          </p>
          ${
            showPartnerPrices
              ? `<p class="meta-line">
                  Hinnat: ${esc(BILLABLE_RATES_SOURCE_LABELS[calculation.ratesSource])}
                  — tunti ${formatEuro(calculation.ratesUsed.hourly_regular)},
                  ylityö ${formatEuro(calculation.ratesUsed.hourly_overtime)},
                  päivystys ${formatEuro(calculation.ratesUsed.hourly_on_call)}
                </p>
                <table>
                  <thead>
                    <tr><th>Henkilö</th><th class="num">Työt (€)</th><th class="num">Kulut / urakat</th><th class="num">Yhteensä</th></tr>
                  </thead>
                  <tbody>
                    ${billableUsers(calculation)
                      .map(
                        (u) => `<tr>
                          <td>${esc(u.userName)}</td>
                          <td class="num">${formatEuro(u.hoursTotal)}</td>
                          <td class="num">${formatEuro(u.expensesTotal + u.fixedTotal + (u.commissionTotal ?? 0))}</td>
                          <td class="num"><strong>${formatEuro(u.subtotal)}</strong></td>
                        </tr>`,
                      )
                      .join('')}
                  </tbody>
                </table>`
              : ''
          }
          <table class="detail-table">
            <thead>
              <tr><th>Henkilö</th><th>Päivä</th><th>Tyyppi</th><th>Kuvaus</th><th class="num">Määrä</th>${
                showPartnerPrices ? '<th class="num">á hinta</th><th class="num">Yhteensä</th>' : ''
              }</tr>
            </thead>
            <tbody>
              ${
                billableUsers(calculation)
                  .flatMap((u) =>
                    partnerBillingLinesForPrint(u.lines, showPartnerPrices).map(
                      (l) => `<tr>
                          <td>${esc(u.userName)}</td>
                          <td>${esc(l.logDate)}</td>
                          <td>${esc(LINE_KIND_LABELS[l.kind] ?? l.kind)}</td>
                          <td>${esc(l.description)}</td>
                          <td class="num">${formatBillableLineQty(l.kind, l.qty)}</td>
                          ${
                            showPartnerPrices
                              ? `<td class="num">${formatEuro(l.unitPrice)}</td><td class="num">${formatEuro(l.total)}</td>`
                              : ''
                          }
                        </tr>`,
                    ),
                  )
                  .join('') || `<tr><td colspan="${showPartnerPrices ? 7 : 5}">Ei laskutettavia rivejä.</td></tr>`
              }
            </tbody>
          </table>
          ${
            showPartnerPrices
              ? `<p class="grand-total"><strong>Laskutettava yhteensä: ${formatEuro(calculation.grandTotal)}</strong></p>
                ${
                  calculation.excludedTotal > 0
                    ? `<p class="meta-line">Ei laskutukseen: ${formatEuro(calculation.excludedTotal)}</p>`
                    : ''
                }`
              : ''
          }`,
        )
      : '';

  const billingCustomerName = report.customers?.name ?? customerLabel;
  const customerBillingSection =
    showInternalPrices && customerCalculation && hasIncludedBillableLines(customerCalculation)
      ? customerBillingPrintSection(customerCalculation, billingCustomerName, billingQuote)
      : '';

  const quoteMarginSection =
    showInternalPrices && billingQuoteHasData(billingQuote)
      ? quoteMarginPrintSection(
          billingQuote,
          calculation ?? null,
          logs,
          customerCalculation ?? null,
          quoteData,
          tripKmRate,
        )
      : '';

  const basicNetMarginSection =
    showInternalPrices
    && !customerQuoteBased
    && customerCalculation
    && hasIncludedBillableLines(customerCalculation)
      ? basicNetMarginPrintSection(
          customerCalculation,
          calculation ?? null,
          logs,
          isPartnerReport && !!calculation,
        )
      : '';

  const footerHtml = isLampokatsastusPrint
    ? buildLampokatsastusWorkReportFooterHtml(
        {
          companyName: meta.companyName,
          settings: meta.settings,
        },
        { esc },
      )
    : `<div class="footer">
      ${esc(meta.companyName)} • Tulostettu ${new Date().toLocaleString('fi-FI')}${
        showInternalPrices ? ' • Sisäinen tuloste (hinnat mukana)' : ''
      }
    </div>`;

  return `<!doctype html>
<html lang="fi">
<head>
  <meta charset="utf-8" />
  <title>${esc(printTitle)}</title>
  <style>${PRINT_CSS}</style>
</head>
<body>
  <div class="work-report-print">
    ${lampokatsastusBrandHeaderHtml}
    ${summaryBox}
    ${detailsBox}
    ${logsBox}
    ${billingSection}
    ${quoteMarginSection}
    ${customerBillingSection}
    ${basicNetMarginSection}
    ${footerHtml}
  </div>
</body>
</html>`;
}

const PRINT_CSS = `
  ${lampokatsastusBrandingStyles()}
  :root {
    --text: #111827;
    --muted: #64748b;
    --border: #cbd5e1;
    --border-strong: #94a3b8;
    --accent: #1d4ed8;
    --panel: #f8fafc;
    --panel-strong: #eff6ff;
  }
  * { box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10pt;
    line-height: 1.45;
    color: var(--text);
    margin: 0;
    background: #fff;
  }
  .work-report-print {
    padding: 0;
  }
  .work-report-print > .lk-footer {
    /* Keep footer with preceding content; do not force a lone page-2 orphan. */
    break-before: avoid-page;
    page-break-before: avoid;
  }
  .print-box {
    border: 1px solid var(--border-strong);
    border-radius: 8px;
    background: #fff;
    margin-bottom: 12px;
    overflow: hidden;
    break-inside: avoid-page;
  }
  .print-box-title {
    margin: 0;
    padding: 7px 12px;
    background: var(--panel-strong);
    border-bottom: 1px solid var(--border);
    color: var(--accent);
    font-size: 10.5pt;
    font-weight: 700;
    letter-spacing: .02em;
    text-transform: uppercase;
  }
  .print-box-body { padding: 12px; }
  .summary-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    min-height: 18mm;
    padding-bottom: 12px;
    margin-bottom: 12px;
    border-bottom: 2px solid var(--accent);
    flex-wrap: wrap;
  }
  .summary-brand {
    flex: 0 1 52mm;
    max-width: 52mm;
  }
  .logo { max-height: 16mm; max-width: 50mm; object-fit: contain; display: block; }
  .logo-fallback { font-size: 11pt; font-weight: 700; color: var(--text); }
  .doc-label {
    font-size: 8.5pt;
    font-weight: 700;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 2px;
  }
  .summary-title-block {
    flex: 1 1 60mm;
    min-width: 0;
    text-align: center;
  }
  .summary-title-block h1 {
    margin: 0;
    font-size: 12.5pt;
    line-height: 1.18;
    color: var(--text);
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  .summary-print-date {
    flex: 0 0 auto;
    text-align: right;
    min-width: 28mm;
  }
  .field-label {
    display: block;
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 2px;
  }
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px 14px;
  }
  .summary-field-wide { grid-column: 1 / -1; }
  .summary-description {
    padding: 8px 10px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    white-space: pre-wrap;
  }
  .info-grid {
    display: grid;
    grid-template-columns: 30mm 1fr 30mm 1fr;
    gap: 6px 12px;
    margin: 0;
  }
  .info-grid dt {
    margin: 0;
    color: var(--muted);
    font-size: 9pt;
    font-weight: 700;
  }
  .info-grid dd { margin: 0; }
  .summary-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--panel);
    font-size: 9pt;
  }
  .log-block {
    border: 1px solid var(--border);
    border-left: 4px solid var(--accent);
    border-radius: 6px;
    background: var(--panel);
    padding: 10px 12px;
    margin-bottom: 10px;
    break-inside: avoid;
  }
  .log-head {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--border);
    font-size: 9pt;
    color: var(--muted);
  }
  .log-head strong { color: var(--text); font-size: 10pt; }
  .log-body { white-space: pre-wrap; }
  .sub { margin: 8px 0 0; font-size: 9.5pt; color: var(--muted); }
  .log-images-wrap { margin-top: 10px; }
  .log-images-label {
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 6px;
  }
  .log-images {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
    margin-top: 10px;
  }
  .log-image { margin: 0; break-inside: avoid; }
  .log-image-full-link {
    display: block;
    text-decoration: none;
  }
  .log-image img {
    display: block;
    width: 100%;
    max-height: 26mm;
    object-fit: cover;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: #fff;
    cursor: zoom-in;
  }
  @media screen {
    .log-image-full-link:hover img {
      border-color: var(--accent);
    }
  }
  .log-image figcaption {
    margin-top: 3px;
    font-size: 7.5pt;
    color: var(--muted);
    word-break: break-word;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0 10px;
    font-size: 9.5pt;
  }
  th, td {
    border: 1px solid var(--border);
    padding: 6px 8px;
    text-align: left;
    vertical-align: top;
  }
  th { background: #eef2ff; color: #1e3a8a; font-weight: 700; }
  .mini-table { margin-top: 8px; }
  .detail-table { font-size: 9pt; }
  .num { text-align: right; white-space: nowrap; }
  .meta-line, .muted-line { color: var(--muted); margin: 0 0 8px; }
  .grand-total {
    margin: 10px 0 0;
    padding: 8px 10px;
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    background: var(--panel-strong);
    font-size: 11pt;
    text-align: right;
  }
  tr.profit-row td {
    border-top: 2px solid var(--border-strong);
    background: #f0fdf4;
  }
  tr.changed-row td {
    background: #fffbeb;
  }
  .billing-subheading {
    margin: 12px 0 6px;
    font-size: 10pt;
    font-weight: 700;
    color: var(--accent);
  }
  .billing-price-missing {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.1rem;
    min-height: 1.1rem;
    padding: 0 .2rem;
    border-radius: 999px;
    background: #fee2e2;
    color: #b91c1c;
    font-weight: 800;
    line-height: 1;
  }
  .billing-price-missing-note {
    margin-top: 6px;
    font-size: 8.5pt;
    color: var(--muted);
  }
  .footer {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
    color: var(--muted);
    font-size: 8.5pt;
    text-align: center;
  }
  .deleted-user-marker {
    color: #b45309;
    font-weight: 700;
  }
  @media print {
    body { margin: 10mm; }
    .print-box, .log-block { break-inside: avoid-page; }
    .summary-head {
      flex-wrap: nowrap;
    }
  }
`;

function printBox(title: string | null, inner: string) {
  return `
    <section class="print-box">
      ${title ? `<h2 class="print-box-title">${esc(title)}</h2>` : ''}
      <div class="print-box-body">${inner}</div>
    </section>`;
}

function formatPrintUserLabel(name: string, deleted?: boolean) {
  if (name === '—') return esc(name);
  if (deleted) {
    return `${esc(name)}<span class="deleted-user-marker" title="Poistettu käyttäjä">*</span>`;
  }
  return esc(name);
}

function formatHourEntryForPrint(
  log: WorkReportDailyLog,
  showPrices: boolean,
  showCustomerMoney = showPrices,
  customerPrint = false,
) {
  const summary = formatHourEntry(log, { showMoney: showPrices, showCustomerMoney });
  if (customerPrint) {
    const customerExtraLabel = hoursApprovedExtraBillingCustomerPrintLabel(log.customer_extra_billing);
    if (!customerExtraLabel) return summary;
    return `${summary} · ${customerExtraLabel}`;
  }
  const hourExtraLabel = hoursExtraBillingLabel(log.customer_extra_billing);
  if (!hourExtraLabel) return summary;
  return `${summary} · ${hourExtraLabel}`;
}

function summarizeLogs(logs: WorkReportDailyLog[], showPrices: boolean) {
  let hours = 0;
  let expenses = 0;
  let expenseLines = 0;
  let commission = 0;
  let commissionNotes = 0;
  let fixed = 0;
  let fixedEntries = 0;
  let refrigerantKg = 0;

  for (const log of logs) {
    if (log.entry_type === 'fixed_price') {
      fixed += Number(log.fixed_price_amount || 0);
      fixedEntries += 1;
    } else if (log.entry_type === 'regular') {
      hours += Number(log.hours_regular);
    } else if (log.entry_type === 'overtime') {
      hours += Number(log.hours_overtime);
    } else if (log.entry_type === 'on_call') {
      hours += Number(log.hours_on_call);
    } else if (log.entry_type === 'regular_and_overtime') {
      hours += Number(log.hours_regular) + Number(log.hours_overtime);
    }
    commission += Number(log.commission_amount);
    if (Number(log.commission_amount) > 0 || log.commission_note) {
      commissionNotes += 1;
    }
    for (const line of log.expense_lines ?? []) {
      expenseLines += 1;
      if (showPrices) expenses += expenseLineTotal(line);
    }
    for (const line of log.refrigerant_lines ?? []) {
      refrigerantKg += Number(line.qty_kg);
    }
  }

  return { hours, expenses, expenseLines, commission, commissionNotes, fixed, fixedEntries, refrigerantKg };
}

function esc(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
