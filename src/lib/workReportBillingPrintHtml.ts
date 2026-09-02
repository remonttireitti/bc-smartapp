import type { BillableCalculation } from './workReportBilling';
import { formatEuro } from './workReportBilling';
import { BILLABLE_RATES_SOURCE_LABELS } from './management';
import {
  computePartnerNetMargin,
  parseBillingQuoteSettings,
  renderBillingQuotePurchaseLinesHtml,
  type BillingQuoteSettings,
} from './workReportBillingQuote';
import { billableUsers } from './workReportPrintBillingGuards';

const LINE_KIND_LABELS: Record<string, string> = {
  hours_regular: 'Tunnit',
  hours_overtime: 'Ylitötunnit',
  hours_on_call: 'Päivystys',
  fixed_price: 'Urakka',
  commission: 'Provisio',
  expense: 'Kulu',
};

export function generatePartnerBillingHtml(input: {
  reportTitle: string;
  creatorCompanyName: string;
  ownerCompanyName: string;
  customerName: string | null;
  calculation: BillableCalculation;
  billingQuote?: BillingQuoteSettings | null;
  dailyLogs?: import('../types').WorkReportDailyLog[];
  customerCalculation?: BillableCalculation | null;
  logoUrl?: string;
}) {
  const { calculation } = input;
  const billingQuote = parseBillingQuoteSettings(input.billingQuote ?? {});
  const partnerMargin = computePartnerNetMargin(billingQuote, calculation.grandTotal, {
    logs: input.dailyLogs ?? [],
    partnerRates: calculation.ratesUsed,
    customerRates: input.customerCalculation?.ratesUsed,
    customerExtrasNet: input.customerCalculation?.quoteExtrasTotal,
  });
  const ratesSource =
    calculation.ratesSource && BILLABLE_RATES_SOURCE_LABELS[calculation.ratesSource]
      ? calculation.ratesSource
      : 'company_default';
  const ratesUsed = calculation.ratesUsed ?? {
    hourly_regular: 0,
    hourly_overtime: 0,
    hourly_on_call: 0,
  };
  const userRows = billableUsers(calculation)
    .map(
      (u) => `
      <tr>
        <td>${escapeHtml(u.userName)}</td>
        <td class="num">${formatEuro(u.hoursTotal)}</td>
        <td class="num">${formatEuro(u.expensesTotal + u.fixedTotal + (u.commissionTotal ?? 0))}</td>
        <td class="num"><strong>${formatEuro(u.subtotal)}</strong></td>
      </tr>`,
    )
    .join('');

  const detailRows = billableUsers(calculation)
    .flatMap((u) =>
      (u.lines ?? [])
        .filter((l) => l.included)
        .map(
          (l) => `
        <tr>
          <td>${escapeHtml(u.userName)}</td>
          <td>${escapeHtml(l.logDate)}</td>
          <td>${escapeHtml(LINE_KIND_LABELS[l.kind] ?? l.kind)}</td>
          <td>${escapeHtml(l.description)}</td>
          <td class="num">${l.qty}</td>
          <td class="num">${formatEuro(l.unitPrice)}</td>
          <td class="num">${formatEuro(l.total)}</td>
        </tr>`,
        ),
    )
    .join('');

  return `<!doctype html>
<html lang="fi">
<head>
  <meta charset="utf-8" />
  <title>Laskutusyhteenveto — ${escapeHtml(input.reportTitle)}</title>
  <style>
    body { font-family: system-ui, sans-serif; color: #111; margin: 24px; }
    h1 { font-size: 1.4rem; margin: 0 0 8px; }
    .meta { color: #555; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0 24px; font-size: 0.92rem; }
    th, td { border: 1px solid #ccc; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; }
    .num { text-align: right; white-space: nowrap; }
    .total { font-size: 1.1rem; margin-top: 16px; }
    .logo { max-height: 48px; margin-bottom: 12px; }
    @media print { body { margin: 12mm; } }
  </style>
</head>
<body>
  ${input.logoUrl ? `<img class="logo" src="${escapeHtml(input.logoUrl)}" alt="" />` : ''}
  <h1>Laskutusyhteenveto kumppanille</h1>
  <div class="meta">
    <div><strong>Raportti:</strong> ${escapeHtml(input.reportTitle)}</div>
    <div><strong>Laskuttaja:</strong> ${escapeHtml(input.creatorCompanyName)}</div>
    <div><strong>Laskutettava:</strong> ${escapeHtml(input.ownerCompanyName)}</div>
    ${input.customerName ? `<div><strong>Asiakas:</strong> ${escapeHtml(input.customerName)}</div>` : ''}
    <div><strong>Päiväys:</strong> ${new Date().toLocaleDateString('fi-FI')}</div>
    <div><strong>Hinta:</strong> ${escapeHtml(BILLABLE_RATES_SOURCE_LABELS[ratesSource])} — tunti ${formatEuro(ratesUsed.hourly_regular)}, ylityö ${formatEuro(ratesUsed.hourly_overtime)}, päivystys ${formatEuro(ratesUsed.hourly_on_call)}</div>
  </div>

  <h2>Yhteenveto henkilöittäin</h2>
  <table>
    <thead>
      <tr><th>Henkilö</th><th>Tunnit</th><th>Kulut / urakat</th><th>Yhteensä</th></tr>
    </thead>
    <tbody>${userRows}</tbody>
  </table>

  <h2>Rivitiedot</h2>
  <table>
    <thead>
      <tr><th>Henkilö</th><th>Päivä</th><th>Tyyppi</th><th>Kuvaus</th><th>Määrä</th><th>á hinta</th><th>Yhteensä</th></tr>
    </thead>
    <tbody>${detailRows || '<tr><td colspan="7">Ei laskutettavia rivejä.</td></tr>'}</tbody>
  </table>

  <p class="total"><strong>Laskutettava yhteensä: ${formatEuro(calculation.grandTotal)}</strong></p>
  ${
    partnerMargin
      ? `${renderBillingQuotePurchaseLinesHtml(billingQuote.purchase_lines ?? [], { escapeHtml })}
  <h2>Kate tarjouksesta</h2>
  <table>
    <tbody>
      <tr><td>Tarjoushinta (alv 0 %)</td><td class="num">${formatEuro(partnerMargin.quoteSaleNet)}</td></tr>
      <tr><td>Asennuskulut (työ + ajot + kulut)</td><td class="num">− ${formatEuro(partnerMargin.installationCostNet)}</td></tr>
      ${partnerMargin.customerExtrasNet > 0.005 ? `<tr><td>Lisälaskutus asiakkaalta</td><td class="num">+ ${formatEuro(partnerMargin.customerExtrasNet)}</td></tr>` : ''}
      ${partnerMargin.piikkiMaterialCostNet > 0.005 ? `<tr><td>Piikki-tarvikkeiden hankinta</td><td class="num">− ${formatEuro(partnerMargin.piikkiMaterialCostNet)}</td></tr>` : ''}
      <tr><td>Todellinen hankinta yhteensä (alv 0 %)</td><td class="num">− ${formatEuro(partnerMargin.actualPurchaseNet)}</td></tr>
      ${partnerMargin.extrasMarginNet > 0.005 ? `<tr><td>Lisien kate</td><td class="num">+ ${formatEuro(partnerMargin.extrasMarginNet)}</td></tr>` : ''}
      <tr><td><strong>Puhdas kate</strong></td><td class="num"><strong>${formatEuro(partnerMargin.netMarginNet)}</strong></td></tr>
    </tbody>
  </table>
  ${billingQuote.quote_title ? `<p class="meta">Tarjous: ${escapeHtml(billingQuote.quote_title)}</p>` : ''}
  ${billingQuote.notes?.trim() ? `<p class="meta">Huom: ${escapeHtml(billingQuote.notes.trim())}</p>` : ''}`
      : ''
  }
  ${
    calculation.excludedTotal > 0
      ? `<p class="meta">Ei laskutukseen: ${formatEuro(calculation.excludedTotal)} (henkilön laskutus pois käytöstä)</p>`
      : ''
  }
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
