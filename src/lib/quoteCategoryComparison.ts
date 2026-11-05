import { deviceEntryCostSplit, effectiveQuoteDeviceActualNet } from './workReportDeviceEntries';
import { isAccommodationName } from './expenseNameKinds';
import { materialPurchaseTotal } from './quoteRequest/calculations';
import { filterInstallationSupplyRows } from './quoteRequest/installationSupplies';
import { isKmCompensationMaterial } from './quoteInstallationComparison';
import {
  expenseBillingModeShortLabel,
  expensePurchaseLineTotal,
  resolveExpenseBillingMode,
} from './workReportExpenseBilling';
import type { PartnerBillingRates } from './management';
import type { BillingQuotePurchaseLine } from './quotePurchaseLines';
import {
  compareQuoteInstallationToWorkReport,
  type InstallationComparison,
} from './quoteInstallationComparison';
import { normalizeQuoteRequestData } from './quoteRequest/defaults';
import { installationVehiclePurchaseNet } from './quoteRequest/installationSupplies';
import { quoteScopePartnerCalculation, type BillableCalculation } from './workReportBilling';
import type { BillingQuoteSettings } from './workReportBillingQuote';
import type { WorkReportDailyLog } from '../types';
import { categoryReclassification, classifyExpenseLineCategory } from './workReportEntryCategories';

export type QuoteCategoryKey = 'labor' | 'supplies' | 'expenses' | 'device';

/** Kulut-rivin osa: ajot, majoitus, huoltoautokorvaus ja muut kulut eroteltuna. */
export type QuoteCategoryPart = {
  key: 'travel' | 'accommodation' | 'vehicle' | 'other';
  label: string;
  quoteQty: number | null;
  actualQty: number | null;
  quoteNet: number;
  actualNet: number;
  note?: string | null;
};

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
  /** Kulut-rivin erittely (vain kun rivillä on muutakin kuin ajoja). Σ osat = rivin summa. */
  parts?: QuoteCategoryPart[];
};

