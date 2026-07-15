import type { CompanySettings } from '../management';
import { INSTALLATION_PLAN_DOCUMENT_TITLE } from './defaultTemplate';
import type { InstallationPlanAttachment, InstallationPlanData } from './types';

export type InstallationPlanPrintCustomer = {
  name: string;
  address?: string | null;
  city?: string | null;
};

export type InstallationPlanPrintMeta = {
  companyName: string;
  logoUrl?: string | null;
  settings?: CompanySettings | null;
  documentDate?: string | null;
};

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function attrUrl(url: string): string {
  return String(url).replace(/"/g, '&quot;');
}

function formatDateFi(iso: string | undefined | null): string {
  if (!iso) return new Date().toLocaleDateString('fi-FI');
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('fi-FI');
}

function smartappFallbackLogoSvg(companyName: string): string {
  const label = companyName.slice(0, 24);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="56" viewBox="0 0 220 56">
    <rect width="220" height="56" rx="8" fill="#0f172a"/>
    <text x="110" y="34" fill="#ffffff" font-family="Segoe UI, Arial, sans-serif" font-size="16" font-weight="700" text-anchor="middle">${label}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function companyContactBlock(meta: InstallationPlanPrintMeta): string {
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

function textToHtml(value: string): string {
  return esc(value).replace(/\n/g, '<br />');
}

function sectionBodyHtml(body: string): string {
  const lines = body.split('\n').map((line) => line.trim()).filter(Boolean);
  const bulletLines = lines.filter((line) => line.startsWith('•') || line.startsWith('-'));
  if (bulletLines.length > 0 && bulletLines.length === lines.length) {
    return `<ul class="section-list">${lines
      .map((line) => `<li>${esc(line.replace(/^[•-]\s*/, ''))}</li>`)
      .join('')}</ul>`;
  }
  return `<div class="section-text">${textToHtml(body)}</div>`;
}

function installationPlanPrintStyles(): string {
  return `
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", Arial, sans-serif;
      color: #0f172a;
      font-size: 11px;
      line-height: 1.45;
      background: #fff;
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
      align-items: flex-start;
    }
    .title-row h1 {
      margin: 0;
      font-size: 22px;
      color: #0f172a;
      max-width: 110mm;
    }
    .meta-box {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 10px 12px;
      min-width: 170px;
      background: #f8fafc;
      font-size: 10px;
    }
    .meta-box div { margin-bottom: 4px; }
    .customer-box {
      margin-bottom: 14px;
      padding: 10px 12px;
      background: #fff7ed;
      border: 1px solid #fdba74;
      border-radius: 8px;
    }
    .customer-box strong {
      display: block;
      margin-bottom: 4px;
      font-size: 10px;
      letter-spacing: .04em;
      text-transform: uppercase;
      color: #9a3412;
    }
    .intro {
      margin: 0 0 14px;
      padding: 10px 12px;
      background: #f8fafc;
      border-left: 3px solid #f97316;
      border-radius: 0 8px 8px 0;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 34mm 1fr;
      gap: 6px 12px;
      margin: 0;
    }
    .info-grid dt {
      margin: 0;
      color: #64748b;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .03em;
    }
    .info-grid dd { margin: 0; }
    .print-section {
      margin-bottom: 12px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      overflow: hidden;
      break-inside: avoid-page;
    }
    .print-section-title {
      margin: 0;
      padding: 8px 12px;
      background: #eff6ff;
      border-bottom: 1px solid #cbd5e1;
      color: #1d4ed8;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .02em;
      text-transform: uppercase;
    }
    .print-section-body {
      padding: 10px 12px;
    }
    .section-list {
      margin: 0;
      padding-left: 1.2rem;
    }
    .section-text { white-space: normal; }
    .attachments-box, .closing-box {
      margin-top: 14px;
      padding: 10px 12px;
      border-left: 3px solid #f97316;
      background: #f8fafc;
      break-inside: avoid-page;
    }
    .attachments-box h2, .closing-box h2 {
      margin: 0 0 8px;
      font-size: 13px;
      color: #0f172a;
    }
    .attachment-list {
      margin: 0;
      padding-left: 1.2rem;
    }
    .signature-block {
      margin-top: 18px;
      padding-top: 12px;
      border-top: 1px solid #cbd5e1;
      color: #475569;
      font-size: 10px;
    }
    .signature-block strong { color: #0f172a; }
    @media print {
      body { background: #fff; }
      .page { max-width: none; }
    }
  `;
}

export function generateInstallationPlanPrintHtml(input: {
  data: InstallationPlanData;
  customer: InstallationPlanPrintCustomer;
  meta: InstallationPlanPrintMeta;
  attachments?: InstallationPlanAttachment[];
}): string {
  const { data, customer, meta, attachments = [] } = input;
  const logo = meta.logoUrl || smartappFallbackLogoSvg(meta.companyName);
  const customerAddress = [customer.address, customer.city].filter(Boolean).join(', ');
  const recipientName = data.propertyName.trim() || customer.name;
  const recipientLines = [
    recipientName !== customer.name ? customer.name : null,
    customerAddress || null,
  ].filter(Boolean);

  const sectionsHtml = data.sections
    .filter((section) => section.title.trim() || section.body.trim())
    .map(
      (section, index) => `
      <section class="print-section">
        <h2 class="print-section-title">${index + 1}. ${esc(section.title)}</h2>
        <div class="print-section-body">${sectionBodyHtml(section.body)}</div>
      </section>`,
    )
    .join('');

  const attachmentItems = [
    ...data.attachmentsNote
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `<li>${esc(line.replace(/^[•-]\s*/, ''))}</li>`),
    ...attachments.map((attachment) => `<li>${esc(attachment.file_name)}</li>`),
  ];

  const infoRows = [
    data.propertyName.trim()
      ? `<dt>Kiinteistö / Taloyhtiö</dt><dd>${esc(data.propertyName)}</dd>`
      : '',
    data.units.trim() ? `<dt>Asunnot / Huoneistot</dt><dd>${esc(data.units)}</dd>` : '',
    data.installationType.trim()
      ? `<dt>Asennuksen tyyppi</dt><dd>${esc(data.installationType)}</dd>`
      : '',
  ].filter(Boolean);

  return `<!DOCTYPE html>
<html lang="fi">
<head>
  <meta charset="utf-8" />
  <title>${esc(resolveInstallationPlanPrintTitle(data, customer.name))}</title>
  <style>${installationPlanPrintStyles()}</style>
</head>
<body>
  <div class="page">
    <header class="header">
      <div class="logo"><img src="${attrUrl(logo)}" alt="${esc(meta.companyName)}" /></div>
      <div class="company-meta">
        <strong>${esc(meta.companyName)}</strong>
        ${companyContactBlock(meta)}
      </div>
    </header>

    <div class="title-row">
      <h1>${esc(INSTALLATION_PLAN_DOCUMENT_TITLE)}</h1>
      <div class="meta-box">
        <div><strong>Päivä:</strong> ${formatDateFi(meta.documentDate)}</div>
        <div><strong>Asiakirja:</strong> Asennus suunnittelu</div>
      </div>
    </div>

    <section class="customer-box">
      <strong>Vastaanottaja</strong>
      <div>${esc(recipientName)}</div>
      ${recipientLines.map((line) => `<div>${esc(line)}</div>`).join('')}
    </section>

    ${
      infoRows.length > 0
        ? `<section class="print-section">
            <h2 class="print-section-title">Kohteen tiedot</h2>
            <div class="print-section-body"><dl class="info-grid">${infoRows.join('')}</dl></div>
          </section>`
        : ''
    }

    ${
      data.descriptionIntro.trim()
        ? `<div class="intro"><strong>Asennuksen kuvaus</strong><div>${textToHtml(data.descriptionIntro)}</div></div>`
        : ''
    }

    ${sectionsHtml}

    ${
      attachmentItems.length > 0
        ? `<section class="attachments-box"><h2>Liitteet</h2><ul class="attachment-list">${attachmentItems.join('')}</ul></section>`
        : ''
    }

    ${
      data.closingText.trim()
        ? `<section class="closing-box"><h2>Pyyntö taloyhtiölle</h2><div>${textToHtml(data.closingText)}</div></section>`
        : ''
    }

    ${
      data.contactInfo.trim() || meta.companyName
        ? `<section class="signature-block">
            ${data.contactInfo.trim() ? `<div><strong>Yhteystiedot:</strong> ${esc(data.contactInfo)}</div>` : ''}
            <div><strong>${esc(meta.companyName)}</strong></div>
          </section>`
        : ''
    }
  </div>
</body>
</html>`;
}

export function resolveInstallationPlanPrintTitle(
  data: InstallationPlanData,
  customerName?: string | null,
): string {
  const property = data.propertyName.trim();
  if (property) return `${INSTALLATION_PLAN_DOCUMENT_TITLE} — ${property}`;
  if (customerName?.trim()) return `${INSTALLATION_PLAN_DOCUMENT_TITLE} — ${customerName.trim()}`;
  return INSTALLATION_PLAN_DOCUMENT_TITLE;
}
