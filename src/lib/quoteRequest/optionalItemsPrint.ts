import type { QuoteOptionalItem, QuoteRequestData } from './types';

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function enabledOptionalItems(data: QuoteRequestData): QuoteOptionalItem[] {
  return (data.optionalItems ?? []).filter((item) => item.enabled && item.description.trim());
}

export function optionalItemsPrintHtml(data: QuoteRequestData): string {
  const items = enabledOptionalItems(data);
  if (!items.length) return '';

  const lines = items
    .map(
      (item) =>
        `<li>${escapeHtml(item.description.trim())} — hinta + ${item.priceGross.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })}</li>`,
    )
    .join('');

  return `<div class="quote-optional-items-print"><strong>Valinnaiset lisät (ei mukana tarjoushintaan)</strong><ul>${lines}</ul></div>`;
}

/** Termatek-tulosteen tyyli (compact-list + section-title). */
export function optionalItemsTermatekPrintHtml(data: QuoteRequestData): string {
  const items = enabledOptionalItems(data);
  if (!items.length) return '';

  const lines = items
    .map(
      (item) =>
        `<li>${escapeHtml(item.description.trim())} — hinta + ${item.priceGross.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })}</li>`,
    )
    .join('');

  return `
    <div class="quote-optional-print">
      <div class="section-title">Valinnaiset lisät (ei mukana tarjoushintaan)</div>
      <ul class="compact-list">${lines}</ul>
    </div>`;
}
