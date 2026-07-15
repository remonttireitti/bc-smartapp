import { INSTALLATION_PLAN_DOCUMENT_TITLE } from './defaultTemplate';
import type { InstallationPlanAttachment, InstallationPlanData } from './types';

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textToHtml(value: string): string {
  return esc(value).replace(/\n/g, '<br />');
}

function sectionBodyHtml(body: string): string {
  const lines = body.split('\n').map((line) => line.trim()).filter(Boolean);
  const bulletLines = lines.filter((line) => line.startsWith('•') || line.startsWith('-'));
  if (bulletLines.length > 0 && bulletLines.length === lines.length) {
    return `<ul>${lines
      .map((line) => `<li>${esc(line.replace(/^[•-]\s*/, ''))}</li>`)
      .join('')}</ul>`;
  }
  return `<p>${textToHtml(body)}</p>`;
}

const PRINT_CSS = `
  :root {
    color-scheme: light;
    --text: #111827;
    --muted: #6b7280;
    --border: #d1d5db;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 24px 28px;
    font: 11pt/1.45 'Segoe UI', Arial, sans-serif;
    color: var(--text);
  }
  .print-header {
    display: flex;
    justify-content: space-between;
    gap: 24px;
    align-items: flex-start;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 2px solid var(--border);
  }
  .print-header h1 {
    margin: 0 0 6px;
    font-size: 18pt;
  }
  .print-header .company {
    text-align: right;
    font-size: 10pt;
  }
  .meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 24px;
    margin: 0 0 20px;
  }
  .meta-grid dt {
    margin: 0;
    font-weight: 600;
  }
  .meta-grid dd {
    margin: 0 0 8px;
  }
  .section {
    margin: 0 0 18px;
    page-break-inside: avoid;
  }
  .section h2 {
    margin: 0 0 8px;
    font-size: 12pt;
  }
  .section p, .section ul {
    margin: 0;
  }
  .section ul {
    padding-left: 1.2rem;
  }
  .closing {
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
  }
  .attachments {
    margin-top: 20px;
  }
  .attachments h2, .closing h2 {
    font-size: 12pt;
    margin: 0 0 8px;
  }
  .attachment-list {
    margin: 0;
    padding-left: 1.2rem;
  }
  @media print {
    body { padding: 0; }
  }
`;

export function generateInstallationPlanPrintHtml(input: {
  data: InstallationPlanData;
  companyName: string;
  logoUrl?: string | null;
  customerName?: string | null;
  attachments?: InstallationPlanAttachment[];
}): string {
  const { data, companyName, logoUrl, customerName, attachments = [] } = input;
  const sectionsHtml = data.sections
    .filter((section) => section.title.trim() || section.body.trim())
    .map(
      (section, index) => `
      <section class="section">
        <h2>${index + 1}. ${esc(section.title)}</h2>
        ${sectionBodyHtml(section.body)}
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

  return `<!DOCTYPE html>
<html lang="fi">
<head>
  <meta charset="utf-8" />
  <title>${esc(resolveInstallationPlanPrintTitle(data, customerName))}</title>
  <style>${PRINT_CSS}</style>
</head>
<body>
  <header class="print-header">
    <div>
      <h1>${esc(INSTALLATION_PLAN_DOCUMENT_TITLE)}</h1>
      ${customerName ? `<p>${esc(customerName)}</p>` : ''}
    </div>
    <div class="company">
      ${logoUrl ? `<img src="${esc(logoUrl)}" alt="" style="max-height:56px;max-width:180px;display:block;margin-left:auto;margin-bottom:8px;" />` : ''}
      <strong>${esc(companyName)}</strong>
    </div>
  </header>

  <dl class="meta-grid">
    ${data.propertyName.trim() ? `<dt>Kiinteistö / Taloyhtiö</dt><dd>${esc(data.propertyName)}</dd>` : ''}
    ${data.units.trim() ? `<dt>Asunnot / Huoneistot</dt><dd>${esc(data.units)}</dd>` : ''}
    ${data.installationType.trim() ? `<dt>Asennuksen tyyppi</dt><dd>${esc(data.installationType)}</dd>` : ''}
  </dl>

  ${data.descriptionIntro.trim() ? `<section class="section"><h2>Asennuksen kuvaus</h2><p>${textToHtml(data.descriptionIntro)}</p></section>` : ''}
  ${sectionsHtml}

  ${
    attachmentItems.length > 0
      ? `<section class="attachments"><h2>Liitteet</h2><ul class="attachment-list">${attachmentItems.join('')}</ul></section>`
      : ''
  }

  ${
    data.closingText.trim() || data.contactInfo.trim()
      ? `<section class="closing">
          ${data.closingText.trim() ? `<p>${textToHtml(data.closingText)}</p>` : ''}
          ${data.contactInfo.trim() ? `<p><strong>Yhteystiedot:</strong> ${esc(data.contactInfo)}</p>` : ''}
        </section>`
      : ''
  }

  ${data.notes.trim() ? `<section class="section"><h2>Huomautukset</h2><p>${textToHtml(data.notes)}</p></section>` : ''}
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
