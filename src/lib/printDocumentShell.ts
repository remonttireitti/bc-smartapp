export function escapeHtmlPrint(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type PrintBranding = {
  companyName: string;
  logoUrl?: string | null;
};

export function getPrintShellStyles(): string {
  return `
  @page { size: A4; margin: 14mm; }
  :root { --text:#111827; --muted:#6b7280; --border:#e5e7eb; --soft:#f9fafb; --accent:#F0810F; --accent-strong:#D97706; }
  *, *::before, *::after { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: var(--text); margin: 0; padding: 0 2mm; }
  .header { display:grid; grid-template-columns: 55mm 1fr 55mm; align-items:start; border-bottom: 4px dashed var(--accent-strong); padding-bottom: 4mm; }
  .h-left { display:flex; align-items:center; min-height: 24mm; }
  .h-center { text-align:center; }
  .h-right { text-align:right; color: var(--muted); font-size: 10pt; }
  .logo { height: 18mm; max-width: 55mm; object-fit: contain; }
  .logo-space { width: 55mm; height: 18mm; }
  h1 { margin: 0; font-size: 18pt; }
  .subtitle { margin-top: 1mm; color: var(--muted); font-size: 10.5pt; }
  .badge { display:inline-block; margin-top: 2mm; padding: 1.5mm 3mm; border-radius: 999px; border:1px solid var(--border); background: var(--soft); font-size: 9.5pt; }
  .main-block { margin-top: 5mm; }
  .tbl { width:100%; border-collapse: collapse; margin-top: 2mm; font-size: 10.5pt; background: #fff; border: 2px solid var(--border); }
  .tbl th, .tbl td { border:1px solid var(--border); padding: 2.8mm 2.5mm; vertical-align: top; }
  .tbl th { background: var(--soft); text-align:left; font-size: 9.5pt; }
  .kv-table th[scope="row"] { width: 34%; font-weight: 600; color: #374151; }
  .sec-h2 { margin: 8mm auto 4mm; font-size: 12pt; color:#1f2937; text-align: center; border-bottom: 4px dashed var(--accent-strong); padding: 0 0 2.5mm; }
  .footer { margin-top: 8mm; font-size: 9pt; color: var(--muted); border-top: 1px solid var(--border); padding-top: 4mm; }
  .print-card-section { margin-top: 5mm; padding: 4mm; background: #fff; border: 1px solid var(--border); border-radius: 10px; break-inside: avoid; }
  .print-card-h2 { margin: 0 0 3mm; padding-bottom: 2mm; font-size: 11pt; font-weight: 700; border-bottom: 2px solid var(--accent); }
  .print-card-muted { margin: 2mm 0 0; font-size: 10pt; color: var(--muted); font-style: italic; }
  .print-card-body { margin-top: 1mm; }
  .print-card-h3 { margin: 3mm 0 2mm; font-size: 10.5pt; font-weight: 700; color: #374151; }
  .print-card-h4 { margin: 0 0 2mm; font-size: 10pt; font-weight: 700; color: #4b5563; }
  .print-card-subblock { margin-top: 3mm; padding: 3mm; border: 1px solid var(--border); border-radius: 8px; background: var(--soft); break-inside: avoid; }
  .print-card-nest { margin-top: 2mm; padding-top: 1mm; border-top: 1px dashed var(--border); }
  .print-card-lead { margin: 0 0 2mm; font-size: 10pt; }
  .print-card-snapshot-wrap .print-card-section { margin-top: 3mm; }
  .print-card-snapshot-wrap .print-card-section:first-child { margin-top: 0; }
`;
}

export type StyledPrintDocumentOpts = {
  documentTitle: string;
  pageH1: string;
  subtitleEscaped: string;
  badge?: string;
  rightColumnHtml?: string;
  mainHtml: string;
  footerHtml?: string;
  branding: PrintBranding;
};

export function buildStyledPrintDocumentHtml(opts: StyledPrintDocumentOpts): string {
  const logoUrl = opts.branding.logoUrl?.trim() || '';
  const companyNameEscaped = escapeHtmlPrint(opts.branding.companyName);
  const logoHtml = logoUrl
    ? `<img class="logo" src="${escapeHtmlPrint(logoUrl)}" alt="${companyNameEscaped}" />`
    : `<div class="logo-space"></div>`;
  const badgeHtml = opts.badge ? `<div class="badge">${escapeHtmlPrint(opts.badge)}</div>` : '';
  const rightHtml =
    opts.rightColumnHtml ||
    `<div>Päiväys: <strong>${escapeHtmlPrint(new Date().toLocaleDateString('fi-FI'))}</strong></div>`;

  return `<!doctype html>
<html lang="fi">
<head>
<meta charset="utf-8" />
<title>${escapeHtmlPrint(opts.documentTitle)}</title>
<style>${getPrintShellStyles()}</style>
</head>
<body>
  <div class="header">
    <div class="h-left">${logoHtml}</div>
    <div class="h-center">
      <h1>${escapeHtmlPrint(opts.pageH1)}</h1>
      <div class="subtitle">${opts.subtitleEscaped}</div>
      ${badgeHtml}
    </div>
    <div class="h-right">${rightHtml}</div>
  </div>
  <div class="main-block">${opts.mainHtml}</div>
  ${opts.footerHtml ? `<div class="footer">${opts.footerHtml}</div>` : ''}
  <script>window.onload = function() { window.print(); };</script>
</body>
</html>`;
}

function kvTable(rows: { label: string; value: string }[]): string {
  if (rows.length === 0) return '<p class="print-card-muted">—</p>';
  return `<table class="tbl kv-table"><tbody>${rows
    .map(
      (row) =>
        `<tr><th scope="row">${escapeHtmlPrint(row.label)}</th><td>${escapeHtmlPrint(row.value)}</td></tr>`,
    )
    .join('')}</tbody></table>`;
}

export function printCardSection(title: string, rows: { label: string; value: string }[]): string {
  return `<section class="print-card-section"><h2 class="print-card-h2">${escapeHtmlPrint(title)}</h2>${kvTable(rows)}</section>`;
}
