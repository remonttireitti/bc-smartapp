import type { QuotePrintMeta } from './printHtml';

export const QUOTE_CLOSING_THANK_YOU_TEXT =
  'Kiitos tarjouspyynnöstänne. Toivomme, että tarjouksemme vastaa tarpeitanne ja johtaa hyvään yhteistyöhön.';

export const QUOTE_CLOSING_SIGNATURE_LABEL = 'Ystävällisin terveisin';

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function quoteClosingPrintStyles(): string {
  return `
    .quote-print-end-block {
      margin-top: 14px;
      break-inside: avoid;
      page-break-inside: avoid;
      break-before: auto;
      page-break-before: auto;
    }
    .quote-closing {
      margin-top: 0;
      padding-top: 12px;
      border-top: 1px solid #cbd5e1;
      color: #334155;
      font-size: 11px;
      line-height: 1.55;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .quote-closing-thanks { margin: 0 0 10px; }
    .quote-closing-signature { margin: 0; font-weight: 600; color: #0f172a; }
    .quote-closing-company { margin: 6px 0 0; font-weight: 700; color: #0f172a; }
    .quote-closing-name { margin: 2px 0 0; }
  `;
}

export function quoteClosingPrintHtml(meta: QuotePrintMeta): string {
  const signatory = meta.settings?.quote_signatory_name?.trim() || '';
  return `<section class="quote-closing">
    <p class="quote-closing-thanks">${escapeHtml(QUOTE_CLOSING_THANK_YOU_TEXT)}</p>
    <p class="quote-closing-signature">${escapeHtml(QUOTE_CLOSING_SIGNATURE_LABEL)}</p>
    <p class="quote-closing-company">${escapeHtml(meta.companyName)}</p>
    ${signatory ? `<p class="quote-closing-name">${escapeHtml(signatory)}</p>` : ''}
  </section>`;
}
