import type { QuoteBulletItem, QuoteRequestData } from './types';
import { enabledOptionalItems, formatOptionalItemPrintPrice } from './optionalItemsPrint';

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function nonEmptyBulletItems(items: QuoteBulletItem[] | undefined): QuoteBulletItem[] {
  return (items ?? []).filter((item) => item.text.trim());
}

export function excludedFromQuotePrintHtml(data: QuoteRequestData): string {
  const items = nonEmptyBulletItems(data.excludedFromQuoteItems);
  if (!items.length) return '';

  const lines = items
    .map((item) => `<li>${escapeHtml(item.text.trim())}</li>`)
    .join('');

  return `<div class="quote-excluded-items-print"><strong>Ei kuulu tarjoukseen</strong><ul>${lines}</ul></div>`;
}

export function serviceOptionalItemsPrintHtml(data: QuoteRequestData): string {
  const items = enabledOptionalItems(data);
  if (!items.length) return '';

  const vatRate = Number(data.vatRate) || 0;
  const lines = items
    .map(
      (item) =>
        `<li>${escapeHtml(item.description.trim())} — ${formatOptionalItemPrintPrice(item.priceGross, vatRate)}</li>`,
    )
    .join('');

  return `<div class="quote-optional-items-print"><strong>Tilattavissa lisänä</strong><ul>${lines}</ul><p class="muted line-sub">Lisähinnat eivät sisälly tarjouksen kokonaishintaan.</p></div>`;
}