export type QuoteCategoryComparison = {
  rows: QuoteCategoryRow[];
  quoteTotalNet: number;
  actualTotalNet: number;
  varianceNet: number;
  /** Kumppanin kiinteä urakkahinta korvaa urakan kattamat rivit (tarjouksen kuluarvio → urakkahinta). */
  urakka?: { net: number; quoteCoveredNet: number };
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

export { isAccommodationName };

/** Majoituksen laskutustila lyhyesti: oma kulu + miten se menee kumppanille. */
function accommodationBillingNote(lines: Array<{ bill_to_partner?: boolean; bill_to_customer?: boolean }>): string | null {
  if (lines.length === 0) return null;
  const modes = new Set(lines.map((line) => resolveExpenseBillingMode(line)));
  if (modes.size > 1) return 'oma kulu · laskutustapa vaihtelee';
  const [mode] = [...modes];
  if (mode === 'customer_only') return expenseBillingModeShortLabel(mode);
  if (mode === 'partner_and_customer') return 'oma kulu · laskutetaan kumppanilta';
  return 'oma kulu · ei laskuteta kumppanilta';
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

function buildExpenseParts(input: {
  quoteData: unknown;
  installation: InstallationComparison | null;
  logs: WorkReportDailyLog[];
  expensesQuoteNet: number;
  expensesActualNet: number;
  vehicleQuote: number;
}): QuoteCategoryPart[] | undefined {
  const quote = normalizeQuoteRequestData(input.quoteData);
  const byKey = new Map((input.installation?.rows ?? []).map((row) => [row.key, row]));
  const travelRow = byKey.get('travel');
  const travelKmRow = byKey.get('travel_km');

  // Tarjous: Kulu-rivit nimen mukaan (Km-korvaus = ajot, Majoitus, muut).
  const quoteExpenseRows = filterInstallationSupplyRows(quote.installationSupplies, 'expense');
  let quoteAccommodation = 0;
  let quoteOther = 0;
  for (const row of quoteExpenseRows) {
    const net = materialPurchaseTotal([row]);
    if (isKmCompensationMaterial(row.name)) continue;
    if (isAccommodationName(row.name)) quoteAccommodation += net;
    else quoteOther += net;
  }
  quoteAccommodation = roundMoney(quoteAccommodation);
  quoteOther = roundMoney(quoteOther);
  const quoteTravel = roundMoney(
    (travelRow?.quoteCostNet ?? 0) - quoteAccommodation - quoteOther,
  );

  // Toteutunut: päiväkirjan kulurivit (ei ajot) kategoriassa Kulut.
  let actualAccommodation = 0;
  const accommodationLines: Array<{ bill_to_partner?: boolean; bill_to_customer?: boolean }> = [];
  for (const log of input.logs) {
    for (const line of log.expense_lines ?? []) {
      if (!isAccommodationName(line.description)) continue;
      if (classifyExpenseLineCategory(line) !== 'expenses') continue;
      if (line.expense_type === 'km' || /^Ajomatkat\s*\(/i.test(String(line.description ?? '').trim())) continue;
      const mode = resolveExpenseBillingMode(line);
      const cost = mode === 'customer_only'
        ? expensePurchaseLineTotal(line)
        : (Number(line.qty) || 0) * (Number(line.unit_price) || 0);
      actualAccommodation += cost;
      accommodationLines.push(line);
    }
  }
  const actualTravel = roundMoney(travelRow?.actualCostNet ?? 0);
  const kmLines: Array<{ bill_to_partner?: boolean; bill_to_customer?: boolean }> = [];
  for (const log of input.logs) {
    for (const line of log.expense_lines ?? []) {
      if (line.expense_type === 'km' || /^Ajomatkat\s*\(/i.test(String(line.description ?? '').trim())) kmLines.push(line);
    }
  }
  actualAccommodation = roundMoney(
    Math.min(actualAccommodation, Math.max(0, input.expensesActualNet - actualTravel)),
  );
  const actualOther = roundMoney(input.expensesActualNet - actualTravel - actualAccommodation);
  if (actualOther < -0.005) return undefined;

  const parts: QuoteCategoryPart[] = [];
  const hasTravel = quoteTravel > 0.005 || actualTravel > 0.005
    || travelKmRow?.quoteQty != null || travelKmRow?.actualQty != null;
  if (hasTravel) {
    parts.push({
      key: 'travel',
      label: 'Ajokilometrit',
      quoteQty: travelKmRow?.quoteQty ?? null,
      actualQty: travelKmRow?.actualQty ?? null,
      quoteNet: quoteTravel,
      actualNet: actualTravel,
      note: accommodationBillingNote(kmLines),
    });
  }
  if (quoteAccommodation > 0.005 || actualAccommodation > 0.005) {
    parts.push({
      key: 'accommodation',
      label: 'Majoitus',
      quoteQty: null,
      actualQty: null,
      quoteNet: quoteAccommodation,
      actualNet: actualAccommodation,
      note: accommodationBillingNote(accommodationLines),
    });
  }
  if (input.vehicleQuote > 0.005) {
    parts.push({
      key: 'vehicle',
      label: 'Huoltoautokorvaus',
      quoteQty: null,
      actualQty: null,
      quoteNet: input.vehicleQuote,
      actualNet: 0,
      note: 'vain tarjouksessa, ei toteumakirjausta',
    });
  }
  if (quoteOther > 0.005 || actualOther > 0.005) {
    parts.push({
      key: 'other',
      label: 'Muut kulut',
      quoteQty: null,
      actualQty: null,
      quoteNet: quoteOther,
      actualNet: actualOther,
    });
  }
  if (parts.length < 2) return undefined;
  // Erittely täsmää aina riviin; muuten ei näytetä (turvaverkko).
  const quoteSum = roundMoney(parts.reduce((sum, part) => sum + part.quoteNet, 0));
  const actualSum = roundMoney(parts.reduce((sum, part) => sum + part.actualNet, 0));
  if (Math.abs(quoteSum - input.expensesQuoteNet) > 0.01 || Math.abs(actualSum - input.expensesActualNet) > 0.01) {
    return undefined;
  }
  return parts;
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
  // Lisälaskutettavat tunnit ja lisälaskutusrivit eivät kuulu kiinteän tarjouksen vertailuun.
  const partnerCalculation = input.partnerCalculation
    ? quoteScopePartnerCalculation(input.partnerCalculation, input.logs)
    : input.partnerCalculation;
  const installation = compareQuoteInstallationToWorkReport({
    quoteData: input.quoteData,
    partnerCalculation,
    logs: input.logs,
    partnerRates: input.partnerRates,
    tripKmRate: input.tripKmRate,
  });

  const purchaseLines = input.billingSettings.purchase_lines ?? [];
  const labor = rowFromInstallation(installation, 'labor');
  const expenses = rowFromInstallation(installation, 'expenses');
  const suppliesQuote = sumPurchaseLines(purchaseLines, 'quote_purchase_net', false);
  const suppliesActualFromLines = sumPurchaseLines(purchaseLines, 'actual_purchase_net', false);
  // Kulurivin tyyppi ratkaisee kategorian (tarjouspyynnön termein), ei laskutustapa:
  // siirretään toteutunut Tarvikkeiden ja Kulujen välillä — yhteissumma ei muutu.
  const diaryGroupActual = Number(
    purchaseLines.find((line) => line.id === 'group:diary-supplies')?.actual_purchase_net ?? 0,
  );
  const shift = categoryReclassification(input.logs, partnerCalculation);
  const suppliesToExpenses = roundMoney(Math.min(shift.suppliesToExpenses, Math.max(0, diaryGroupActual)));
  const expensesToSupplies = roundMoney(Math.min(shift.expensesToSupplies, Math.max(0, expenses.actualNet)));
  // Laitekirjaukset (tyyppi Laite): päiväkirjan hankinnat ja kumppanin laskuttamat laiterivit
  // siirretään Laite-riville; ne korvaavat tarjouspyynnön laitehinnan (laite vain kerran).
  const deviceSplit = deviceEntryCostSplit(input.logs, partnerCalculation);
  const diaryDevice = roundMoney(
    Math.min(deviceSplit.diaryNet, Math.max(0, diaryGroupActual - suppliesToExpenses)),
  );
  const partnerDevice = roundMoney(
    Math.min(deviceSplit.partnerNet, Math.max(0, expenses.actualNet - expensesToSupplies)),
  );
  const suppliesActual = roundMoney(
    suppliesActualFromLines - suppliesToExpenses + expensesToSupplies - diaryDevice,
  );
  const expensesActual = roundMoney(
    expenses.actualNet + suppliesToExpenses - expensesToSupplies - partnerDevice,
  );
  const deviceQuote = sumPurchaseLines(purchaseLines, 'quote_purchase_net', true);
  const deviceActual = roundMoney(
    effectiveQuoteDeviceActualNet(purchaseLines, input.logs) + diaryDevice + partnerDevice,
  );
  // Huoltoautokorvaus on tarjouksen sisäinen kulu (sama kuin tarjouksen "Hankinta"):
  // vertaillaan Kulut-kategoriassa toteutuneisiin ajoihin.
  const vehicleQuote = roundMoney(installationVehiclePurchaseNet(normalizeQuoteRequestData(input.quoteData)));

  const expensesQuoteNet = roundMoney(expenses.quoteNet + vehicleQuote);
  const parts = buildExpenseParts({
    quoteData: input.quoteData,
    installation,
    logs: input.logs,
    expensesQuoteNet,
    expensesActualNet: expensesActual,
    vehicleQuote,
  });

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
        expensesActual,
      ),
      quoteNote:
        vehicleQuote > 0.005
          ? `sis. huoltoautokorvaus ${vehicleQuote.toFixed(2).replace('.', ',')} €`
          : null,
      ...(parts ? { parts } : {}),
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
