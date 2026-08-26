import { parseCompanySettings, type CompanySettings } from '../management';
import {
  QUOTE_PROJECT_TYPE_LABELS,
  QUOTE_REGION_LABELS,
  QUOTE_TYPE_LABELS,
  isPumpQuoteType,
  quoteShowsKotitalousDeduction,
  quoteVatPrintNotice,
} from './constants';
import {
  calculateDevicePurchaseNet,
  calculateDeviceSellNet,
  computeDevicePowerFitPercent,
  formatDeviceLabel,
  getDevicePricingParams,
  resolveQuoteMainDeviceForTotals,
  selectedDevices,
} from './deviceCatalog';
import {
  computeAllOptionTotals,
  computeHeatingNeedKw,
  computeKotitalousDeduction,
  computeQuoteInternalTotals,
  computeQuoteTotals,
  materialSellTotal,
  resolveIilpLaborPricingMode,
} from './calculations';
import {
  INSTALLATION_SUPPLIES_PRINT_LABEL,
  installationSuppliesSellNet,
} from './installationSupplies';
import { manualDevicePrintLabel, resolveNonPumpDeviceSellNet } from './manualDevicePricing';
import type { QuoteLine, QuoteMaterial } from './types';
import { quoteLineTotal } from './defaults';
import { optionalItemsPrintHtml } from './optionalItemsPrint';
import type { QuoteRequestData } from './types';
import type { BrandDeliveryFeeByCategoryMap } from '../../data/devicePricingShared';

export type QuotePrintMode = 'enduser' | 'creator';

export type QuotePrintMeta = {
  companyName: string;
  logoUrl?: string;
  settings?: CompanySettings;
  quoteNumber?: string;
  quoteDate?: string;
};

