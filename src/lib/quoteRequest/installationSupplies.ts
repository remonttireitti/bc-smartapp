import type { QuoteMaterial, QuoteRequestData } from './types';
import { materialPurchaseTotal, materialSellTotal } from './calculations';
import type { CompanySettings } from '../management';

export const INSTALLATION_SUPPLIES_PRINT_LABEL = 'Asennus tarvikkeet';

export const DEFAULT_INSTALLATION_LABOR_PURCHASE_RATE = 50;
export const DEFAULT_INSTALLATION_VEHICLE_ALLOWANCE = 50;
export const DEFAULT_INSTALLATION_VEHICLE_HOURS_PER_BLOCK = 8;

export function quoteInstallationDefaultsFromCompanySettings(
  settings: CompanySettings | null | undefined,
): Pick<
  QuoteRequestData,
  | 'installationLaborPurchaseRate'
  | 'installationVehicleAllowance'
  | 'installationVehicleHoursPerBlock'
> {
  return {
    installationLaborPurchaseRate:
      settings?.quotes?.installation_labor_purchase_rate ?? DEFAULT_INSTALLATION_LABOR_PURCHASE_RATE,
    installationVehicleAllowance:
      settings?.quotes?.installation_vehicle_allowance ?? DEFAULT_INSTALLATION_VEHICLE_ALLOWANCE,
    installationVehicleHoursPerBlock:
      settings?.quotes?.installation_vehicle_hours_per_block
      ?? DEFAULT_INSTALLATION_VEHICLE_HOURS_PER_BLOCK,
  };
}

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

/** Tuotteiden hankinta (ei sisällä työtä tai huoltoautoa). */
export function installationSuppliesPurchaseNet(items: QuoteMaterial[] | undefined): number {
  return materialPurchaseTotal(items ?? []);
}

export function installationVehicleBlocks(
  hours: number,
  hoursPerBlock = 8,
): number {
  const h = Number(hours) || 0;
  if (h <= 0) return 0;
  const block = Number(hoursPerBlock) || 8;
  return Math.ceil(h / block);
}

export function installationLaborPurchaseNet(data: Pick<
  QuoteRequestData,
  'installationLaborHours' | 'installationLaborPurchaseRate'
>): number {
  const hours = Number(data.installationLaborHours) || 0;
  const rate = Number(data.installationLaborPurchaseRate) || 0;
  if (hours <= 0 || rate <= 0) return 0;
  return roundMoney(hours * rate);
}

export function installationVehiclePurchaseNet(data: Pick<
  QuoteRequestData,
  | 'installationLaborHours'
  | 'installationVehicleAllowance'
  | 'installationVehicleHoursPerBlock'
>): number {
  const blocks = installationVehicleBlocks(
    data.installationLaborHours,
    data.installationVehicleHoursPerBlock,
  );
  const allowance = Number(data.installationVehicleAllowance) || 0;
  if (blocks <= 0 || allowance <= 0) return 0;
  return roundMoney(blocks * allowance);
}

/** Työn ja huoltoauton hankintakustannukset yhteensä. */
export function installationSuppliesInternalCostsNet(
  data: Pick<
    QuoteRequestData,
    | 'installationLaborHours'
    | 'installationLaborPurchaseRate'
    | 'installationVehicleAllowance'
    | 'installationVehicleHoursPerBlock'
  >,
): number {
  return roundMoney(
    installationLaborPurchaseNet(data) + installationVehiclePurchaseNet(data),
  );
}

/** Kaikki asennustarvikke-laskurin hankintakustannukset (tuotteet + työ + huoltoauto). */
export function installationSuppliesTotalPurchaseNet(
  data: Pick<
    QuoteRequestData,
    | 'installationSupplies'
    | 'installationLaborHours'
    | 'installationLaborPurchaseRate'
    | 'installationVehicleAllowance'
    | 'installationVehicleHoursPerBlock'
  >,
): number {
  return roundMoney(
    installationSuppliesPurchaseNet(data.installationSupplies)
      + installationSuppliesInternalCostsNet(data),
  );
}

export function installationSuppliesProductMarginNet(
  data: Pick<QuoteRequestData, 'installationSupplies'>,
): number {
  const items = data.installationSupplies ?? [];
  return roundMoney(installationSuppliesSellNet(items) - installationSuppliesPurchaseNet(items));
}

