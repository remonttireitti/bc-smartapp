import type { QuoteMaterial, QuoteRequestData } from './types';
import { materialPurchaseTotal, materialSellTotal } from './calculations';

export const INSTALLATION_SUPPLIES_PRINT_LABEL = 'Asennus tarvikkeet';

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeInstallationSupplySellPrice(
  purchasePrice: number,
  marginPercent: number,
  quantity = 1,
): number {
  const purchase = Number(purchasePrice) || 0;
  const qty = Number(quantity) || 0;
  if (purchase <= 0 || qty <= 0) return 0;
  const margin = Number(marginPercent) || 0;
  return roundMoney(purchase * qty * (1 + margin / 100));
}

export function installationSuppliesSellNet(items: QuoteMaterial[] | undefined): number {
  return materialSellTotal(items ?? []);
}

export function installationSuppliesPurchaseNet(items: QuoteMaterial[] | undefined): number {
  return materialPurchaseTotal(items ?? []);
}

export function syncInstallationSupplyRow(
  row: QuoteMaterial,
  patch: Partial<QuoteMaterial>,
): QuoteMaterial {
  const next = { ...row, ...patch };
  if ('purchasePrice' in patch || 'marginPercent' in patch || 'quantity' in patch) {
    const sellPrice = computeInstallationSupplySellPrice(
      next.purchasePrice,
      next.marginPercent,
      next.quantity,
    );
    return { ...next, sellPrice };
  }
  return next;
}

export function patchInstallationSupplies(items: QuoteMaterial[]): Partial<QuoteRequestData> {
  return { installationSupplies: items };
}

export function installationSuppliesSubtitle(form: QuoteRequestData): string {
  const items = (form.installationSupplies ?? []).filter((row) => row.name.trim());
  const sellNet = installationSuppliesSellNet(items);
  if (sellNet > 0) {
    return `${items.length} tuotetta · ${sellNet.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })}`;
  }
  if (items.length > 0) return `${items.length} riviä — täytä hinnat`;
  return 'Laskuri sisäiseen hinnoitteluun';
}

export function generateInstallationSuppliesPrintHtml(
  items: QuoteMaterial[],
  options?: { title?: string; companyName?: string },
): string {
  const title = options?.title ?? INSTALLATION_SUPPLIES_PRINT_LABEL;
  const rows = items.filter((row) => row.name.trim());
  const purchaseTotal = installationSuppliesPurchaseNet(rows);
  const sellTotal = installationSuppliesSellNet(rows);
  const marginTotal = sellTotal - purchaseTotal;
  const marginPct = sellTotal > 0 ? Math.round((marginTotal / sellTotal) * 1000) / 10 : 0;

  const esc = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const formatEuro = (value: number) =>
    value.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' });

  const bodyRows = rows
    .map((row) => {
      const qty = Number(row.quantity) || 0;
      const purchase = qty * (Number(row.purchasePrice) || 0);
      const sell = qty * (Number(row.sellPrice) || 0);
      const margin = sell - purchase;
      return `<tr>
        <td>${esc(row.name)}</td>
        <td class="num">${qty}</td>
        <td class="num">${formatEuro(Number(row.purchasePrice) || 0)}</td>
        <td class="num">${Number(row.marginPercent) || 0} %</td>
        <td class="num">${formatEuro(Number(row.sellPrice) || 0)}</td>
        <td class="num">${formatEuro(sell)}</td>
        <td class="num">${formatEuro(margin)}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="fi">
<head>
  <meta charset="utf-8" />
  <title>${esc(title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; color: #0f172a; }
    h1 { font-size: 1.25rem; margin: 0 0 4px; }
    .meta { color: #64748b; font-size: 0.9rem; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    th, td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; }
    th { background: #f8fafc; }
    .num { text-align: right; white-space: nowrap; }
    tfoot td { font-weight: 700; background: #f8fafc; }
    @media print { body { margin: 12px; } }
  </style>
</head>
<body>
  <h1>${esc(title)}</h1>
  ${options?.companyName ? `<div class="meta">${esc(options.companyName)}</div>` : ''}
  <table>
    <thead>
      <tr>
        <th>Tuote</th>
        <th class="num">Määrä</th>
        <th class="num">Hankinta</th>
        <th class="num">Kate</th>
        <th class="num">Myynti / kpl</th>
        <th class="num">Yhteensä</th>
        <th class="num">Kate €</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows || '<tr><td colspan="7">Ei rivejä</td></tr>'}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="5">Yhteensä</td>
        <td class="num">${formatEuro(sellTotal)}</td>
        <td class="num">${formatEuro(marginTotal)} (${marginPct} %)</td>
      </tr>
    </tfoot>
  </table>
  <p class="meta">Sisäinen erittely — asiakkaan tarjouksessa näkyy yhtenä rivinä "${esc(INSTALLATION_SUPPLIES_PRINT_LABEL)}".</p>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;
}
