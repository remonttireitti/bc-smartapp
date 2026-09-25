import type { PartnerBillingRates } from './management';
import type { BillingQuotePurchaseLine } from './quotePurchaseLines';
import {
  compareQuoteInstallationToWorkReport,
  type InstallationComparison,
} from './quoteInstallationComparison';
import { normalizeQuoteRequestData } from './quoteRequest/defaults';
import { installationVehiclePurchaseNet } from './quoteRequest/installationSupplies';
import type { BillableCalculation } from './workReportBilling';
import type { BillingQuoteSettings } from './workReportBillingQuote';
import type { WorkReportDailyLog } from '../types';

export type QuoteCategoryKey = 'labor' | 'supplies' | 'expenses' | 'device';

export type QuoteCategoryRow = {
  key: QuoteCategoryKey;
  label: string;
  quoteQty: number | null;
  actualQty: number | null;
  quoteNet: number;
  actualNet: number;
  varianceNet: number;
  /** Lyhyt selite tarjousarviolle (esim. "sis. huoltoautokorvaus 50 €"). */
  quoteNote?: string | null;
};

export type QuoteCategoryComparison = {
  rows: QuoteCategoryRow[];
  quoteTotalNet: number;
  actualTotalNet: number;
  varianceNet: number;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function rowFromInstallation(
  installation: InstallationComparison | null,
  key: 'labor' | 'expenses',
): Pick<QuoteCategoryRow, 'quoteQty' | 'actualQty' | 'quoteNet' | 'actualNet'> {
  if (!installation) {
    return { quoteQty: null, actualQty: null, quoteNet: 0, actualNet: 0 };
  }

  const byKey = new Map(installation.rows.map((row) => [row.key, row]));

  if (key === 'labor') {
    const labor = byKey.get('labor');
    const hours = byKey.get('hours');
    return {
      quoteQty: hours?.quoteQty ?? labor?.quoteQty ?? null,
      actualQty: hours?.actualQty ?? labor?.actualQty ?? null,
      quoteNet: labor?.quoteCostNet ?? 0,
      actualNet: labor?.actualCostNet ?? 0,
    };
  }

  const travel = byKey.get('travel');
  const travelKm = byKey.get('travel_km');
  const other = byKey.get('other_expenses');
  const quoteNet = roundMoney((travel?.quoteCostNet ?? 0) + (other?.quoteCostNet ?? 0));
  const actualNet = roundMoney((travel?.actualCostNet ?? 0) + (other?.actualCostNet ?? 0));
  return {
    quoteQty: travelKm?.quoteQty ?? travel?.quoteQty ?? null,
    actualQty: travelKm?.actualQty ?? travel?.actualQty ?? null,
    quoteNet,
    actualNet,
  };
}

function sumPurchaseLines(
  lines: BillingQuotePurchaseLine[],
  field: 'quote_purchase_net' | 'actual_purchase_net',
  device: boolean,
): number {
  return roundMoney(
    lines
      .filter((line) => (device ? line.source === 'device' : line.source !== 'device'))
      .reduce((sum, line) => sum + Number(line[field] ?? 0), 0),
  );
}

function buildCategoryRow(
  key: QuoteCategoryKey,
  label: string,
  quoteQty: number | null,
  actualQty: number | null,
  quoteNet: number,
  actualNet: number,
): QuoteCategoryRow {
  return {
    key,
    label,
    quoteQty,
    actualQty,
    quoteNet: roundMoney(quoteNet),
    actualNet: roundMoney(actualNet),
    varianceNet: roundMoney(actualNet - quoteNet),
  };
}

/**
 * Vertaa tarjouspyynnön ja työraportin neljää kategoriaa:
 * työt, tarvikkeet, kulut (ajot + muut kulurivit), laite.
 */
export function compareQuoteCategories(input: {
  quoteData: unknown;
  partnerCalculation: BillableCalculation | null | undefined;
  logs: WorkReportDailyLog[];
  partnerRates: PartnerBillingRates;
  tripKmRate?: number | null;
  billingSettings: BillingQuoteSettings;
}): QuoteCategoryComparison | null {
  const installation = compareQuoteInstallationToWorkReport({
    quoteData: input.quoteData,
    partnerCalculation: input.partnerCalculation,
    logs: input.logs,
    partnerRates: input.partnerRates,
    tripKmRate: input.tripKmRate,
  });

  const purchaseLines = input.billingSettings.purchase_lines ?? [];
  const labor = rowFromInstallation(installation, 'labor');
  const expenses = rowFromInstallation(installation, 'expenses');
  const suppliesQuote = sumPurchaseLines(purchaseLines, 'quote_purchase_net', false);
  const suppliesActual = sumPurchaseLines(purchaseLines, 'actual_purchase_net', false);
  const deviceQuote = sumPurchaseLines(purchaseLines, 'quote_purchase_net', true);
  const deviceActual = sumPurchaseLines(purchaseLines, 'actual_purchase_net', true);
  // Huoltoautokorvaus on tarjouksen sisäinen kulu (sama kuin tarjouksen "Hankinta"):
  // vertaillaan Kulut-kategoriassa toteutuneisiin ajoihin.
  const vehicleQuote = roundMoney(installationVehiclePurchaseNet(normalizeQuoteRequestData(input.quoteData)));

  const rows: QuoteCategoryRow[] = [
    buildCategoryRow('labor', 'Työt', labor.quoteQty, labor.actualQty, labor.quoteNet, labor.actualNet),
    buildCategoryRow(
      'supplies',
      'Tarvikkeet',
      null,
      null,
      suppliesQuote,
      suppliesActual,
    ),
    {
      ...buildCategoryRow(
        'expenses',
        'Kulut (ajot ja muut)',
        expenses.quoteQty,
        expenses.actualQty,
        expenses.quoteNet + vehicleQuote,
        expenses.actualNet,
      ),
      quoteNote:
        vehicleQuote > 0.005
          ? `sis. huoltoautokorvaus ${vehicleQuote.toFixed(2).replace('.', ',')} €`
          : null,
    },
    buildCategoryRow('device', 'Laite', null, null, deviceQuote, deviceActual),
  ].filter(
    (row) =>
      row.quoteNet > 0.005
      || row.actualNet > 0.005
      || row.quoteQty != null
      || row.actualQty != null,
  );

  if (rows.length === 0) return null;

  const quoteTotalNet = roundMoney(rows.reduce((sum, row) => sum + row.quoteNet, 0));
  const actualTotalNet = roundMoney(rows.reduce((sum, row) => sum + row.actualNet, 0));

  return {
    rows,
    quoteTotalNet,
    actualTotalNet,
    varianceNet: roundMoney(actualTotalNet - quoteTotalNet),
  };
}

export function formatCategoryQty(
  row: QuoteCategoryRow,
  value: number | null,
): string {
  if (value == null) return '—';
  const suffix = row.key === 'labor' ? ' h' : row.key === 'expenses' ? ' km' : '';
  return `${value.toLocaleString('fi-FI', { maximumFractionDigits: 2 })}${suffix}`;
}

export function renderQuoteCategoryComparisonHtml(
  comparison: QuoteCategoryComparison,
  options?: { escapeHtml?: (value: string) => string; formatEuro?: (value: number) => string },
): string {
  const esc = options?.escapeHtml ?? ((value: string) => value);
  const format = options?.formatEuro ?? ((value: number) => `${value.toFixed(2)} €`);

  const body = comparison.rows
    .map((row) => {
      const changed = Math.abs(row.varianceNet) > 0.005;
      const showQty = row.key === 'labor' || row.key === 'expenses';
      return `<tr${changed ? ' class="changed-row"' : ''}>
        <td>${esc(row.label)}</td>
        <td class="num">${showQty ? formatCategoryQty(row, row.quoteQty) : '—'}</td>
        <td class="num">${showQty ? formatCategoryQty(row, row.actualQty) : '—'}</td>
        <td class="num">${row.quoteNet > 0.005 ? format(row.quoteNet) : '—'}</td>
        <td class="num">${row.actualNet > 0.005 ? format(row.actualNet) : '—'}</td>
        <td class="num">${row.quoteNet > 0.005 || row.actualNet > 0.005 ? format(row.varianceNet) : '—'}</td>
      </tr>`;
    })
    .join('');

  return `<h3 class="billing-subheading">Tarjous vs toteutunut</h3>
  <table>
    <thead>
      <tr>
        <th>Kategoria</th>
        <th class="num">Tarjous määrä</th>
        <th class="num">Toteutunut määrä</th>
        <th class="num">Tarjous €</th>
        <th class="num">Toteutunut €</th>
        <th class="num">Ero €</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
    <tfoot>
      <tr>
        <td><strong>Yhteensä</strong></td>
        <td class="num">—</td>
        <td class="num">—</td>
        <td class="num"><strong>${format(comparison.quoteTotalNet)}</strong></td>
        <td class="num"><strong>${format(comparison.actualTotalNet)}</strong></td>
        <td class="num"><strong>${format(comparison.varianceNet)}</strong></td>
      </tr>
    </tfoot>
  </table>
  <p class="muted">Työt, tarvikkeet, kulut ja laite vastaavat tarjouspyynnön ja työraportin merkintöjä. Arviota ja toteutunutta verrataan — niitä ei summata.</p>`;
}
