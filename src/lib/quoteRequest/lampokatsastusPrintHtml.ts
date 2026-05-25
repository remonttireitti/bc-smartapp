import type { BrandDeliveryFeeByCategoryMap } from '../../data/devicePricingShared';
import { computeQuoteTotals } from './calculations';
import { embedUrlAsDataUrl } from './termatekAssets';
import type { QuotePrintCustomer, QuotePrintMeta } from './printHtml';
import type { QuoteRequestData } from './types';

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatDateFi(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fi-FI');
}

function formatMoneyNet(value: number): string {
  return `${(Number(value) || 0).toLocaleString('fi-FI', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} €`;
}

function formatQty(value: number): string {
  const n = Number(value) || 0;
  return n.toLocaleString('fi-FI', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function splitLines(text: string): string[] {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean);
}

export function isLampokatsastusCompany(meta: QuotePrintMeta): boolean {
  return (meta.companyName || '').toLowerCase().includes('lämpökatsastus')
    || (meta.companyName || '').toLowerCase().includes('lampokatsastus');
}

function lampokatsastusStyles(): string {
  return `
    @page { size: A4; margin: 18mm 16mm; }
    html, body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Arial, sans-serif; color: #111; font-size: 11pt; line-height: 1.35; }
    .page { page-break-after: always; break-after: page; min-height: 255mm; position: relative; }
    .page:last-child { page-break-after: auto; break-after: auto; }
    .top { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8mm; margin-bottom: 10mm; }
    .logo img { max-height: 22mm; max-width: 55mm; object-fit: contain; display: block; }
    .doc-title { text-align: center; font-size: 24pt; font-weight: 700; letter-spacing: .01em; }
    .spacer { width: 20mm; }
    .recipient { margin-bottom: 6mm; }
    .recipient .contact { font-size: 11pt; margin-bottom: 1mm; }
    .recipient .company { font-size: 11pt; font-weight: 700; }
    .intro { margin: 0 0 5mm; }
    .section-label { font-weight: 700; margin: 4mm 0 2mm; }
    .scope-list { margin: 0 0 5mm; padding-left: 6mm; }
    .scope-list li { margin: 1.5mm 0; }
    table.quote-table { width: 100%; border-collapse: collapse; margin-top: 4mm; font-size: 10.5pt; }
    table.quote-table thead th {
      background: #2f6aa8; color: #fff; padding: 2.5mm 2mm; text-align: left; font-weight: 700;
    }
    table.quote-table thead th.num, table.quote-table tbody td.num { text-align: right; white-space: nowrap; }
    table.quote-table thead th.qty, table.quote-table tbody td.qty { text-align: center; white-space: nowrap; width: 14%; }
    table.quote-table tbody td { border: 1px solid #d1d5db; padding: 2.2mm 2mm; vertical-align: top; }
    table.quote-table tbody tr:nth-child(even) td { background: #f9fafb; }
    .total-line { margin-top: 5mm; font-size: 12pt; font-weight: 700; }
    .legal { margin-top: 6mm; font-size: 10pt; line-height: 1.4; }
    .legal p { margin: 0 0 2.5mm; }
    .notice-title { font-weight: 700; margin: 5mm 0 2mm; }
    .notice-list { margin: 0 0 5mm; padding-left: 6mm; font-size: 10.5pt; }
    .notice-list li { margin: 1.2mm 0; }
    .terms-lines { margin-top: 4mm; font-size: 10.5pt; }
    .terms-lines div { margin: 1.5mm 0; }
    .signature-page { padding-top: 8mm; }
    .signature-page .doc-title { margin-bottom: 12mm; }
    .signature-block { margin-top: 4mm; font-size: 11pt; line-height: 1.5; }
    .signature-block .label { font-weight: 700; }
    .closing { margin-top: 14mm; font-size: 11pt; }
    .closing .company { font-weight: 700; margin-top: 8mm; }
    .closing .name { margin-top: 2mm; }
  `;
}

type QuoteRow = {
  desc: string;
  qtyLabel: string;
  unitNet: number;
  rowNet: number;
};

function buildQuoteRows(data: QuoteRequestData, feeMap?: BrandDeliveryFeeByCategoryMap | null): QuoteRow[] {
  const rows: QuoteRow[] = [];
  let hasTaskContent = false;

  for (const item of data.workItems) {
    const hours = Number(item.hours) || 0;
    const rate = Number(item.pricePerHour) || 0;
    const desc = item.description.trim();
    const materials = (item.materials ?? []).filter((row) => row.name.trim());
    const hasWork = Boolean(desc) || hours > 0 || rate > 0;
    if (!hasWork && materials.length === 0) continue;

    hasTaskContent = true;
    const equipmentLabel = item.equipmentName?.trim();
    const taskLabel = [desc || 'Työ', equipmentLabel].filter(Boolean).join(' — ');

    if (hours > 0 || (desc && rate > 0)) {
      rows.push({
        desc: `${taskLabel} — työ`,
        qtyLabel: hours > 0 ? `${formatQty(hours)} h` : '—',
        unitNet: rate,
        rowNet: hours * rate,
      });
    } else if (materials.length > 0) {
      rows.push({
        desc: taskLabel,
        qtyLabel: '—',
        unitNet: 0,
        rowNet: 0,
      });
    }

    for (const mat of materials) {
      const qty = Number(mat.quantity) || 0;
      const unit = Number(mat.sellPrice) || 0;
      rows.push({
        desc: `  ${mat.name.trim() || 'Tarvike'}`,
        qtyLabel: `${formatQty(qty)} kpl`,
        unitNet: unit,
        rowNet: qty * unit,
      });
    }
  }

  if (!hasTaskContent && Number(data.laborHours) > 0) {
    const hours = Number(data.laborHours);
    const rate = Number(data.laborRate) || 0;
    rows.push({
      desc: 'Työ',
      qtyLabel: `${formatQty(hours)} h`,
      unitNet: rate,
      rowNet: hours * rate,
    });
    hasTaskContent = true;
  }

  const nestedMaterialCount = data.workItems.reduce(
    (sum, item) => sum + (item.materials ?? []).filter((row) => row.name.trim()).length,
    0,
  );
  if (nestedMaterialCount === 0) {
    for (const item of data.materials) {
      const qty = Number(item.quantity) || 0;
      const unit = Number(item.sellPrice) || 0;
      const name = item.name.trim();
      if (!name && qty <= 0 && unit <= 0) continue;
      const rowNet = qty * unit;
      if (rowNet <= 0 && qty <= 0 && unit <= 0) continue;
      rows.push({
        desc: name || 'Tarvike',
        qtyLabel: `${formatQty(qty)} kpl`,
        unitNet: unit,
        rowNet,
      });
    }
  }

  if (Number(data.travelCost) > 0) {
    rows.push({
      desc: 'Matkakulut',
      qtyLabel: '1 kpl',
      unitNet: Number(data.travelCost),
      rowNet: Number(data.travelCost),
    });
  }

  const totals = computeQuoteTotals(data, feeMap ?? null);
  if (Number(totals.deviceNet) > 0.005) {
    rows.push({
      desc: [data.deviceBrand, data.deviceModel].filter(Boolean).join(' ').trim() || 'Laite / urakka',
      qtyLabel: '1 kpl',
      unitNet: totals.deviceNet,
      rowNet: totals.deviceNet,
    });
  }

  return rows;
}

function scopeBullets(data: QuoteRequestData): string[] {
  return splitLines(data.faultDescription);
}

function noticeBullets(data: QuoteRequestData): string[] {
  const custom = splitLines(data.notes);
  if (custom.length && data.faultDescription.trim()) return custom;
  return [
    'Ennen kunnossapitotoimien aloittamista tilaaja huolehtii, että kunnostuskohteisiin oltava esteetön pääsy',
    'Kaikki hinnat ilman arvonlisäveroa',
  ];
}

function kohdeLine(data: QuoteRequestData, customer: QuotePrintCustomer): string {
  const address = [customer.address, customer.city].filter(Boolean).join(' ');
  if (address) return address;
  return data.faultDescription.split(/\r?\n/)[0]?.trim() || '—';
}

function signatoryName(meta: QuotePrintMeta): string {
  return meta.settings?.quote_signatory_name?.trim() || '';
}

export function generateLampokatsastusServicePrintHtml(input: {
  data: QuoteRequestData;
  customer: QuotePrintCustomer;
  meta: QuotePrintMeta;
  feeMap?: BrandDeliveryFeeByCategoryMap | null;
  logoUrl?: string;
}) {
  const { data, customer, meta, feeMap = null, logoUrl = meta.logoUrl ?? '' } = input;
  const settings = meta.settings ?? {};
  const billing = settings.billing ?? {};
  const totals = computeQuoteTotals(data, feeMap);
  const vatRate = Number(data.vatRate) || 0;
  const vatLabel = vatRate % 1 === 0 ? `${vatRate.toFixed(0)}%` : `${vatRate.toFixed(1).replace('.', ',')}%`;
  const rows = buildQuoteRows(data, feeMap);
  const totalNet = totals.discountedNet;
  const issueDate = formatDateFi(meta.quoteDate);
  const validUntil = formatDateFi(data.validUntil);
  const intro =
    data.introText.trim()
    || 'Kiitämme tarjouspyynnöstänne ja tarjoamme teille seuraavasti:';
  const scope = scopeBullets(data);
  const notices = noticeBullets(data);
  const deliveryLine = data.deliveryTermsText.trim() || 'n. 14 arkipäivää tilauksesta';
  const paymentLine = data.paymentTermsText.trim() || billing.payment_terms || '30 pv netto';
  const phone = settings.phone?.trim() || '';
  const email = settings.email?.trim() || '';
  const signatory = signatoryName(meta);
  const customerContact = data.customerContactPerson.trim();
  const logoHtml = logoUrl
    ? `<div class="logo"><img src="${esc(logoUrl)}" alt="${esc(meta.companyName)}" /></div>`
    : `<div class="logo"><strong style="color:#2f6aa8;font-size:12pt;">${esc(meta.companyName)}</strong></div>`;

  const tableRows = rows
    .map(
      (row) => `<tr>
        <td>${esc(row.desc)}</td>
        <td class="qty">${esc(row.qtyLabel)}</td>
        <td class="num">${formatMoneyNet(row.unitNet)}</td>
        <td class="qty">${esc(vatLabel)}</td>
        <td class="num">${formatMoneyNet(row.rowNet)}</td>
      </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="fi">
<head>
  <meta charset="utf-8" />
  <title>Tarjous – ${esc(customer.name)}</title>
  <style>${lampokatsastusStyles()}</style>
</head>
<body>
  <div class="page">
    <div class="top">
      ${logoHtml}
      <div class="doc-title">Tarjous ${issueDate}</div>
      <div class="spacer"></div>
    </div>

    <div class="recipient">
      ${customerContact ? `<div class="contact">${esc(customerContact)}</div>` : ''}
      <div class="company">${esc(customer.name)}</div>
    </div>

    <p class="intro">${esc(intro).replace(/\n/g, '<br />')}</p>

    <div class="section-label">Kohde ${esc(kohdeLine(data, customer))}</div>

    ${scope.length ? `<div class="section-label">Tarjouksen sisältö</div><ul class="scope-list">${scope.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>` : ''}

    <table class="quote-table">
      <thead>
        <tr>
          <th>Kuvaus</th>
          <th class="qty">Määrä</th>
          <th class="num">à-hinta</th>
          <th class="qty">Alv 0%</th>
          <th class="num">Yhteensä alv 0%</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows || '<tr><td colspan="5">Ei rivejä</td></tr>'}
      </tbody>
    </table>

    <div class="total-line">Tarjous yhteensä ${formatMoneyNet(totalNet)}</div>

    <div class="legal">
      <p>Erillistyöt ja meistä riippumattomat työt hinnastomme mukaisesti.</p>
      <p>Myyjä pidättää itselleen oikeuden hinnanmuutokseen, mikäli sopimuksen syntymisen jälkeen on tapahtunut myyjän toiminnasta riippumattomia ja toimituksen kohteeseen vaikuttavia hankinta- tai valmistuskustannusten muutoksia, jotka perustuvat raaka-aineiden hintojen muutoksiin.</p>
    </div>

    <div class="notice-title">Huomioitavaa</div>
    <ul class="notice-list">
      ${notices.map((line) => `<li>${esc(line)}</li>`).join('')}
    </ul>

    <div class="terms-lines">
      <div><strong>Toimitusaika</strong> ${esc(deliveryLine)}</div>
      <div><strong>Maksuehto</strong> ${esc(paymentLine)}</div>
    </div>
  </div>

  <div class="page signature-page">
    <div class="doc-title">Tarjous ${issueDate}</div>
    <div class="signature-block">
      ${signatory ? `<div><span class="label">Yhteyshenkilö</span> ${esc(signatory)}</div>` : ''}
      ${phone ? `<div>${esc(phone)}</div>` : ''}
      ${email ? `<div>${esc(email)}</div>` : ''}
      <div style="margin-top:8mm;">Tarjous on voimassa ${validUntil} saakka</div>
    </div>
    <div class="closing">
      <div>Ystävällisin terveisin</div>
      <div class="company">${esc(meta.companyName)}</div>
      ${signatory ? `<div class="name">${esc(signatory)}</div>` : ''}
    </div>
  </div>
</body>
</html>`;
}

export async function prepareLampokatsastusServicePrintHtml(input: {
  data: QuoteRequestData;
  customer: QuotePrintCustomer;
  meta: QuotePrintMeta;
  feeMap?: BrandDeliveryFeeByCategoryMap | null;
}): Promise<string> {
  let logoUrl = input.meta.logoUrl ?? '';
  if (logoUrl) logoUrl = await embedUrlAsDataUrl(logoUrl);
  return generateLampokatsastusServicePrintHtml({ ...input, logoUrl });
}