/** Kate tuotteiden myynnistä vähennettynä kaikilla sisäisillä hankinnoilla. */
export function installationSuppliesNetMarginNet(
  data: Pick<
    QuoteRequestData,
    | 'installationSupplies'
    | 'installationLaborHours'
    | 'installationLaborPurchaseRate'
    | 'installationVehicleAllowance'
    | 'installationVehicleHoursPerBlock'
  >,
): number {
  return roundMoney(
    installationSuppliesSellNet(data.installationSupplies)
      - installationSuppliesTotalPurchaseNet(data),
  );
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

function formatEuro(value: number): string {
  return value.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' });
}

export function installationSuppliesSubtitle(form: QuoteRequestData): string {
  const items = (form.installationSupplies ?? []).filter((row) => row.name.trim());
  const sellNet = installationSuppliesSellNet(items);
  const hours = Number(form.installationLaborHours) || 0;
  const parts: string[] = [];

  if (items.length > 0) {
    parts.push(`${items.length} tuotetta`);
  }
  if (hours > 0) {
    const rate = Number(form.installationLaborPurchaseRate) || 0;
    parts.push(rate > 0 ? `${hours} h × ${formatEuro(rate)}/h` : `${hours} h työtä`);
  }
  if (sellNet > 0) {
    parts.push(formatEuro(sellNet));
  } else if (parts.length === 0) {
    return 'Laskuri sisäiseen hinnoitteluun';
  } else if (items.length > 0) {
    parts.push('täytä hinnat');
  }

  return parts.join(' · ');
}

export function generateInstallationSuppliesPrintHtml(
  form: QuoteRequestData,
  options?: { title?: string; companyName?: string },
): string {
  const title = options?.title ?? INSTALLATION_SUPPLIES_PRINT_LABEL;
  const rows = (form.installationSupplies ?? []).filter((row) => row.name.trim());
  const productPurchase = installationSuppliesPurchaseNet(rows);
  const sellTotal = installationSuppliesSellNet(rows);
  const productMargin = sellTotal - productPurchase;
  const laborPurchase = installationLaborPurchaseNet(form);
  const vehicleBlocks = installationVehicleBlocks(
    form.installationLaborHours,
    form.installationVehicleHoursPerBlock,
  );
  const vehiclePurchase = installationVehiclePurchaseNet(form);
  const internalCosts = laborPurchase + vehiclePurchase;
  const totalPurchase = productPurchase + internalCosts;
  const netMargin = sellTotal - totalPurchase;
  const productMarginPct = sellTotal > 0 ? Math.round((productMargin / sellTotal) * 1000) / 10 : 0;
  const netMarginPct = sellTotal > 0 ? Math.round((netMargin / sellTotal) * 1000) / 10 : 0;

  const esc = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

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

  const laborHours = Number(form.installationLaborHours) || 0;
  const laborRate = Number(form.installationLaborPurchaseRate) || 0;
  const vehicleAllowance = Number(form.installationVehicleAllowance) || 0;
  const hoursPerBlock = Number(form.installationVehicleHoursPerBlock) || 8;

  const costRows: string[] = [];
  if (laborHours > 0 && laborRate > 0) {
    costRows.push(`<tr>
      <td>Asentajan työ (hankinta)</td>
      <td class="num">${laborHours} h</td>
      <td class="num">${formatEuro(laborRate)} / h</td>
      <td colspan="3"></td>
      <td class="num">${formatEuro(laborPurchase)}</td>
    </tr>`);
  }
  if (vehicleBlocks > 0 && vehicleAllowance > 0) {
    costRows.push(`<tr>
      <td>Huoltoautokorvaus (hankinta)</td>
      <td class="num">${vehicleBlocks} kpl</td>
      <td class="num">${formatEuro(vehicleAllowance)} / ${hoursPerBlock} h</td>
      <td colspan="3"></td>
      <td class="num">${formatEuro(vehiclePurchase)}</td>
    </tr>`);
  }

  return `<!DOCTYPE html>
<html lang="fi">
<head>
  <meta charset="utf-8" />
  <title>${esc(title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; color: #0f172a; }
    h1 { font-size: 1.25rem; margin: 0 0 4px; }
    .meta { color: #64748b; font-size: 0.9rem; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; margin-bottom: 16px; }
    th, td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; }
    th { background: #f8fafc; }
    .num { text-align: right; white-space: nowrap; }
    tfoot td { font-weight: 700; background: #f8fafc; }
    .summary { margin-top: 12px; font-size: 0.95rem; line-height: 1.6; }
    @media print { body { margin: 12px; } }
  </style>
</head>
<body>
  <h1>${esc(title)}</h1>
  ${options?.companyName ? `<div class="meta">${esc(options.companyName)}</div>` : ''}
  <h2 style="font-size:1rem;margin:16px 0 8px;">Tuotteet</h2>
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
      ${bodyRows || '<tr><td colspan="7">Ei tuoterivejä</td></tr>'}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="5">Tuotteet yhteensä</td>
        <td class="num">${formatEuro(sellTotal)}</td>
        <td class="num">${formatEuro(productMargin)} (${productMarginPct} %)</td>
      </tr>
    </tfoot>
  </table>
  ${costRows.length > 0 ? `<h2 style="font-size:1rem;margin:16px 0 8px;">Sisäiset hankintakustannukset</h2>
  <table>
    <thead>
      <tr>
        <th>Kustannus</th>
        <th class="num">Määrä</th>
        <th class="num">Hinta</th>
        <th colspan="3"></th>
        <th class="num">Yhteensä</th>
      </tr>
    </thead>
    <tbody>${costRows.join('')}</tbody>
    <tfoot>
      <tr>
        <td colspan="6">Sisäiset kustannukset yhteensä</td>
        <td class="num">${formatEuro(internalCosts)}</td>
      </tr>
    </tfoot>
  </table>` : ''}
  <div class="summary">
    <div>Tuotteiden myynti: <strong>${formatEuro(sellTotal)}</strong></div>
    <div>Tuotteiden kate: <strong>${formatEuro(productMargin)}</strong></div>
    ${internalCosts > 0 ? `<div>Sisäiset kustannukset: <strong>${formatEuro(internalCosts)}</strong></div>` : ''}
    <div>Kokonaiskate (myynti − kaikki hankinta): <strong>${formatEuro(netMargin)} (${netMarginPct} %)</strong></div>
  </div>
  <p class="meta">Sisäinen erittely — asiakkaan tarjouksessa näkyy yhtenä rivinä "${esc(INSTALLATION_SUPPLIES_PRINT_LABEL)}".</p>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;
}
