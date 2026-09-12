import type { PartnerBillingRates } from './management';
import { quoteUsesTravelCost } from './quoteRequest/constants';
import { normalizeQuoteRequestData } from './quoteRequest/defaults';
import {
  installationSuppliesExpensePurchaseNet,
  installationSuppliesLaborHours,
  installationSuppliesLaborPurchaseNet,
  resolveQuoteMaterialRowKind,
} from './quoteRequest/installationSupplies';
import type { QuoteMaterial, QuoteRequestData } from './quoteRequest/types';
import type { BillableCalculation } from './workReportBilling';
import { billableLineDisplayTotal } from './workReportBilling';
import type { WorkReportDailyLog } from '../types';
import { sumDailyHours } from '../types';

export type InstallationComparisonRow = {
  key: 'hours' | 'labor' | 'travel_km' | 'travel' | 'other_expenses' | 'total';
  label: string;
  quoteQty: number | null;
  actualQty: number | null;
  quoteCostNet: number;
  actualCostNet: number;
  varianceNet: number;
};

export type InstallationComparison = {
  rows: InstallationComparisonRow[];
  quoteTotalNet: number;
  actualTotalNet: number;
  varianceNet: number;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundQty(value: number): number {
  return Math.round(value * 100) / 100;
}

const KM_COMPENSATION_PATTERN = /km[-\s]?korvaus/i;

function isKmCompensationMaterial(name: string): boolean {
  return KM_COMPENSATION_PATTERN.test(name.trim());
}

function quoteKmFromMaterials(materials: QuoteMaterial[]): number {
  return materials.reduce((sum, material) => {
    if (!isKmCompensationMaterial(material.name)) return sum;
    return sum + (Number(material.quantity) || 0);
  }, 0);
}

export function quoteLaborHours(data: QuoteRequestData): number {
  const fromRows = installationSuppliesLaborHours(data.installationSupplies);
  const fromItems = data.workItems.reduce((sum, item) => sum + (Number(item.hours) || 0), 0);
  if (fromItems > 0) return roundQty(fromItems + fromRows);
  const fromField = roundQty(Number(data.laborHours) || 0);
  return roundQty(fromField + fromRows);
}

export function quoteTravelKm(data: QuoteRequestData): number {
  if (quoteUsesTravelCost(data.type) && data.travelKmEnabled) {
    const fromField = roundQty(Number(data.travelKmDistance) || 0);
    if (fromField > 0) return fromField;
  }

  const fromWorkItems = data.workItems.reduce(
    (sum, item) => sum + quoteKmFromMaterials(item.materials ?? []),
    0,
  );
  const fromTopLevel = quoteKmFromMaterials(data.materials ?? []);
  const fromInstallation = quoteKmFromMaterials(
    (data.installationSupplies ?? []).filter(
      (row) => resolveQuoteMaterialRowKind(row) !== 'labor',
    ),
  );
  const fromExpenseRows = (data.installationSupplies ?? [])
    .filter((row) => resolveQuoteMaterialRowKind(row) === 'expense' && isKmCompensationMaterial(row.name))
    .reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
  return roundQty(fromWorkItems + fromTopLevel + fromInstallation + fromExpenseRows);
}

/** Tarjouksen työ- ja ajobudjetti kumppanihinnoilla (vertailukelpoinen työraportin laskentaan). */
export function computeQuoteInstallationBudget(
  data: unknown,
  options: {
    partnerRates: PartnerBillingRates;
    tripKmRate?: number | null;
  },
): Pick<InstallationComparison, 'rows' | 'quoteTotalNet'> {
  const quote = normalizeQuoteRequestData(data);
  const laborRate =
    Number(quote.installationLaborPurchaseRate) > 0
      ? Number(quote.installationLaborPurchaseRate)
      : Number(options.partnerRates.hourly_regular) || 0;
  const tripKmRate =
    options.tripKmRate != null && Number(options.tripKmRate) > 0
      ? Number(options.tripKmRate)
      : Number(quote.travelKmRate) || 0;

  const hours = quoteLaborHours(quote);
  const laborRowCost = installationSuppliesLaborPurchaseNet(quote.installationSupplies);
  const laborCost = roundMoney(hours * laborRate + laborRowCost);
  const travelKm = quoteTravelKm(quote);
  const expenseRowCost = installationSuppliesExpensePurchaseNet(quote.installationSupplies);
  const travelCost = roundMoney(travelKm * tripKmRate + expenseRowCost);

  const rows: InstallationComparisonRow[] = [
    {
      key: 'hours',
      label: 'Työtunnit',
      quoteQty: hours,
      actualQty: null,
      quoteCostNet: 0,
      actualCostNet: 0,
      varianceNet: 0,
    },
    {
      key: 'labor',
      label: 'Työ (kumppanihinta)',
      quoteQty: hours,
      actualQty: null,
      quoteCostNet: laborCost,
      actualCostNet: 0,
      varianceNet: 0,
    },
    {
      key: 'travel_km',
      label: 'Ajokilometrit',
      quoteQty: travelKm,
      actualQty: null,
      quoteCostNet: 0,
      actualCostNet: 0,
      varianceNet: 0,
    },
    {
      key: 'travel',
      label: 'Ajot ja matkakulut',
      quoteQty: travelKm,
      actualQty: null,
      quoteCostNet: travelCost,
      actualCostNet: 0,
      varianceNet: 0,
    },
  ];

  const quoteTotalNet = roundMoney(laborCost + travelCost);
  rows.push({
    key: 'total',
    label: 'Työ + ajot yhteensä',
    quoteQty: null,
    actualQty: null,
    quoteCostNet: quoteTotalNet,
    actualCostNet: 0,
    varianceNet: 0,
  });

  return { rows, quoteTotalNet };
}

function isKmExpenseLine(line: { kind: string; description: string }): boolean {
  return line.kind === 'expense' && /^Ajomatkat\s*\(/i.test(line.description.trim());
}

export function computeWorkReportInstallationActual(
  calculation: BillableCalculation | null | undefined,
  logs: WorkReportDailyLog[],
): Pick<InstallationComparison, 'rows' | 'actualTotalNet'> {
  let laborHours = 0;
  let laborCost = 0;
  let travelKm = 0;
  let travelCost = 0;
  let otherExpenses = 0;

  if (calculation?.byUser?.length) {
    for (const user of calculation.byUser) {
      for (const line of user.lines) {
        if (!line.included) continue;
        const amount = billableLineDisplayTotal(line);
        if (
          line.kind === 'hours_regular'
          || line.kind === 'hours_overtime'
          || line.kind === 'hours_overtime_50'
          || line.kind === 'hours_overtime_100'
          || line.kind === 'hours_on_call'
        ) {
          laborHours += Number(line.qty) || 0;
          laborCost += amount;
        } else if (isKmExpenseLine(line)) {
          travelKm += Number(line.qty) || 0;
          travelCost += amount;
        } else if (line.kind === 'expense') {
          otherExpenses += amount;
        }
      }
    }
  }

  if (laborHours <= 0) {
    laborHours = sumDailyHours(logs);
  }
  if (travelKm <= 0) {
    travelKm = logs.reduce(
      (sum, log) =>
        sum + (log.trip_legs ?? []).reduce((legSum, leg) => legSum + (Number(leg.distance_km) || 0), 0),
      0,
    );
  }

  laborHours = roundQty(laborHours);
  travelKm = roundQty(travelKm);
  laborCost = roundMoney(laborCost);
  travelCost = roundMoney(travelCost);
  otherExpenses = roundMoney(otherExpenses);

  const rows: InstallationComparisonRow[] = [
    {
      key: 'hours',
      label: 'Työtunnit',
      quoteQty: null,
      actualQty: laborHours,
      quoteCostNet: 0,
      actualCostNet: 0,
      varianceNet: 0,
    },
    {
      key: 'labor',
      label: 'Työ (kumppanihinta)',
      quoteQty: null,
      actualQty: laborHours,
      quoteCostNet: 0,
      actualCostNet: laborCost,
      varianceNet: 0,
    },
    {
      key: 'travel_km',
      label: 'Ajokilometrit',
      quoteQty: null,
      actualQty: travelKm,
      quoteCostNet: 0,
      actualCostNet: 0,
      varianceNet: 0,
    },
    {
      key: 'travel',
      label: 'Ajot ja matkakulut',
      quoteQty: null,
      actualQty: travelKm,
      quoteCostNet: 0,
      actualCostNet: travelCost,
      varianceNet: 0,
    },
  ];

  if (otherExpenses > 0.005) {
    rows.push({
      key: 'other_expenses',
      label: 'Muut kulut (ei tarjouksen työ/ajobudjetissa)',
      quoteQty: null,
      actualQty: null,
      quoteCostNet: 0,
      actualCostNet: otherExpenses,
      varianceNet: 0,
    });
  }

  const actualTotalNet = roundMoney(laborCost + travelCost + otherExpenses);
  rows.push({
    key: 'total',
    label: 'Työ + ajot + kulut yhteensä',
    quoteQty: null,
    actualQty: null,
    quoteCostNet: 0,
    actualCostNet: actualTotalNet,
    varianceNet: 0,
  });

  return { rows, actualTotalNet };
}

export function compareQuoteInstallationToWorkReport(input: {
  quoteData: unknown;
  partnerCalculation: BillableCalculation | null | undefined;
  logs: WorkReportDailyLog[];
  partnerRates: PartnerBillingRates;
  tripKmRate?: number | null;
}): InstallationComparison | null {
  const quoteBudget = computeQuoteInstallationBudget(input.quoteData, {
    partnerRates: input.partnerRates,
    tripKmRate: input.tripKmRate,
  });
  const actual = computeWorkReportInstallationActual(input.partnerCalculation, input.logs);
  if (quoteBudget.quoteTotalNet <= 0 && actual.actualTotalNet <= 0) return null;

  const quoteByKey = new Map(quoteBudget.rows.map((row) => [row.key, row]));
  const actualByKey = new Map(actual.rows.map((row) => [row.key, row]));
  const keys = ['hours', 'labor', 'travel_km', 'travel', 'other_expenses', 'total'] as const;

  const rows = keys
    .map((key) => {
      const quoteRow = quoteByKey.get(key);
      const actualRow = actualByKey.get(key);
      if (!quoteRow && !actualRow) return null;
      const quoteCostNet = quoteRow?.quoteCostNet ?? 0;
      const actualCostNet = actualRow?.actualCostNet ?? 0;
      return {
        key,
        label: quoteRow?.label ?? actualRow?.label ?? key,
        quoteQty: quoteRow?.quoteQty ?? null,
        actualQty: actualRow?.actualQty ?? null,
        quoteCostNet,
        actualCostNet,
        varianceNet: roundMoney(actualCostNet - quoteCostNet),
      } satisfies InstallationComparisonRow;
    })
    .filter((row): row is InstallationComparisonRow => row != null);

  return {
    rows,
    quoteTotalNet: quoteBudget.quoteTotalNet,
    actualTotalNet: actual.actualTotalNet,
    varianceNet: roundMoney(actual.actualTotalNet - quoteBudget.quoteTotalNet),
  };
}

export function renderInstallationComparisonHtml(
  comparison: InstallationComparison,
  options?: { escapeHtml?: (value: string) => string; formatEuro?: (value: number) => string },
): string {
  const esc = options?.escapeHtml ?? ((value: string) => value);
  const format = options?.formatEuro ?? ((value: number) => `${value.toFixed(2)} €`);
  const formatQty = (value: number | null, suffix = '') =>
    value == null ? '—' : `${value.toLocaleString('fi-FI', { maximumFractionDigits: 2 })}${suffix}`;

  const body = comparison.rows
    .map((row) => {
      const varianceClass =
        Math.abs(row.varianceNet) > 0.005
          ? row.varianceNet > 0
            ? ' class="changed-row"'
            : ' class="changed-row"'
          : '';
      return `<tr${varianceClass}>
        <td>${esc(row.label)}</td>
        <td class="num">${formatQty(row.quoteQty, row.key === 'hours' ? ' h' : row.key === 'travel_km' ? ' km' : '')}</td>
        <td class="num">${formatQty(row.actualQty, row.key === 'hours' ? ' h' : row.key === 'travel_km' ? ' km' : '')}</td>
        <td class="num">${row.quoteCostNet > 0 || row.key === 'total' ? format(row.quoteCostNet) : '—'}</td>
        <td class="num">${row.actualCostNet > 0 || row.key === 'total' ? format(row.actualCostNet) : '—'}</td>
        <td class="num">${row.quoteCostNet > 0 || row.actualCostNet > 0 || row.key === 'total' ? format(row.varianceNet) : '—'}</td>
      </tr>`;
    })
    .join('');

  return `<h3 class="billing-subheading">Tarjous vs toteutunut (työ ja ajot)</h3>
  <table>
    <thead>
      <tr>
        <th>Rivi</th>
        <th class="num">Tarjous määrä</th>
        <th class="num">Toteutunut määrä</th>
        <th class="num">Tarjous €</th>
        <th class="num">Toteutunut €</th>
        <th class="num">Ero €</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>
  <p class="muted">Vertailu käyttää tarjouksen työtunteja ja km-määrää sekä kumppanin tunti- ja km-hintoja. Materiaalit ovat erillään hankintakorjauksissa.</p>`;
}
