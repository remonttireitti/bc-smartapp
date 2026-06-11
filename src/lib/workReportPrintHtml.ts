import type { BillableCalculation } from './workReportBilling';
import { formatEuro } from './workReportBilling';
import { BILLABLE_RATES_SOURCE_LABELS } from './management';
import {
  formatRefrigerantLineLabel,
  refrigerantBillingReminder,
  refrigerantCustomerUnitPrice,
  refrigerantIncludedInCustomerBilling,
  refrigerantLineTotal,
} from './refrigerantInventory';
import {
  EXPENSE_TYPE_LABELS,
  HOUR_ENTRY_LABELS,
  WORK_STATUS_LABELS,
  expenseLineTotal,
  formatDate,
  formatDateTime,
  formatHourEntry,
  formatWorkReportEquipment,
  resolveWorkReportDisplayPeople,
  resolveWorkReportDescription,
  resolveWorkReportHeading,
  buildWorkReportPrintHeadline,
  resolveDailyLogAuthorLabel,
  resolveWorkReportAuthorCompany,
  type WorkReport,
  type WorkReportDailyLog,
} from '../types';

const LINE_KIND_LABELS: Record<string, string> = {
  hours_regular: 'Tunnit',
  hours_overtime: 'Ylitötunnit',
  hours_on_call: 'Päivystys',
  fixed_price: 'Urakka',
  commission: 'Provisio',
  expense: 'Kulu',
  refrigerant: 'Kylmäaine',
};

