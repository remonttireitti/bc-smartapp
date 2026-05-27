const BC_SMARTAPP_PRINT_URL = 'https://bc-smartapp.web.app/';

const BC_SMARTAPP_PRINT_FOOTER_CSS = `
  .bc-smartapp-print-footer {
    margin-top: 1.35rem;
    padding-top: 0.65rem;
    border-top: 1px solid #cbd5e1;
    font-size: 9pt;
    line-height: 1.4;
    color: #475569;
    text-align: center;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .bc-smartapp-print-footer a {
    color: #2563eb;
    text-decoration: none;
  }
  @media print {
    .bc-smartapp-print-footer { border-top-color: #94a3b8; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

const BC_SMARTAPP_PRINT_FOOTER_HTML = `
<div class="bc-smartapp-print-footer" data-bc-smartapp-branding="1">
  Tämän raportin tuottaisi <a href="${BC_SMARTAPP_PRINT_URL}" target="_blank" rel="noopener noreferrer">BC Smartapp</a>
</div>`;

/** Same wrapper as old huoltoraportti print (footer branding). */
export function withDemoPrintBootstrap(html: string): string {
  const styleTag = `<style data-bc-smartapp-print="1">${BC_SMARTAPP_PRINT_FOOTER_CSS}</style>`;
  let out = html;
  if (/<\/head>/i.test(out)) {
    out = out.replace(/<\/head>/i, `${styleTag}</head>`);
  } else {
    out = styleTag + out;
  }
  if (/<\/body>/i.test(out)) {
    out = out.replace(/<\/body>/i, `${BC_SMARTAPP_PRINT_FOOTER_HTML}</body>`);
  } else {
    out += BC_SMARTAPP_PRINT_FOOTER_HTML;
  }
  return out;
}
