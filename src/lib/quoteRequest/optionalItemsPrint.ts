import type { QuoteOptionalItem, QuoteRequestData } from './types';

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Syötetty hinta on aina alv 0 % -veroton. Tulosteessa lisätään ALV jos tarjouksella on ALV. */
export function optionalItemPrintAmount(priceNet: number, vatRate: number): number {
  const net = Number(priceNet) || 0;
  const vat = Number(vatRate) || 0;
  return vat > 0 ? net * (1 + vat / 100) : net;
}

export function formatOptionalItemPrintPrice(priceNet: number, vatRate: number): string {
  const amount = optionalItemPrintAmount(priceNet, vatRate);
  return `+ ${amount.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })}`;
}

export function enabledOptionalItems(data: QuoteRequestData): QuoteOptionalItem[] {
  return (data.optionalItems ?? []).filter((item) => item.enabled && item.description.trim());
}

export function optionalItemsPrintHtml(data: QuoteRequestData): string {
  const items = enabledOptionalItems(data);
  if (!items.length) return '';

  const vatRate = Number(data.vatRate) || 0;
  const lines = items
    .map(
      (item) =>
        `<li>${escapeHtml(item.description.trim())} — ${formatOptionalItemPrintPrice(item.priceGross, vatRate)}</li>`,
    )
    .join('');

  return `<div class="quote-optional-items-print"><strong>Valinnaiset lisät (ei mukana tarjoushintaan)</strong><ul>${lines}</ul></div>`;
}

/** Termatek-tulosteen tyyli (compact-list + section-title). */
export function optionalItemsTermatekPrintHtml(data: QuoteRequestData): string {
  const items = enabledOptionalItems(data);
  if (!items.length) return '';

  const vatRate = Number(data.vatRate) || 0;
  const lines = items
    .map(
      (item) =>
        `<li>${escapeHtml(item.description.trim())} — ${formatOptionalItemPrintPrice(item.priceGross, vatRate)}</li>`,
    )
    .join('');

  return `
    <div class="quote-optional-print">
      <div class="section-title">Valinnaiset lisät (ei mukana tarjoushintaan)</div>
      <ul class="compact-list">${lines}</ul>
    </div>`;
}