export type WorkReportPrintMeta = {
  companyName: string;
  logoUrl?: string;
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
  lines: BillableCalculation['byUser'][number]['lines'],
  showPartnerPrices: boolean,
) {
  if (!showPartnerPrices) return lines;
  return lines.filter((line) => line.included || line.kind === 'refrigerant');
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
): string {
  const detailRows = customerCalculation.byUser
    .flatMap((user) =>
      user.lines
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
        ${customerCalculation.byUser
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

export function generateWorkReportPrintHtml(input: {
  report: WorkReport;
  logs: WorkReportDailyLog[];
  logImages?: Record<string, WorkReportPrintLogImage[]>;
  showPartnerPrices: boolean;
  calculation: BillableCalculation | null;
  customerCalculation?: BillableCalculation | null;
  meta: WorkReportPrintMeta;
  hideAssignee?: boolean;
}) {
  const { report, logs, logImages = {}, showPartnerPrices, calculation, customerCalculation, meta, hideAssignee } =
    input;
  const isDelegatedOrder =
    !!report.delegate_company_id && report.created_by_company_id === report.owner_company_id;
  const billedPartnerName = isDelegatedOrder
    ? (report.delegate_company?.name ?? '—')
    : (report.owner_company?.name ?? '—');
  const isPartnerReport =
    report.created_by_company_id !== report.owner_company_id || isDelegatedOrder;

  const logSections = logs
    .map((log) => {
      const expenses = log.expense_lines ?? [];
      const refrigerantLines = log.refrigerant_lines ?? [];
      const showCustomerExpensePrices =
        !!customerCalculation && customerCalculation.grandTotal > 0;
      const expenseRows = expenses
        .map((line) => {
          const label = EXPENSE_TYPE_LABELS[line.expense_type] ?? line.expense_type;
          const qty = Number(line.qty);
          const unit = Number(line.unit_price);
          const total = expenseLineTotal(line);
          const customerUnit =
            line.customer_unit_price != null && Number(line.customer_unit_price) > 0
              ? Number(line.customer_unit_price)
              : unit;
          const customerTotal = expenseLineTotal({ ...line, unit_price: customerUnit });
          if (showPartnerPrices) {
            const partnerNote = line.bill_to_partner === false ? ' · kumppanin piikki' : '';
            const customerNote =
              showCustomerExpensePrices && line.bill_to_customer !== false && customerUnit !== unit
                ? ` · asiakas ${formatEuro(customerUnit)} = ${formatEuro(customerTotal)}`
                : showCustomerExpensePrices && line.bill_to_customer !== false
                  ? ` · asiakas ${formatEuro(customerTotal)}`
                  : '';
            return `<tr><td>${esc(label)}</td><td>${esc(line.description)}</td><td class="num">${qty} × ${formatEuro(unit)} = ${formatEuro(total)}${esc(partnerNote)}${esc(customerNote)}</td></tr>`;
          }
          if (showCustomerExpensePrices && line.bill_to_customer !== false) {
            const priceMissing = !(customerUnit > 0);
            const priceCell = priceMissing
              ? `${qty} · <span class="billing-price-missing">?</span>`
              : `${qty} × ${formatEuro(customerUnit)} = ${formatEuro(customerTotal)}`;
            return `<tr><td>${esc(label)}</td><td>${esc(line.description)}</td><td class="num">${priceCell}</td></tr>`;
          }
          return `<tr><td>${esc(label)}</td><td>${esc(line.description)}</td><td class="num">${qty}</td></tr>`;
        })
        .join('');

      const showCustomerRefrigerantPrices = !!customerCalculation;
      const refrigerantRows = refrigerantLines
        .map((line) => {
          const reminder = refrigerantBillingReminder(line);
          const includedInCustomerBilling = refrigerantIncludedInCustomerBilling(line);
          const customerUnit = refrigerantCustomerUnitPrice(line);
          const customerTotal = refrigerantLineTotal(line);
          const priceMissing = includedInCustomerBilling && !(customerUnit > 0);
          let billingNote = '';
          if (showPartnerPrices && line.bill_to_customer) {
            billingNote = ` · laskutetaan asiakkaalta ${formatEuro(refrigerantLineTotal(line))}`;
          } else if (showCustomerRefrigerantPrices && includedInCustomerBilling) {
            billingNote = priceMissing
              ? ' · asiakashinta ?'
              : ` · asiakas ${formatEuro(customerUnit)}/kg = ${formatEuro(customerTotal)}`;
          } else if (reminder) {
            billingNote = ` · ${reminder}`;
          }
          const qtyCell = showCustomerRefrigerantPrices && includedInCustomerBilling
            ? `${Number(line.qty_kg).toFixed(3)} kg${priceMissing ? ' · ?' : ` · ${formatEuro(customerTotal)}`}`
            : `${Number(line.qty_kg).toFixed(3)} kg`;
          return `<tr><td>${esc(formatRefrigerantLineLabel(line))}${esc(billingNote)}</td><td class="num">${qtyCell}</td></tr>`;
        })
        .join('');

      const hourSummary = formatHourEntryForPrint(log, showPartnerPrices);
      const logAuthor = resolveDailyLogAuthorLabel(log);
      const logAuthorLabel = logAuthor.deleted
        ? `${logAuthor.name}*`
        : logAuthor.name;
      const commission =
        Number(log.commission_amount) > 0 || log.commission_note
          ? showPartnerPrices && Number(log.commission_amount) > 0
            ? `<p class="sub"><strong>Provisio:</strong> ${formatEuro(Number(log.commission_amount))}${log.commission_note ? ` — ${esc(log.commission_note)}` : ''}</p>`
            : `<p class="sub"><strong>Provisio</strong>${log.commission_note ? `: ${esc(log.commission_note)}` : Number(log.commission_amount) > 0 ? ' kirjattu' : ''}</p>`
          : '';

      const images = logImages[log.id] ?? [];
      const imageSection =
        images.length > 0
          ? `<div class="log-images-wrap">
              <div class="log-images-label">Liitteet</div>
              <div class="log-images">${images
                .map(
                  (image) =>
                    `<figure class="log-image"><a href="${esc(image.url)}" class="log-image-full-link" target="_blank" rel="noopener noreferrer"><img src="${esc(image.url)}" alt="${esc(image.fileName)}" /></a><figcaption>${esc(image.fileName)}</figcaption></figure>`,
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
            <span>${esc(hourSummary)}</span>
          </div>
          <div class="log-body">${esc(log.work_done).replace(/\n/g, '<br />')}</div>
          ${commission}
          ${imageSection}
          ${
            expenses.length > 0
              ? `<table class="mini-table">
                  <thead><tr>${
                    showPartnerPrices
                      ? '<th>Kulu</th><th>Kuvaus</th><th class="num">Summa</th>'
                      : '<th>Kulu</th><th>Kuvaus</th><th class="num">Määrä</th>'
                  }</tr></thead>
                  <tbody>${expenseRows}</tbody>
                </table>`
              : ''
          }
          ${
            refrigerantLines.length > 0
              ? `<table class="mini-table">
                  <thead><tr><th>Kylmäaine</th><th class="num">Määrä</th></tr></thead>
                  <tbody>${refrigerantRows}</tbody>
                </table>`
              : ''
          }
        </article>`;
    })
    .join('');

  const totals = summarizeLogs(logs, showPartnerPrices);
  const printDate = new Date().toLocaleDateString('fi-FI');
  const { brandingName, reportDateLabel, customerLabel, descriptionText } = getWorkReportPrintSummary(
    report,
    meta,
  );
  const printTitle = buildWorkReportPrintTitle(report, meta);
  const printHeadline = buildWorkReportPrintHeadline(report);
  const displayPeople = resolveWorkReportDisplayPeople(report, { hideAssignee: hideAssignee });
  const authorCompanyName = resolveWorkReportAuthorCompany(report, {
    hideAssignee: hideAssignee,
    fallbackCompanyName: meta.companyName,
  });

  const summaryBox = printBox(
    null,
    `
    <div class="summary-head">
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
    </div>
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
      <dt>Laatija</dt><dd>${formatPrintUserLabel(displayPeople.authorName, displayPeople.authorDeleted)} (${esc(authorCompanyName)})</dd>
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
      <dt>Laite</dt><dd>${esc(formatWorkReportEquipment(report.equipment))}</dd>
      <dt>Aloitus</dt><dd>${esc(formatDateTime(report.scheduled_start))}</dd>
      <dt>Valmistuminen</dt><dd>${esc(formatDateTime(report.completed_at))}</dd>
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
      <span class="chip"><strong>Tunnit yhteensä:</strong> ${totals.hours.toFixed(2)} h</span>
      ${
        showPartnerPrices && totals.fixed > 0
          ? `<span class="chip"><strong>Urakat:</strong> ${formatEuro(totals.fixed)}</span>`
          : totals.fixedEntries > 0
            ? `<span class="chip"><strong>Urakkamerkintöjä:</strong> ${totals.fixedEntries}</span>`
            : ''
      }
      ${
        showPartnerPrices && totals.expenses > 0
          ? `<span class="chip"><strong>Kulut:</strong> ${formatEuro(totals.expenses)}</span>`
          : totals.expenseLines > 0
            ? `<span class="chip"><strong>Kulurivejä:</strong> ${totals.expenseLines}</span>`
            : ''
      }
      ${
        showPartnerPrices && totals.commission > 0
          ? `<span class="chip"><strong>Provisio:</strong> ${formatEuro(totals.commission)}</span>`
          : totals.commissionNotes > 0
            ? `<span class="chip"><strong>Provisio:</strong> ${totals.commissionNotes} merkintää</span>`
            : ''
      }
      ${
        totals.refrigerantKg > 0
          ? `<span class="chip"><strong>Kylmäaine:</strong> ${totals.refrigerantKg.toFixed(3)} kg</span>`
          : ''
      }
    </div>
    ${logSections || '<p class="muted-line">Ei päiväkirjauksia.</p>'}`,
  );

  const billingSection =
    isPartnerReport && calculation
      ? printBox(
          'Kumppanilaskutus',
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
                    ${calculation.byUser
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
                calculation.byUser
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
    customerCalculation &&
    customerCalculation.byUser.some((user) => user.lines.some((line) => line.included))
      ? customerBillingPrintSection(customerCalculation, billingCustomerName)
      : '';

  return `<!doctype html>
<html lang="fi">
<head>
  <meta charset="utf-8" />
  <title>${esc(printTitle)}</title>
  <style>${PRINT_CSS}</style>
</head>
<body>
  <div class="work-report-print">
    ${summaryBox}
    ${detailsBox}
    ${logsBox}
    ${billingSection}
    ${customerBillingSection}
    <div class="footer">
      ${esc(meta.companyName)} • Tulostettu ${new Date().toLocaleString('fi-FI')}${showPartnerPrices ? ' • Kumppanin hinnat mukana' : ''}
    </div>
  </div>
</body>
</html>`;
}

const PRINT_CSS = `
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
  .work-report-print { padding: 0; }
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

function formatHourEntryForPrint(log: WorkReportDailyLog, showPrices: boolean) {
  return formatHourEntry(log, { showMoney: showPrices });
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

function esc(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