export type QuotePrintCustomer = {
  name: string;
  address?: string | null;
  city?: string | null;
};

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** img src — älä muuta &-merkkejä (signed URL). */
function attrUrl(url: string): string {
  return String(url).replace(/"/g, '&quot;');
}

function formatEuro(value: number): string {
  return new Intl.NumberFormat('fi-FI', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function formatDateFi(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fi-FI');
}

function smartappFallbackLogoSvg(companyName: string): string {
  const label = companyName.slice(0, 24);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="56" viewBox="0 0 220 56">
    <rect width="220" height="56" rx="8" fill="#0f172a"/>
    <text x="110" y="34" fill="#ffffff" font-family="Segoe UI, Arial, sans-serif" font-size="16" font-weight="700" text-anchor="middle">${label}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function quotePrintStyles(): string {
  return `
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", Arial, sans-serif;
      color: #0f172a;
      font-size: 11px;
      line-height: 1.45;
    }
    .page { max-width: 180mm; margin: 0 auto; }
    .header {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      align-items: start;
      margin-bottom: 18px;
      padding-bottom: 12px;
      border-bottom: 2px solid #f97316;
    }
    .logo img { max-height: 56px; max-width: 220px; object-fit: contain; }
    .company-meta { text-align: right; color: #475569; font-size: 10px; }
    .title-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }
    .title-row h1 {
      margin: 0;
      font-size: 22px;
      color: #0f172a;
    }
    .meta-box {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 10px 12px;
      min-width: 170px;
      background: #f8fafc;
    }
    .meta-box div { margin-bottom: 4px; }
    .customer-box, .device-box {
      margin-bottom: 14px;
      padding: 10px 12px;
      background: #fff7ed;
      border: 1px solid #fdba74;
      border-radius: 8px;
    }
    .intro { margin: 0 0 12px; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10px;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 7px 8px;
      vertical-align: top;
    }
    th {
      background: #f1f5f9;
      text-align: left;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: .03em;
    }
    .num { text-align: right; white-space: nowrap; }
    .line-sub { color: #64748b; font-size: 10px; margin-top: 2px; }
    .total-row td {
      font-weight: 700;
      background: #fff7ed;
      border-top: 2px solid #f97316;
    }
    .task-section-header td {
      background: #e2e8f0;
      font-weight: 700;
      border-top: 2px solid #94a3b8;
    }
    .task-section-header:first-child td {
      border-top: 1px solid #cbd5e1;
    }
    .notes, .sitrep-wrap {
      margin-top: 12px;
      padding: 10px 12px;
      border-left: 3px solid #f97316;
      background: #f8fafc;
    }
    .sitrep-title { font-weight: 700; margin-bottom: 6px; }
    .sitrep-meta { color: #64748b; font-size: 10px; margin-bottom: 8px; }
    .sitrep-body { min-height: 48px; white-space: pre-wrap; }
    .terms {
      margin-top: 16px;
      padding-top: 10px;
      border-top: 1px solid #cbd5e1;
      font-size: 9px;
      color: #475569;
    }
    .terms-title { font-weight: 700; color: #0f172a; margin-bottom: 4px; }
    .option-card {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 8px;
      background: #f8fafc;
    }
    .option-sub { color: #64748b; font-size: 10px; margin: 4px 0; }
    .option-compare { margin: 14px 0; }
    .option-compare h2 { margin: 0 0 8px; font-size: 14px; }
    .option-compare-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; }
    .option-compare-card {
      border: 1px solid #fdba74;
      border-radius: 8px;
      padding: 10px;
      background: #fff7ed;
      text-align: center;
    }
    .option-compare-price { font-size: 16px; font-weight: 700; margin-top: 6px; color: #c2410c; }
    .creator-badge {
      display: inline-block;
      margin-bottom: 10px;
      padding: 4px 10px;
      border-radius: 999px;
      background: #0f172a;
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    .summary-row td {
      font-weight: 600;
      background: #f8fafc;
    }
    .summary-row.profit td {
      background: #ecfdf5;
      color: #047857;
      border-top: 2px solid #34d399;
    }
    .summary-row.purchase td { color: #475569; }
    .mutual-billing-box {
      margin: 14px 0 0;
      padding: 12px 14px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #f8fafc;
    }
    .mutual-billing-title {
      font-weight: 700;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .04em;
      margin-bottom: 8px;
      color: #334155;
    }
    .mutual-billing-grid {
      margin: 0;
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 4px 12px;
      font-size: 11px;
    }
    .mutual-billing-grid dt { color: #64748b; margin: 0; }
    .mutual-billing-grid dd { margin: 0; }
    .print-enduser .col-internal { display: none; }
    .vat-notice {
      margin: 0 0 12px;
      padding: 8px 12px;
      background: #f0fdf4;
      border: 1px solid #86efac;
      border-radius: 8px;
      font-size: 10px;
      font-weight: 600;
      color: #166534;
    }
  `;
}

const QUOTE_TABLE_COLSPAN = 5;

function quoteHasVat(vatRate: number): boolean {
  return Number(vatRate) > 0;
}

function quoteTotalRowLabel(vatRate: number): string {
  return quoteHasVat(vatRate) ? `Tarjous yhteensä (sis. ALV ${vatRate}%)` : 'Tarjous yhteensä (alv 0 %)';
}

function quoteVatNoticeHtml(vatRate: number): string {
  return `<p class="vat-notice">${esc(quoteVatPrintNotice(vatRate))}</p>`;
}

function quotePrintTableHead(mode: QuotePrintMode): string {
  if (mode === 'creator') {
    return `<thead>
      <tr>
        <th>Kuvaus</th>
        <th class="num">Määrä</th>
        <th class="num col-internal">Hankinta</th>
        <th class="num">Myynti</th>
        <th class="num col-internal">Kate</th>
      </tr>
    </thead>`;
  }
  return `<thead>
    <tr>
      <th>Kuvaus</th>
      <th class="num">Määrä</th>
      <th class="num col-internal">Hankinta</th>
      <th class="num">á-hinta</th>
      <th class="num">Yhteensä</th>
    </tr>
  </thead>`;
}

function printSummedMaterialsRow(
  materials: QuoteMaterial[],
  mode: QuotePrintMode,
  label = INSTALLATION_SUPPLIES_PRINT_LABEL,
): string {
  const rows = materials.filter((row) => row.name.trim());
  if (rows.length === 0) return '';
  if (mode === 'creator') {
    return rows.map((row) => printMaterialRow(row, mode)).join('');
  }
  const totalSell = materialSellTotal(rows);
  if (totalSell <= 0.005) return '';
  return printWorkRow(label, '1 kpl', totalSell, totalSell, mode);
}

function printMaterialRow(mat: QuoteMaterial, mode: QuotePrintMode): string {
  const qty = Number(mat.quantity) || 0;
  const purchase = qty * (Number(mat.purchasePrice) || 0);
  const sell = qty * (Number(mat.sellPrice) || 0);
  const unitSell = Number(mat.sellPrice) || 0;
  const margin = sell - purchase;
  const marginPct = sell > 0 ? Math.round((margin / sell) * 1000) / 10 : 0;
  if (mode === 'enduser') {
    return `<tr>
      <td>${esc(mat.name)}</td>
      <td class="num">${esc(qty)} kpl</td>
      <td class="num col-internal"></td>
      <td class="num">${formatEuro(unitSell)}</td>
      <td class="num">${formatEuro(sell)}</td>
    </tr>`;
  }
  return `<tr>
    <td>${esc(mat.name)}</td>
    <td class="num">${esc(qty)} kpl</td>
    <td class="num col-internal">${formatEuro(purchase)}</td>
    <td class="num">${formatEuro(sell)}</td>
    <td class="num col-internal">${formatEuro(margin)}<div class="line-sub">${marginPct}%</div></td>
  </tr>`;
}

function printWorkRow(
  label: string,
  qtyLabel: string,
  unitSell: number,
  lineSell: number,
  mode: QuotePrintMode,
): string {
  if (mode === 'enduser') {
    return `<tr>
      <td>${esc(label)}</td>
      <td class="num">${esc(qtyLabel)}</td>
      <td class="num col-internal"></td>
      <td class="num">${formatEuro(unitSell)}</td>
      <td class="num">${formatEuro(lineSell)}</td>
    </tr>`;
  }
  return `<tr>
    <td>${esc(label)}</td>
    <td class="num">${esc(qtyLabel)}</td>
    <td class="num col-internal">—</td>
    <td class="num">${formatEuro(lineSell)}</td>
    <td class="num col-internal">${formatEuro(lineSell)}</td>
  </tr>`;
}

function printDeviceRow(
  labelHtml: string,
  mode: QuotePrintMode,
  input: { purchase: number; sell: number; marginPct?: number },
): string {
  const margin = input.sell - input.purchase;
  if (mode === 'enduser') {
    return `<tr>
      <td>${labelHtml}</td>
      <td class="num">1 kpl</td>
      <td class="num col-internal"></td>
      <td class="num">${formatEuro(input.sell)}</td>
      <td class="num">${formatEuro(input.sell)}</td>
    </tr>`;
  }
  const pctNote =
    input.marginPct != null ? `<div class="line-sub">${input.marginPct}%</div>` : '';
  return `<tr>
    <td>${labelHtml}</td>
    <td class="num">1 kpl</td>
    <td class="num col-internal">${formatEuro(input.purchase)}</td>
    <td class="num">${formatEuro(input.sell)}</td>
    <td class="num col-internal">${formatEuro(margin)}${pctNote}</td>
  </tr>`;
}

function printLegacyLineRow(line: QuoteLine, mode: QuotePrintMode): string {
  const equipment = line.equipmentName ? `<div class="line-sub">${esc(line.equipmentName)}</div>` : '';
  const total = quoteLineTotal(line);
  if (mode === 'enduser') {
    return `<tr>
      <td>${esc(line.description)}${equipment}</td>
      <td class="num">${esc(line.qty)} ${esc(line.unit)}</td>
      <td class="num col-internal"></td>
      <td class="num">${formatEuro(line.unitPrice)}</td>
      <td class="num">${formatEuro(total)}</td>
    </tr>`;
  }
  return `<tr>
    <td>${esc(line.description)}${equipment}</td>
    <td class="num">${esc(line.qty)} ${esc(line.unit)}</td>
    <td class="num col-internal">—</td>
    <td class="num">${formatEuro(total)}</td>
    <td class="num col-internal">${formatEuro(total)}</td>
  </tr>`;
}

function quoteCreatorMutualBillingBox(
  internal: ReturnType<typeof computeQuoteInternalTotals>,
  totalRowLabel: string,
): string {
  const customerTotal = quoteHasVat(internal.vatRate)
    ? formatEuro(internal.grossTotal)
    : formatEuro(internal.discountedSellNet);
  return `<section class="mutual-billing-box">
    <div class="mutual-billing-title">Keskinäinen laskutus (kumppanille / sisäinen)</div>
    <dl class="mutual-billing-grid">
      <dt>Asiakkaalta laskutettava (tarjoushinta)</dt>
      <dd><strong>${customerTotal}</strong> <span class="line-sub">${esc(totalRowLabel)}</span></dd>
      <dt>Hankinta / kustannus</dt>
      <dd>${formatEuro(internal.purchaseNet)}</dd>
      ${
        internal.deviceSellNet > 0.005
          ? `<dt>Laite (myynti / hankinta / kate)</dt>
      <dd>${formatEuro(internal.deviceSellNet)} / ${formatEuro(internal.devicePurchaseNet)} / <strong>${formatEuro(internal.deviceMarginNet)}</strong></dd>`
          : ''
      }
      <dt>Kate</dt>
      <dd>${formatEuro(internal.marginNet)} <span class="line-sub">(${internal.marginPercent.toLocaleString('fi-FI', { maximumFractionDigits: 1 })} % myynnistä)</span></dd>
    </dl>
  </section>`;
}

function creatorSummaryFooter(
  internal: ReturnType<typeof computeQuoteInternalTotals>,
  totalRowLabel: string,
): string {
  const discountNote =
    internal.discountPercent > 0
      ? `<tr class="summary-row"><td colspan="4">Alennus ${internal.discountPercent}%</td><td class="num">−${formatEuro(internal.sellNet - internal.discountedSellNet)}</td></tr>`
      : '';
  const vatRow = quoteHasVat(internal.vatRate)
    ? `<tr class="summary-row"><td colspan="4">ALV ${internal.vatRate}%</td><td class="num">${formatEuro(internal.vatAmount)}</td></tr>`
    : '';
  const customerTotal = quoteHasVat(internal.vatRate)
    ? formatEuro(internal.grossTotal)
    : formatEuro(internal.discountedSellNet);
  const netLabel = quoteHasVat(internal.vatRate) ? 'Myynti yhteensä (veroton)' : 'Myynti yhteensä (alv 0 %)';
  return `${discountNote}
    <tr class="summary-row"><td colspan="4">${netLabel}</td><td class="num">${formatEuro(internal.discountedSellNet)}</td></tr>
    <tr class="summary-row purchase"><td colspan="4">Hankinta yhteensä</td><td class="num">${formatEuro(internal.purchaseNet)}</td></tr>
    ${
      internal.deviceSellNet > 0.005
        ? `<tr class="summary-row device-profit"><td colspan="4">Laite: kate erikseen</td><td class="num">${formatEuro(internal.deviceMarginNet)}<div class="line-sub">myynti ${formatEuro(internal.deviceSellNet)} − hankinta ${formatEuro(internal.devicePurchaseNet)}</div></td></tr>`
        : ''
    }
    <tr class="summary-row profit"><td colspan="4">Kate / tuotto (viivan päälle)</td><td class="num">${formatEuro(internal.marginNet)}<div class="line-sub">${internal.marginPercent.toLocaleString('fi-FI', { maximumFractionDigits: 1 })} % myynnistä</div></td></tr>
    ${vatRow}
    <tr class="total-row"><td colspan="4">${esc(totalRowLabel)}</td><td class="num">${customerTotal}</td></tr>`;
}

function enduserSummaryFooter(
  totals: ReturnType<typeof computeQuoteTotals>,
  totalRowLabel: string,
  vatRate: number,
): string {
  const amount = quoteHasVat(vatRate) ? totals.grossTotal : totals.discountedNet;
  return `<tr class="total-row">
    <td colspan="4">${esc(totalRowLabel)}</td>
    <td class="num">${formatEuro(amount)}</td>
  </tr>`;
}

function quotePrintTableFooter(
  mode: QuotePrintMode,
  input: {
    data: QuoteRequestData;
    totals: ReturnType<typeof computeQuoteTotals>;
    internal: ReturnType<typeof computeQuoteInternalTotals> | null;
    totalRowLabel: string;
  },
): string {
  if (mode === 'creator' && input.internal) {
    return creatorSummaryFooter(input.internal, input.totalRowLabel);
  }
  return enduserSummaryFooter(
    input.totals,
    input.totalRowLabel,
    Number(input.data.vatRate) > 0 ? Number(input.data.vatRate) : 0,
  );
}

function buildSituationReportHtml(data: QuoteRequestData): string {
  if (!data.situationReportEnabled) return '';
  const title = data.situationReportTitle.trim() || 'Tilanneraportti';
  const body = data.situationReportText.trim();
  return `<div class="sitrep-wrap">
    <div class="sitrep-title">${esc(title)}</div>
    <div class="sitrep-body">${body ? esc(body).replace(/\n/g, '<br />') : '&nbsp;'}</div>
  </div>`;
}

function printInstallationSuppliesRows(data: QuoteRequestData, mode: QuotePrintMode): string {
  const items = (data.installationSupplies ?? []).filter((row) => row.name.trim());
  const totalSell = installationSuppliesSellNet(items);
  if (totalSell <= 0.005) return '';

  if (mode === 'creator') {
    return items.map((row) => printMaterialRow(row, mode)).join('');
  }
  return printWorkRow(INSTALLATION_SUPPLIES_PRINT_LABEL, '1 kpl', totalSell, totalSell, mode);
}

function iilpBaseInstallRows(data: QuoteRequestData, mode: QuotePrintMode = 'enduser'): string {
  const base = computeQuoteTotals(data).iilpBaseInstall;
  if (!base.enabled) return '';
  const rows: string[] = [];
  if (base.laborNet > 0.01) {
    rows.push(
      printWorkRow('Ilmalämpöpumpun perusasennus – työn osuus', '1 kpl', base.laborNet, base.laborNet, mode),
    );
  }
  if (base.materialsNet > 0.01) {
    rows.push(
      printWorkRow('Ilmalämpöpumpun perusasennus – tarvikkeet', '1 kpl', base.materialsNet, base.materialsNet, mode),
    );
  }
  return rows.join('');
}

function companyContactBlock(meta: QuotePrintMeta): string {
  const settings = meta.settings ?? {};
  const billing = settings.billing ?? {};
  const lines = [
    settings.address,
    [settings.postal_code, settings.city].filter(Boolean).join(' '),
    settings.phone ? `Puh. ${settings.phone}` : '',
    settings.email,
    settings.website,
    billing.business_id ? `Y-tunnus ${billing.business_id}` : '',
  ].filter(Boolean);

  return lines.map((line) => `<div>${esc(line)}</div>`).join('');
}

export function generateQuoteOfferPrintHtml(input: {
  data: QuoteRequestData;
  customer: QuotePrintCustomer;
  meta: QuotePrintMeta;
  mode?: QuotePrintMode;
  feeMap?: BrandDeliveryFeeByCategoryMap | null;
}) {
  const { data, customer, meta, mode = 'enduser', feeMap = null } = input;
  const totals = computeQuoteTotals(data, feeMap);
  const internal = mode === 'creator' ? computeQuoteInternalTotals(data, feeMap) : null;
  const logo = meta.logoUrl || smartappFallbackLogoSvg(meta.companyName);
  const customerAddress = [customer.address, customer.city].filter(Boolean).join(', ');
  const vatRate = Number(data.vatRate) || 0;
  const totalRowLabel = quoteTotalRowLabel(vatRate);

  const isIilpUrakka = data.type === 'ilma-ilma' && resolveIilpLaborPricingMode(data) === 'urakka';

  const workRows = isIilpUrakka
    ? ''
    : data.workItems
        .filter((item) => item.description.trim() && Number(item.hours) > 0)
        .map((item) => {
          const sell = item.hours * item.pricePerHour;
          return printWorkRow(item.description, `${item.hours} h`, item.pricePerHour, sell, mode);
        })
        .join('');

  const materialRows = data.materials
    .filter((item) => item.name.trim())
    .map((item) => printMaterialRow(item, mode))
    .join('');

  const legacyLineRows = (data.lines ?? [])
    .filter((line) => line.description.trim() || line.qty || line.unitPrice)
    .map((line) => printLegacyLineRow(line, mode))
    .join('');

  const heatingNeedKw = isPumpQuoteType(data.type) ? computeHeatingNeedKw(data) : null;

  const deviceRows = isPumpQuoteType(data.type)
    ? (() => {
        const rows = selectedDevices(data)
          .map(({ key, device }) => {
            const sell = calculateDeviceSellNet(data, device, feeMap);
            const purchase = calculateDevicePurchaseNet(data, device, feeMap);
            const { marginPct } = getDevicePricingParams(data, device);
            const label = `<strong>Vaihtoehto ${key}</strong><br />${esc(formatDeviceLabel(device))}`;
            return printDeviceRow(label, mode, { purchase, sell, marginPct });
          })
          .join('');
        if (rows) return rows;
        const mainDevice = resolveQuoteMainDeviceForTotals(data, heatingNeedKw);
        if (!mainDevice) return '';
        const sell = totals.deviceNet;
        const purchase = calculateDevicePurchaseNet(data, mainDevice, feeMap);
        const { marginPct } = getDevicePricingParams(data, mainDevice);
        const label = esc(formatDeviceLabel(mainDevice));
        return printDeviceRow(label, mode, { purchase, sell, marginPct });
      })()
    : resolveNonPumpDeviceSellNet(data) > 0.005
      ? printDeviceRow(esc(manualDevicePrintLabel(data)), mode, {
          purchase: Number(data.devicePurchaseOverrideNet ?? 0),
          sell: resolveNonPumpDeviceSellNet(data),
          marginPct: Number(data.deviceMarginPercent) || undefined,
        })
      : '';

  const lineRows = `${workRows}${materialRows}${legacyLineRows}${printInstallationSuppliesRows(data, mode)}`;
  const tableBody = `${lineRows}${iilpBaseInstallRows(data, mode)}${deviceRows}`;

  const kotitalous =
    mode === 'enduser' && quoteShowsKotitalousDeduction(data.type)
      ? computeKotitalousDeduction(data)
      : null;
  const optionTotals = computeAllOptionTotals(data, feeMap);
  const optionCompareHtml =
    optionTotals.length > 1
      ? `<section class="option-compare">
          <h2>Vaihtoehtojen vertailu</h2>
          <div class="option-compare-grid">
            ${optionTotals
              .map(({ key, device, totals: opt }) => {
                const pct = computeDevicePowerFitPercent(heatingNeedKw, device);
                return `<div class="option-compare-card">
                  <strong>Vaihtoehto ${key}</strong>
                  <div>${esc(device.name)}</div>
                  ${pct != null ? `<div class="option-sub">Teho ${device.heatingPowerMax} kW (${pct}% tarpeesta)</div>` : ''}
                  <div class="option-compare-price">${formatEuro(quoteHasVat(vatRate) ? opt!.grossTotal : opt!.discountedNet)}</div>
                  ${quoteHasVat(vatRate) ? `<div class="option-sub">sis. ALV ${vatRate}%</div>` : '<div class="option-sub">alv 0 %</div>'}
                </div>`;
              })
              .join('')}
          </div>
        </section>`
      : '';
  const optionCards = selectedDevices(data)
    .map(({ key, device }) => {
      const good =
        key === 'A' ? data.optionAGood : key === 'B' ? data.optionBGood : data.optionCGood;
      const bad = key === 'A' ? data.optionABad : key === 'B' ? data.optionBBad : data.optionCBad;
      const hMax = device.heatingPowerMax;
      const pct =
        heatingNeedKw && heatingNeedKw > 0
          ? Math.min(100, Math.round((hMax / heatingNeedKw) * 100))
          : null;
      return `<div class="option-card">
        <strong>Vaihtoehto ${key}: ${esc(device.name)}</strong>
        ${pct != null ? `<div class="option-sub">Tehotarve ${heatingNeedKw} kW, laite max ${hMax} kW (${pct}%)</div>` : ''}
        ${good ? `<div><strong>Hyvää:</strong> ${esc(good)}</div>` : ''}
        ${bad ? `<div><strong>Huomioitavaa:</strong> ${esc(bad)}</div>` : ''}
      </div>`;
    })
    .join('');

  const kotitalousHtml =
    kotitalous && kotitalous.laborOnlyGross > 0
      ? `<div class="notes">
          <strong>${esc(kotitalous.label)}</strong>
          <div>${formatEuro(kotitalous.onePerson)}${
            kotitalous.withSpouse > kotitalous.onePerson
              ? ` (kahdella yhteensä enintään ${formatEuro(kotitalous.withSpouse)})`
              : ''
          }</div>
          <div class="option-sub">Laskettu työn osuudesta ${formatEuro(kotitalous.laborOnlyGross)} (sis. ALV), ${(kotitalous.percent * 100).toFixed(0)}%, enintään ${formatEuro(kotitalous.maxPerPerson)} / hlö.</div>
        </div>`
      : '';

  return `<!DOCTYPE html>
<html lang="fi">
<head>
  <meta charset="utf-8" />
  <title>Tarjous – ${esc(customer.name)}</title>
  <style>${quotePrintStyles()}</style>
</head>
<body class="print-${mode}">
  <div class="page">
    <header class="header">
      <div class="logo"><img src="${attrUrl(logo)}" alt="${esc(meta.companyName)}" /></div>
      <div class="company-meta">
        <strong>${esc(meta.companyName)}</strong>
        ${companyContactBlock(meta)}
      </div>
    </header>

    <div class="title-row">
      <h1>Tarjous${mode === 'creator' ? ' — sisäinen laskenta' : ''}</h1>
      <div class="meta-box">
        <div><strong>Päivä:</strong> ${formatDateFi(meta.quoteDate)}</div>
        <div><strong>Voimassa:</strong> ${formatDateFi(data.validUntil)}</div>
        ${meta.quoteNumber ? `<div><strong>Numero:</strong> ${esc(meta.quoteNumber)}</div>` : ''}
      </div>
    </div>

    ${mode === 'creator' ? '<div class="creator-badge">Sisäinen — hankinta ja kate</div>' : ''}

    <section class="customer-box">
      <strong>Asiakas</strong>
      <div>${esc(customer.name)}</div>
      ${customerAddress ? `<div>${esc(customerAddress)}</div>` : ''}
    </section>

    ${data.introText.trim() ? `<p class="intro">${esc(data.introText).replace(/\n/g, '<br />')}</p>` : ''}

    ${heatingNeedKw != null ? `<p class="intro"><strong>Laskettu lämmitystarve:</strong> ${heatingNeedKw} kW</p>` : ''}

    ${quoteVatNoticeHtml(vatRate)}

    <table>
      ${quotePrintTableHead(mode)}
      <tbody>
        ${tableBody ? tableBody : `<tr><td colspan="${QUOTE_TABLE_COLSPAN}">Ei rivejä</td></tr>`}
        ${quotePrintTableFooter(mode, { data, totals, internal, totalRowLabel })}
      </tbody>
    </table>

    ${mode === 'creator' && internal ? quoteCreatorMutualBillingBox(internal, totalRowLabel) : ''}

    ${optionCompareHtml}

    ${optionCards ? `<section>${optionCards}</section>` : ''}

    ${optionalItemsPrintHtml(data)}

    ${data.notes.trim() ? `<div class="notes"><strong>Huomautukset</strong><div>${esc(data.notes).replace(/\n/g, '<br />')}</div></div>` : ''}

    ${kotitalousHtml}

    <section class="terms">
      <div class="terms-title">${esc(meta.companyName)} – Takuut, huolto ja asennusehdot</div>
      <div>Tämä tarjous on suuntaa-antava. Hinnat ovat voimassa tarjouksen voimassaoloaikana ellei toisin mainita.
      Työhön sisältyvät materiaalit ja tuntityöt kuten eritelty. Asennus- ja huoltotyöt suoritetaan alan hyvän
      työtavan mukaisesti. Takuuehdot ja mahdolliset lisätyöt sovitaan erikseen ennen tilausta.</div>
    </section>
  </div>
</body>
</html>`;
}

export function generateQuoteHeatCalcPrintHtml(input: {
  data: QuoteRequestData;
  customer: QuotePrintCustomer;
  meta: QuotePrintMeta;
}) {
  const { data, customer, meta } = input;
  const heatingNeedKw = computeHeatingNeedKw(data);
  const logo = meta.logoUrl || smartappFallbackLogoSvg(meta.companyName);

  return `<!DOCTYPE html>
<html lang="fi">
<head>
  <meta charset="utf-8" />
  <title>Lämmityslaskelma – ${esc(customer.name)}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    body { font-family: "Segoe UI", Arial, sans-serif; font-size: 11px; color: #0f172a; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #f97316; padding-bottom: 10px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
    th { background: #f1f5f9; width: 45%; }
    .result { font-size: 22px; font-weight: 700; color: #c2410c; margin: 16px 0; }
  </style>
</head>
<body>
  <div class="header">
    <div><img src="${attrUrl(logo)}" alt="" style="max-height:48px" /></div>
    <div style="text-align:right"><strong>${esc(meta.companyName)}</strong><br />${formatDateFi(meta.quoteDate)}</div>
  </div>
  <h1 style="margin:0 0 8px">Lämmitystarvelaskelma</h1>
  <p><strong>Asiakas:</strong> ${esc(customer.name)}</p>
  <table>
    <tr><th>Pinta-ala</th><td>${data.heatedArea} m²</td></tr>
    <tr><th>Rakennusvuosi</th><td>${data.buildingYear}</td></tr>
    <tr><th>Alue</th><td>${esc(QUOTE_REGION_LABELS[data.region])}</td></tr>
    <tr><th>Projekti</th><td>${esc(QUOTE_PROJECT_TYPE_LABELS[data.projectType])}</td></tr>
    <tr><th>Lämmitysjärjestelmä</th><td>${esc(data.heatingSystemType)} (${data.heatingSystemTemp}°C)</td></tr>
    <tr><th>Käyttövesi</th><td>${data.domesticHotWater ? `${data.householdSize} hlö mukana` : 'Ei'}</td></tr>
    <tr><th>Nykyinen lämmitys</th><td>${esc(data.currentHeating)}</td></tr>
    ${data.previousConsumption > 0 ? `<tr><th>Edellinen kulutus</th><td>${data.previousConsumption} ${data.previousConsumptionUnit === 'litraa' ? 'l/v' : 'kWh/v'}</td></tr>` : ''}
  </table>
  <div class="result">Laskettu huipputehotarve: ${heatingNeedKw} kW</div>
  <p style="color:#64748b">Laskelma on suuntaa-antava mitoitusarvio. Lopullinen laitevalinta tehdään kohteen perusteella.</p>
</body>
</html>`;
}

function buildServiceTaskPrintRows(data: QuoteRequestData, mode: QuotePrintMode): string {
  const sections: string[] = [];
  let hasTaskContent = false;

  for (const item of data.workItems) {
    const desc = item.description.trim();
    const hours = Number(item.hours) || 0;
    const rate = Number(item.pricePerHour) || 0;
    const materials = (item.materials ?? []).filter((row) => row.name.trim());
    const hasWork = Boolean(desc) || hours > 0 || rate > 0;
    if (!hasWork && materials.length === 0) continue;

    hasTaskContent = true;
    const header = desc || 'Työ';
    const equipmentLabel = item.equipmentName?.trim() || '';
    const equipmentSuffix = equipmentLabel
      ? `<span class="line-sub"> — ${esc(equipmentLabel)}</span>`
      : '';

    sections.push(
      `<tr class="task-section-header"><td colspan="${QUOTE_TABLE_COLSPAN}"><strong>${esc(header)}</strong>${equipmentSuffix}</td></tr>`,
    );

    if (hours > 0 || (desc && rate > 0)) {
      const sell = hours * rate;
      sections.push(printWorkRow(`${desc || 'Työ'} — työ`, `${hours} h`, rate, sell, mode));
    }

    sections.push(printSummedMaterialsRow(materials, mode));
  }

  if (!hasTaskContent && Number(data.laborHours) > 0) {
    const hours = Number(data.laborHours);
    const rate = Number(data.laborRate) || 0;
    const sell = hours * rate;
    sections.push(printWorkRow('Työ', `${hours} h`, rate, sell, mode));
    hasTaskContent = true;
  }

  const nestedMaterialCount = data.workItems.reduce(
    (sum, item) => sum + (item.materials ?? []).filter((row) => row.name.trim()).length,
    0,
  );
  if (nestedMaterialCount === 0) {
    sections.push(printSummedMaterialsRow(data.materials, mode));
  }

  sections.push(printInstallationSuppliesRows(data, mode));

  const deviceSell = resolveNonPumpDeviceSellNet(data);
  if (deviceSell > 0.005) {
    const purchase = Number(data.devicePurchaseOverrideNet) || 0;
    const label = esc(manualDevicePrintLabel(data));
    if (mode === 'creator' && purchase > 0.005) {
      sections.push(
        printDeviceRow(label, mode, {
          purchase,
          sell: deviceSell,
          marginPct: Number(data.deviceMarginPercent) || undefined,
        }),
      );
    } else {
      sections.push(printWorkRow(manualDevicePrintLabel(data), '1 kpl', deviceSell, deviceSell, mode));
    }
  }

  return sections.join('');
}

export function generateQuoteServicePrintHtml(input: {
  data: QuoteRequestData;
  customer: QuotePrintCustomer;
  meta: QuotePrintMeta;
  mode?: QuotePrintMode;
  feeMap?: BrandDeliveryFeeByCategoryMap | null;
}) {
  const { data, customer, meta, mode = 'enduser' } = input;
  const totals = computeQuoteTotals(data, input.feeMap ?? null);
  const internal = mode === 'creator' ? computeQuoteInternalTotals(data, input.feeMap ?? null) : null;
  const logo = meta.logoUrl || smartappFallbackLogoSvg(meta.companyName);
  const customerAddress = [customer.address, customer.city].filter(Boolean).join(', ');
  const docTitle = QUOTE_TYPE_LABELS[data.type] || 'Tarjous';
  const vatRate = Number(data.vatRate) || 0;
  const totalRowLabel = quoteTotalRowLabel(vatRate);

  const workRows = buildServiceTaskPrintRows(data, mode);

  const deviceLabel = [data.deviceBrand, data.deviceModel].filter(Boolean).join(' ').trim();
  const deviceBox = deviceLabel
    ? `<section class="device-box">
        <strong>Laite</strong>
        <div>${esc(deviceLabel)}</div>
        ${data.faultDescription.trim() ? `<div class="line-sub">${esc(data.faultDescription).replace(/\n/g, '<br />')}</div>` : ''}
      </section>`
    : data.faultDescription.trim()
      ? `<section class="device-box">
          <strong>Työnkuvaus</strong>
          <div>${esc(data.faultDescription).replace(/\n/g, '<br />')}</div>
        </section>`
      : '';

  const tableBody = workRows || '';
  return `<!DOCTYPE html>
<html lang="fi">
<head>
  <meta charset="utf-8" />
  <title>${esc(docTitle)} – ${esc(customer.name)}</title>
  <style>${quotePrintStyles()}</style>
</head>
<body class="print-${mode}">
  <div class="page">
    <header class="header">
      <div class="logo"><img src="${attrUrl(logo)}" alt="${esc(meta.companyName)}" /></div>
      <div class="company-meta">
        <strong>${esc(meta.companyName)}</strong>
        ${companyContactBlock(meta)}
      </div>
    </header>

    <div class="title-row">
      <h1>${esc(docTitle)}${mode === 'creator' ? ' — sisäinen laskenta' : ''}</h1>
      <div class="meta-box">
        <div><strong>Päivä:</strong> ${formatDateFi(meta.quoteDate)}</div>
        <div><strong>Voimassa:</strong> ${formatDateFi(data.validUntil)}</div>
        ${meta.quoteNumber ? `<div><strong>Numero:</strong> ${esc(meta.quoteNumber)}</div>` : ''}
      </div>
    </div>

    ${mode === 'creator' ? '<div class="creator-badge">Sisäinen — hankinta ja kate</div>' : ''}

    <section class="customer-box">
      <strong>Asiakas</strong>
      <div>${esc(customer.name)}</div>
      ${customerAddress ? `<div>${esc(customerAddress)}</div>` : ''}
    </section>

    ${deviceBox}

    ${data.introText.trim() ? `<p class="intro">${esc(data.introText).replace(/\n/g, '<br />')}</p>` : ''}

    ${buildSituationReportHtml(data)}

    ${quoteVatNoticeHtml(vatRate)}

    <table>
      ${quotePrintTableHead(mode)}
      <tbody>
        ${tableBody || `<tr><td colspan="${QUOTE_TABLE_COLSPAN}">Ei rivejä</td></tr>`}
        ${quotePrintTableFooter(mode, { data, totals, internal, totalRowLabel })}
      </tbody>
    </table>

    ${mode === 'creator' && internal ? quoteCreatorMutualBillingBox(internal, totalRowLabel) : ''}

    ${data.notes.trim() ? `<div class="notes"><strong>Huomautukset</strong><div>${esc(data.notes).replace(/\n/g, '<br />')}</div></div>` : ''}

    <section class="terms">
      <div class="terms-title">${esc(meta.companyName)} – Huoltoehdot</div>
      <div>Työ suoritetaan alan hyvän työtavan mukaisesti. Hinnat sisältävät tarjouksessa eritellyt työt ja materiaalit.
      Lisätyöt ja odottamattomat vauriot sovitaan erikseen ennen jatkotoimenpiteitä.</div>
    </section>
  </div>
</body>
</html>`;
}

export function parseCompanySettingsFromRow(settings: unknown): CompanySettings {
  return parseCompanySettings(settings);
}
