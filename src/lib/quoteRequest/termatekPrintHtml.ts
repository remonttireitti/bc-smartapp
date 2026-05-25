import type { BrandDeliveryFeeByCategoryMap } from '../../data/devicePricingShared';
import type { HeatPumpDevice } from '../../data/pumpDeviceCatalog';
import { computeKotitalousDeduction, computeQuoteTotals } from './calculations';
import { calculateDeviceSellNet, findDeviceById } from './deviceCatalog';
import type { QuotePrintCustomer, QuotePrintMeta } from './printHtml';
import {
  buildTermatekAssetMap,
  embedTermatekAssets,
  embedTermatekProductImages,
  embedUrlAsDataUrl,
  getTermatekAssetBase,
  resolveTermatekProductImages,
  type TermatekAssetMap,
  type TermatekProductImage,
} from './termatekAssets';
import type { QuoteRequestData } from './types';
import { vilpIndoorConfigLabel } from './vilpCompatibility';

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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

function formatOfferNumber(meta: QuotePrintMeta): string {
  if (meta.quoteNumber) return meta.quoteNumber;
  const d = meta.quoteDate ? new Date(meta.quoteDate) : new Date();
  if (Number.isNaN(d.getTime())) return '—';
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}01`;
}

export function isTermatekCompany(meta: QuotePrintMeta): boolean {
  return (meta.companyName || '').toLowerCase().includes('termatek');
}

function deviceIntroBullet(data: QuoteRequestData, device: HeatPumpDevice | null): string {
  const name = device?.name ?? 'Vesi-ilmalämpöpumppu';
  const indoorLabel = vilpIndoorConfigLabel(data.vilpIndoorConfig);
  const indoor =
    data.vilpIndoorConfig === 'integroitu'
      ? ' (Integroitu varaaja)'
      : indoorLabel && indoorLabel !== 'Ilman varaajaa / monoblock'
        ? ` (${indoorLabel})`
        : '';
  return `Vesi-ilmalämpöpumpun asennus: ${name}${indoor}`.trim();
}

function workGrossRows(data: QuoteRequestData, vatMult: number): Array<{ desc: string; hours: number; gross: number }> {
  const rows: Array<{ desc: string; hours: number; gross: number }> = [];
  for (const item of data.workItems) {
    const hours = Number(item.hours) || 0;
    const net = hours * Number(item.pricePerHour || 0);
    if (hours <= 0 && !item.description.trim()) continue;
    rows.push({
      desc: item.description.trim() || 'Työ',
      hours,
      gross: net * vatMult,
    });
  }
  if (!rows.length && Number(data.laborHours) > 0) {
    rows.push({
      desc: 'Asennustyö',
      hours: Number(data.laborHours),
      gross: Number(data.laborHours) * Number(data.laborRate || 0) * vatMult,
    });
  }
  if (Number(data.travelCost) > 0) {
    rows.push({
      desc: 'Matkakulut',
      hours: 0,
      gross: Number(data.travelCost) * vatMult,
    });
  }
  return rows;
}

function termatekStyles(): string {
  return `
    @page { size: A4; margin: 0; }
    html, body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: Arial, sans-serif; color: #111; }
    .a4 { width: 210mm; min-height: 297mm; position: relative; overflow: visible; }
    .page { page-break-after: always; break-after: page; }
    .page:last-child { page-break-after: auto; break-after: auto; }
    table { page-break-inside: auto; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; break-inside: avoid; }
    .section-title, .summary-title, .product-title { break-after: avoid; page-break-after: avoid; }
    .header {
      position: absolute; left: 0; right: 0; top: 0; height: 18mm;
      background: transparent; padding: 2mm 8mm; box-sizing: border-box;
      display: flex; align-items: center; border-bottom: 0.3mm solid #d0d7de; overflow: hidden;
    }
    .header.header--termatek {
      justify-content: center; padding: 2mm 3mm; height: 22mm; overflow: hidden;
      left: 3mm; right: 3mm; background: #072855; border-bottom: 0;
    }
    .header.header--termatek .brand-banner {
      height: 18mm; width: 100%; max-width: none; object-fit: contain; display: block; margin: 0;
    }
    .footer.footer--bar {
      position: absolute; left: 3mm; right: 3mm; bottom: 0; height: 12mm;
      background: #072855; padding: 0;
    }
    .content { padding: 24mm 15mm 20mm 15mm; box-sizing: border-box; font-size: 10.1pt; line-height: 1.32; }
    .tmk-kicker { font-size: 10pt; font-weight: 800; letter-spacing: .6px; color: #072855; text-transform: uppercase; }
    .tmk-hero-grid { display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 10mm; margin-top: 4mm; }
    .tmk-hero-title { margin-top: 2mm; font-size: 22pt; font-weight: 900; line-height: 1.08; color: #072855; }
    .tmk-hero-lead { margin-top: 4mm; font-size: 11.5pt; line-height: 1.45; color: #111; }
    .tmk-hero-cards { margin-top: 6mm; display: grid; grid-template-columns: 1fr; gap: 3.5mm; }
    .tmk-hero-card { border: 0.5mm solid rgba(0,0,0,0.12); border-radius: 4mm; padding: 4mm 4.5mm; background: #fff; }
    .tmk-hero-card .t { font-weight: 900; color: #072855; margin-bottom: 1.5mm; }
    .tmk-hero-card .p { font-size: 10.2pt; color: #111; line-height: 1.35; }
    .tmk-hero-badgebar { margin-top: 7mm; border-radius: 5mm; background: #eff6ff; border: 1px solid #c7d2fe; padding: 4mm 5mm; }
    .tmk-hero-badgebar .row { display: flex; justify-content: space-between; gap: 8mm; align-items: center; }
    .tmk-hero-badgebar .l, .tmk-hero-badgebar .r { font-weight: 900; color: #1f4e79; font-size: 11pt; }
    .tmk-hero-badgebar .r { white-space: nowrap; }
    .hero-img-grid { display: grid; gap: 4mm; margin-top: 3mm; }
    .hero-img-grid.one { grid-template-columns: 1fr; }
    .hero-img-grid.two { grid-template-columns: 1fr 1fr; }
    .hero-img-grid.three { grid-template-columns: 1fr 1fr; }
    .hero-img-box { border: 0.5mm solid rgba(0,0,0,0.10); border-radius: 4mm; padding: 3mm; background: #fff; }
    .hero-img-box img { width: 100%; height: 52mm; object-fit: contain; display: block; }
    .hero-img-caption { margin-top: 1.5mm; font-size: 9pt; font-weight: 700; color: #072855; text-align: center; }
    .product-card { border: 0.5mm solid rgba(0,0,0,0.10); border-radius: 4mm; padding: 3mm 3.5mm; background: #fff; break-inside: avoid; page-break-inside: avoid; }
    .tmk-intro-title-row { display: flex; justify-content: space-between; align-items: baseline; margin-top: 1mm; }
    .tmk-intro-title { font-size: 15pt; font-weight: 800; }
    .tmk-intro-no { font-size: 11pt; font-weight: 800; color: #072855; }
    .tmk-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; margin-top: 4mm; align-items: start; }
    .tmk-info-block { border: 0.5mm solid rgba(0,0,0,0.14); border-radius: 3mm; padding: 3.8mm 4.2mm; background: #fff; }
    .tmk-info-title { font-weight: 800; color: #072855; margin: 0 0 2mm 0; }
    .tmk-info-block .tmk-line { margin: 0; padding: 1.1mm 0; font-size: 9.85pt; line-height: 1.45; }
    .tmk-intro-copy { margin-top: 5mm; border: 1px solid #e5e7eb; border-radius: 12px; padding: 4.5mm 5mm 5mm 5mm; background: #fff; break-inside: avoid; page-break-inside: avoid; }
    .tmk-meta { font-size: 9.75pt; line-height: 1.4; break-inside: avoid; page-break-inside: avoid; }
    .tmk-meta .row { display: flex; align-items: baseline; gap: 3mm; margin: 1.15mm 0; min-height: 1.35em; }
    .tmk-meta .label { min-width: 40mm; font-weight: 700; color: #072855; flex: 0 0 40mm; }
    .tmk-meta .value { flex: 1 1 auto; font-size: 9.75pt; margin: 0; line-height: 1.4; }
    .tmk-lead { margin-top: 3.5mm; font-size: 10.2pt; line-height: 1.42; padding-left: 5.5mm; padding-right: 1mm; }
    .tmk-bullets { margin: 2mm 0 0 0; padding-left: 9.5mm; font-size: 9.85pt; line-height: 1.42; }
    .tmk-bullets li { margin: 1mm 0; padding-left: 0.3mm; }
    .sitrep-wrap { margin-top: 5mm; padding: 4mm 4.5mm; border: 0.4mm solid #d4a574; border-radius: 3mm; background: #fffbf5; break-inside: avoid; page-break-inside: avoid; }
    .sitrep-title { font-weight: 800; color: #92400e; font-size: 11pt; margin-bottom: 2mm; }
    .sitrep-body { font-size: 9.6pt; line-height: 1.45; color: #111; white-space: pre-wrap; }
    .product-title { font-size: 14.5pt; font-weight: 700; margin-bottom: 3.5mm; }
    .product-subtitle { font-size: 10pt; color: #333; margin-top: -2mm; margin-bottom: 3.5mm; }
    .product-layout { display: grid; grid-template-columns: 1.08fr 0.92fr; gap: 6mm; align-items: start; }
    .product-side { display: grid; gap: 3mm; }
    .img-grid { display: grid; gap: 6mm; margin: 4mm 0 8mm 0; }
    .img-grid.two { grid-template-columns: 1fr 1fr; }
    .img-grid.three { grid-template-columns: 1fr 1fr 1fr; }
    .img-card { border: 0.5mm solid rgba(0,0,0,0.12); border-radius: 3mm; padding: 4mm; background: #fff; }
    .img-label { font-weight: 600; font-size: 10.5pt; margin-bottom: 2mm; }
    .img-card img { width: 100%; height: 55mm; object-fit: contain; display: block; }
    .fact-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm; }
    .fact-card { border: 0.5mm solid rgba(0,0,0,0.10); border-radius: 3mm; padding: 2.2mm 2.8mm; background: #fff; }
    .fact-k { font-size: 8.8pt; text-transform: uppercase; letter-spacing: .4px; color: #6b7280; font-weight: 700; }
    .fact-v { margin-top: 0.6mm; font-size: 9.9pt; font-weight: 700; color: #111; line-height: 1.2; }
    .section-title { font-weight: 700; margin-top: 2.5mm; margin-bottom: 1.8mm; }
    .compact-list { margin: 0.6mm 0 0 4.5mm; break-inside: avoid; page-break-inside: avoid; }
    .compact-list li { margin: 0.35mm 0; line-height: 1.2; break-inside: avoid; page-break-inside: avoid; }
    .summary-title { font-size: 13pt; font-weight: 700; margin-bottom: 5mm; }
    .summary-note-box { padding: 4mm 4.5mm; border: 0.5mm solid #c7d2fe; border-radius: 4mm; background: #eff6ff; font-size: 10pt; line-height: 1.4; color: #1f2937; margin-bottom: 4mm; }
    .price-table { width: 100%; border-collapse: collapse; margin-top: 2.5mm; font-size: 9.8pt; }
    .price-table th, .price-table td { border: 1px solid #e6e6e6; padding: 6px 8px; vertical-align: top; }
    .price-table th { background: #f7f7f7; font-weight: 600; text-align: left; }
    .price-table .num { text-align: right; white-space: nowrap; }
    .price-table tr.total td { font-weight: 700; }
    .extras-grid { display: grid; grid-template-columns: 34mm 1fr; gap: 2mm 4mm; font-size: 9.5pt; margin-top: 4mm; }
    .extras-grid .k { font-weight: 600; color: #374151; }
    .terms-title { font-size: 12pt; font-weight: 600; margin-bottom: 2.5mm; color: #072855; }
    .terms-lead { font-size: 10pt; color: #111; margin-bottom: 4mm; }
    .terms h3 { font-size: 10.5pt; margin: 3mm 0 1.5mm 0; color: #072855; }
    .terms p { font-size: 10pt; margin: 0 0 2mm 0; }
    .tuu-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; margin-top: 6mm; }
    .tuu-info-block { border: 1px solid #e5e7eb; border-radius: 12px; padding: 4mm 4.5mm; background: #fff; }
    .tuu-info-title { font-weight: 800; color: #072855; margin-bottom: 2.5mm; }
    .tuu-line { margin: 0.45mm 0; font-size: 9.7pt; line-height: 1.25; }
    .tuu-muted { margin-top: 4mm; font-size: 9.7pt; color: #111; line-height: 1.4; }
  `;
}

function heroProductImagesHtml(productImages: TermatekProductImage[]): string {
  if (!productImages.length) return '';
  const gridClass = productImages.length === 1 ? 'one' : productImages.length === 2 ? 'two' : 'three';
  return `
    <div class="hero-img-grid ${gridClass}">
      ${productImages
        .slice(0, 3)
        .map(
          (img) => `
        <div class="hero-img-box">
          <img src="${esc(img.src)}" alt="${esc(img.alt)}" />
          <div class="hero-img-caption">${esc(img.label)}</div>
        </div>`,
        )
        .join('')}
    </div>`;
}

function productImagesHtml(productImages: TermatekProductImage[]): string {
  if (!productImages.length) return '';
  const gridClass = productImages.length === 3 ? 'three' : 'two';
  return `
    <div class="img-grid ${gridClass}">
      ${productImages
        .map(
          (img) => `
        <div class="img-card">
          <div class="img-label">${esc(img.label)}</div>
          <img src="${esc(img.src)}" alt="${esc(img.alt)}" />
        </div>`,
        )
        .join('')}
    </div>`;
}

export function generateTermatekVilpPrintHtml(input: {
  data: QuoteRequestData;
  customer: QuotePrintCustomer;
  meta: QuotePrintMeta;
  feeMap?: BrandDeliveryFeeByCategoryMap | null;
  assets?: TermatekAssetMap;
  productImages?: TermatekProductImage[];
}) {
  const { data, customer, meta, feeMap = null } = input;
  const assetBase = getTermatekAssetBase();
  const assets = input.assets ?? buildTermatekAssetMap(assetBase);
  const settings = meta.settings ?? {};
  const billing = settings.billing ?? {};
  const totals = computeQuoteTotals(data, feeMap);
  const kotitalous = computeKotitalousDeduction(data);
  const device = findDeviceById(data.selectedDeviceId);
  const vatRate = Number(data.vatRate) || 0;
  const vatMult = 1 + vatRate / 100;
  const offerNo = formatOfferNumber(meta);
  const productTitle = device?.name ?? 'Vesi-ilmalämpöpumppu';
  const introBullet = deviceIntroBullet(data, device);
  const productImages =
    input.productImages
    ?? resolveTermatekProductImages({
      quoteType: data.type,
      data,
      device,
      assets,
      productTitle,
    });
  const workRows = workGrossRows(data, vatMult);
  const workGross = workRows.reduce((sum, row) => sum + row.gross, 0);
  const materialsGross = totals.materialsNet * vatMult;
  const deviceGross = device
    ? calculateDeviceSellNet(data, device, feeMap) * vatMult
    : totals.deviceNet * vatMult;
  const subtotalGross = workGross + materialsGross + deviceGross;
  const discountPct = Math.max(0, Math.min(100, Number(data.overallDiscountPercent || 0)));
  const discountGross = subtotalGross * (discountPct / 100);
  const finalGross = subtotalGross - discountGross;
  const extraWorkGross = Number(data.laborRate || 0) * vatMult;
  const deliveryLine = data.deliveryTermsText.trim() || 'Työt sovitaan erikseen asiakkaan kanssa.';
  const paymentLine = data.paymentTermsText.trim() || billing.payment_terms || '14 pv netto';
  const customerAddress = [customer.address, customer.city].filter(Boolean).join(', ');
  const companyAddress = [settings.address, [settings.postal_code, settings.city].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  const websiteDisplay = (settings.website || 'www.termatek.fi').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const coverLocationLine = [settings.postal_code, settings.city].filter(Boolean).join(' ') || 'Vantaa, 01350';

  const materialDetailRows = data.materials
    .filter((m) => m.name.trim())
    .map((m) => {
      const qty = Number(m.quantity) || 0;
      const unitGross = Number(m.sellPrice) * vatMult;
      const rowGross = qty * unitGross;
      return `<tr>
        <td>${esc(m.name)}</td>
        <td class="num">${esc(qty)}</td>
        <td class="num">${formatEuro(unitGross)}</td>
        <td class="num">${formatEuro(rowGross)}</td>
      </tr>`;
    })
    .join('');

  const workDetailRows = workRows
    .map(
      (row) => `<tr>
        <td>${esc(row.desc)}</td>
        <td class="num">${row.hours > 0 ? `${row.hours.toLocaleString('fi-FI', { maximumFractionDigits: 1 })}` : '—'}</td>
        <td class="num">${formatEuro(row.gross)}</td>
      </tr>`,
    )
    .join('');

  const situationHtml =
    data.situationReportEnabled && data.situationReportText.trim()
      ? `<div class="sitrep-wrap">
          <div class="sitrep-title">${esc(data.situationReportTitle.trim() || 'Tilanneraportti')}</div>
          <div class="sitrep-body">${esc(data.situationReportText).replace(/\n/g, '<br />')}</div>
        </div>`
      : '';

  const headerHtml = `<div class="header header--termatek"><img class="brand-banner" src="${esc(assets.header)}" alt="${esc(meta.companyName)}" /></div>`;
  const footerHtml = `<div class="footer footer--bar"></div>`;

  const productFactsHtml = `
    <div class="fact-grid">
      <div class="fact-card"><div class="fact-k">Laitetyyppi</div><div class="fact-v">Vesi-ilmalämpöpumppu</div></div>
      <div class="fact-card"><div class="fact-k">Merkki</div><div class="fact-v">${esc(device?.brand ?? '—')}</div></div>
      <div class="fact-card"><div class="fact-k">Malli</div><div class="fact-v">${esc(device?.model ?? '—')}</div></div>
      <div class="fact-card"><div class="fact-k">Lämmitysteho</div><div class="fact-v">${device ? `${device.heatingPowerMin} – ${device.heatingPowerMax} kW` : '—'}</div></div>
      <div class="fact-card"><div class="fact-k">Toimitussisältö</div><div class="fact-v">Ulkoyksikkö + sisäyksikkö</div></div>
      <div class="fact-card"><div class="fact-k">Asennus</div><div class="fact-v">Asennus tarjouksen mukaisesti</div></div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="fi">
<head>
  <meta charset="utf-8" />
  <title>Tarjous # ${esc(offerNo)} – ${esc(customer.name)}</title>
  <style>${termatekStyles()}</style>
</head>
<body>
  <div class="a4 page">
    ${headerHtml}
    ${footerHtml}
    <div class="content">
      <div class="tmk-kicker">Lämmitysratkaisut avaimet käteen</div>
      <div class="tmk-hero-grid">
        <div>
          <div class="tmk-hero-title">Termatek lämmitysratkaisut – siisti ja huolellinen asennus, kerralla oikein.<br/>Tarjoamme jatkuvaa tukea ja olemme tavoitettavissa myös takuuajan jälkeen.</div>
          <div class="tmk-hero-lead">Toteutamme lämpöpumppuratkaisut suunnittelusta käyttöönottoon ammattitaidolla. Saat mitoitukseen sopivan laitteen, huolellisen asennuksen ja dokumentoidun käyttöönoton – sekä avun myös huolto- ja jatkotoimenpiteissä.</div>
          <div class="tmk-hero-cards">
            <div class="tmk-hero-card"><div class="t">Mitoitus ja toteutus kunnolla</div><div class="p">Valitaan oikea teholuokka, huomioidaan kohteen lämmönjako ja varmistetaan toimivuus käytännössä.</div></div>
            <div class="tmk-hero-card"><div class="t">Siisti asennus ja turvallinen käyttöönotto</div><div class="p">Asennus valmistajan ohjeiden ja määräysten mukaan. Käyttöönotossa testaus, luovutus ja ohjeistus.</div></div>
            <div class="tmk-hero-card"><div class="t">Tuki, huolto ja jatkuvuus</div><div class="p">Tarjoamme erikseen sovittaessa huoltoja ja huoltosopimuksia, jotta järjestelmä toimii vuodesta toiseen.</div></div>
          </div>
          <div class="tmk-hero-badgebar"><div class="row"><div class="l">Tarjous # ${esc(offerNo)}</div><div class="r">${esc(customer.name)}</div></div></div>
        </div>
        <div>
          <div class="product-card" style="padding:5mm;">
            <div style="font-weight:800;color:#072855;font-size:11pt;">Tarjottu kokonaisuus</div>
            <div style="font-size:16pt;font-weight:800;color:#111;margin-top:2mm;">${esc(productTitle)}</div>
            <div style="font-size:10pt;color:#374151;margin-top:1mm;">Ulkoyksikkö + sisäyksikkö</div>
            <div style="font-size:9.5pt;color:#4b5563;margin-top:3mm;line-height:1.35;">Laite mitoitetaan kohteeseen sopivaksi ja asennetaan valmistajan ohjeiden mukaisesti.</div>
            ${heroProductImagesHtml(productImages)}
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="a4 page">
    ${headerHtml}
    ${footerHtml}
    <div class="content">
      <div class="tmk-intro-title-row">
        <div class="tmk-intro-title">Tarjous</div>
        <div class="tmk-intro-no">Tarjous # ${esc(offerNo)}</div>
      </div>
      <div class="tmk-info-grid">
        <div class="tmk-info-block">
          <div class="tmk-info-title">Yritystiedot</div>
          ${billing.business_id ? `<div class="tmk-line">Y-tunnus: ${esc(billing.business_id)}</div>` : ''}
          ${companyAddress ? `<div class="tmk-line">${esc(companyAddress)}</div>` : ''}
          ${settings.phone ? `<div class="tmk-line">Puh: ${esc(settings.phone)}</div>` : ''}
          ${settings.email ? `<div class="tmk-line">${esc(settings.email)}</div>` : ''}
          ${websiteDisplay ? `<div class="tmk-line">${esc(websiteDisplay)}</div>` : ''}
        </div>
        <div class="tmk-info-block">
          <div class="tmk-info-title">Asiakastiedot</div>
          <div class="tmk-line"><strong>${esc(customer.name)}</strong></div>
          ${customerAddress ? `<div class="tmk-line">${esc(customerAddress)}</div>` : ''}
          ${data.customerEmail ? `<div class="tmk-line">${esc(data.customerEmail)}</div>` : ''}
          ${data.customerPhone ? `<div class="tmk-line">${esc(data.customerPhone)}</div>` : ''}
        </div>
      </div>
      <div class="tmk-intro-copy">
        <div class="tmk-meta">
          <div class="row"><span class="label">Antopäivä:</span><span class="value">${formatDateFi(meta.quoteDate)}</span></div>
          <div class="row"><span class="label">Tarjous voimassa:</span><span class="value">${formatDateFi(data.validUntil)}</span></div>
          <div class="row"><span class="label">Toimitusehto ja aika:</span><span class="value">${esc(deliveryLine)}</span></div>
          <div class="row"><span class="label">Maksuehto:</span><span class="value">${esc(paymentLine)}</span></div>
          <div class="row"><span class="label">Lisätyöt:</span><span class="value">${formatEuro(extraWorkGross)} / h (sis. ALV ${vatRate}%)</span></div>
          <div class="row"><span class="label">Huom.:</span><span class="value">Mikäli työn aikana havaitaan aiheutuvia lisä- ja/tai muutostöitä, veloitetaan ne erikseen tilaajan hyväksynnällä.</span></div>
        </div>
        <div class="tmk-lead"><strong>Kiitämme tarjouspyynnöstänne ja tarjoamme Teille seuraavasti:</strong></div>
        <ul class="tmk-bullets"><li>${esc(introBullet)}</li></ul>
      </div>
      ${situationHtml}
    </div>
  </div>

  <div class="a4 page">
    ${headerHtml}
    ${footerHtml}
    <div class="content">
      <div class="product-title">${esc(productTitle)}</div>
      <div class="product-subtitle">Sisäyksikkö: ${esc(vilpIndoorConfigLabel(data.vilpIndoorConfig))}</div>
      <div class="product-layout">
        <div>${productImagesHtml(productImages)}</div>
        <div class="product-side">
          ${productFactsHtml}
          <div class="product-card">
            <div class="section-title" style="margin-top:0;">Tarjoukseen sisältyy</div>
            <ul class="compact-list"><li>${esc(introBullet)}</li></ul>
          </div>
          <div class="product-card">
            <div class="section-title" style="margin-top:0;">Toimitus ja käyttöönotto</div>
            <ul class="compact-list">
              <li>Laite valitaan kohteen ja mitoituksen mukaisesti.</li>
              <li>Asennus toteutetaan valmistajan ohjeiden ja viranomaismääräysten mukaan.</li>
              <li>Käyttöönotto sisältää testauksen, luovutuksen ja käytön opastuksen.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="a4 page">
    ${headerHtml}
    ${footerHtml}
    <div class="content">
      <div class="summary-title">Hinnan muodostuminen</div>
      <div class="summary-note-box">Hinnat ovat verollisia (sis. ALV ${vatRate}%).</div>
      <table class="price-table">
        <thead><tr><th>Kuvaus</th><th class="num">Yhteensä (sis. ALV ${vatRate}%)</th></tr></thead>
        <tbody>
          <tr><td>Työn osuus</td><td class="num">${formatEuro(workGross)}</td></tr>
          <tr><td>Tarvikkeet</td><td class="num">${formatEuro(materialsGross)}</td></tr>
          <tr><td>Laitehinta</td><td class="num">${formatEuro(deviceGross)}</td></tr>
          <tr class="total"><td>Välisumma</td><td class="num">${formatEuro(subtotalGross)}</td></tr>
          ${discountPct > 0 ? `<tr><td>Kokonaisalennus ${discountPct}%</td><td class="num">- ${formatEuro(discountGross)}</td></tr>` : ''}
          <tr class="total"><td>Lopullinen tarjoushinta</td><td class="num">${formatEuro(finalGross)}</td></tr>
        </tbody>
      </table>
      <div class="section-title">Työerittely</div>
      <table class="price-table">
        <thead><tr><th>Kuvaus</th><th class="num">Tunnit</th><th class="num">Yht (sis. ALV ${vatRate}%)</th></tr></thead>
        <tbody>${workDetailRows || '<tr><td colspan="3">—</td></tr>'}<tr class="total"><td>Työ yhteensä</td><td></td><td class="num">${formatEuro(workGross)}</td></tr></tbody>
      </table>
      <div class="section-title">Tarvike-erittely</div>
      <table class="price-table">
        <thead><tr><th>Tarvike</th><th class="num">Määrä</th><th class="num">á (sis. ALV)</th><th class="num">Yht (sis. ALV)</th></tr></thead>
        <tbody>${materialDetailRows || '<tr><td colspan="4">—</td></tr>'}<tr class="total"><td>Tarvikkeet yhteensä</td><td></td><td></td><td class="num">${formatEuro(materialsGross)}</td></tr></tbody>
      </table>
      <div class="section-title">Lisätiedot</div>
      <div class="extras-grid">
        ${kotitalous.laborOnlyGross > 0 ? `<span class="k">Kotitalousvähennys (maksimiarvio)</span><span>${formatEuro(kotitalous.onePerson)} — laskettu työn osuudesta ${formatEuro(kotitalous.laborOnlyGross)} (sis. ALV), ${(kotitalous.percent * 100).toFixed(0)}%, enintään ${formatEuro(kotitalous.maxPerPerson)} / hlö.</span>` : ''}
        <span class="k">Toimitusehto ja aika</span><span>${esc(deliveryLine)}</span>
        <span class="k">Maksuehto</span><span>${esc(paymentLine)}</span>
        <span class="k">Lisätyöt</span><span>${formatEuro(extraWorkGross)} / h (sis. ALV ${vatRate}%)</span>
      </div>
    </div>
  </div>

  <div class="a4 page terms">
    ${headerHtml}
    ${footerHtml}
    <div class="content">
      <div class="terms-title">Termatek – Takuut, huolto ja asennusehdot</div>
      <div class="terms-lead">Tämä asiakirja toimii Termatekin vesi–ilmalämpöpumppujen (VILP) myyntiä ja asennusta koskevana ehtopohjana. Ehdot koskevat sekä kuluttaja- että yritysasiakkaita, ellei toisin mainita.</div>
      <h3>1. Takuut</h3>
      <p><strong>1.1 Asennustyön takuu</strong> — Termatek myöntää suorittamalleen asennustyölle kahden (2) vuoden takuun.</p>
      <p><strong>1.2 Laitetakuu</strong> — Laitteiden ja tarvikkeiden osalta noudatetaan kunkin valmistajan voimassa olevia takuuehtoja.</p>
      <h3>2. Käyttöönotto ja dokumentaatio</h3>
      <p>Asennuksen valmistuttua Termatek luovuttaa tilaajalle käyttö- ja huolto-ohjeet, käyttöönottodokumentit sekä käyttöönottopöytäkirjan.</p>
      <h3>3. Järjestelmän käyttö ja vastuut</h3>
      <p>Vesi–ilmalämpöpumpun asianmukainen toiminta edellyttää oikein mitoitettua lämmönjakojärjestelmää, määräysten mukaista sähköliitäntää sekä ohjeiden noudattamista.</p>
      <h3>4. Huolto</h3>
      <p>Laitteen takuun voimassaolo edellyttää huoltoa valmistajan ohjeiden mukaisesti. Termatek tarjoaa erikseen sovittaessa huoltoja ja huoltosopimuksia.</p>
      <h3>5. Lisätyöt</h3>
      <p>Mahdolliset lisätyöt suoritetaan vain tilaajan hyväksynnällä ja laskutetaan erikseen.</p>
      <h3>6. Sovellettava laki</h3>
      <p>Sopimukseen sovelletaan Suomen lakia. Kuluttaja-asiakkaiden osalta noudatetaan kuluttajansuojalainsäädäntöä.</p>
    </div>
  </div>

  <div class="a4 page">
    ${headerHtml}
    ${footerHtml}
    <div class="content">
      <div class="summary-title">Yritystiedot ja yhteystiedot</div>
      <div class="tuu-info-grid">
        <div class="tuu-info-block">
          <div class="tuu-info-title">Yritystiedot</div>
          <div class="tuu-line"><strong>${esc(meta.companyName)}</strong></div>
          ${billing.business_id ? `<div class="tuu-line">Y-tunnus: ${esc(billing.business_id)}</div>` : ''}
          ${companyAddress ? `<div class="tuu-line">${esc(companyAddress)}</div>` : ''}
          ${coverLocationLine ? `<div class="tuu-line">${esc(coverLocationLine)}</div>` : ''}
        </div>
        <div class="tuu-info-block">
          <div class="tuu-info-title">Yhteystiedot</div>
          ${settings.phone ? `<div class="tuu-line">Puh: ${esc(settings.phone)}</div>` : ''}
          ${settings.email ? `<div class="tuu-line">${esc(settings.email)}</div>` : ''}
          ${websiteDisplay ? `<div class="tuu-line">${esc(websiteDisplay)}</div>` : ''}
        </div>
      </div>
      <div class="tuu-muted"><strong>Palvelu:</strong> Huollot, lisätyöt ja mahdolliset muutostarpeet sovitaan aina tilaajan kanssa etukäteen. Laitteiden osalta noudatetaan valmistajan takuuehtoja. Asennustyölle myönnetään kahden (2) vuoden takuu.</div>
    </div>
  </div>
</body>
</html>`;
}

export async function prepareTermatekVilpPrintHtml(input: {
  data: QuoteRequestData;
  customer: QuotePrintCustomer;
  meta: QuotePrintMeta;
  feeMap?: BrandDeliveryFeeByCategoryMap | null;
}): Promise<string> {
  const assetBase = getTermatekAssetBase();
  const assets = await embedTermatekAssets(buildTermatekAssetMap(assetBase));
  if (input.meta.logoUrl) {
    assets.logo = await embedUrlAsDataUrl(input.meta.logoUrl);
  }
  const device = findDeviceById(input.data.selectedDeviceId);
  const productTitle = device?.name ?? 'Vesi-ilmalämpöpumppu';
  let productImages = resolveTermatekProductImages({
    quoteType: input.data.type,
    data: input.data,
    device,
    assets,
    productTitle,
  });
  productImages = await embedTermatekProductImages(productImages);
  return generateTermatekVilpPrintHtml({ ...input, assets, productImages });
}
