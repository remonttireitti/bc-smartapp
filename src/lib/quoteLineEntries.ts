import type { QuoteCategoryKey } from './quoteCategoryComparison';
import { isKmCompensationMaterial, quoteTravelKm } from './quoteInstallationComparison';
import { extractQuotePurchaseLines } from './quotePurchaseLines';
import { normalizeQuoteRequestData } from './quoteRequest/defaults';
import {
  installationVehiclePurchaseNet,
  resolveQuoteMaterialRowKind,
} from './quoteRequest/installationSupplies';

/**
 * Mitä "Kirjaa toteutunut" tekee tarjouspyynnön rivillä:
 * - labor: avaa työkirjauksen (Työt ja tunnit)
 * - expense: avaa työkirjauksen ja lisää valmiin kulu-/tarvikerivin
 * - trip: avaa työkirjauksen (ajot kirjataan matkoina)
 * - device: laitteen toteutunut oikaistaan Tarjous ja kate -osiossa
 */
export type QuoteLineAction = 'labor' | 'expense' | 'trip' | 'device';

export type QuoteLineEntry = {
  id: string;
  category: QuoteCategoryKey;
  label: string;
  qty: number | null;
  unit: string | null;
  /** Tarjouspyynnön hankinta (alv 0 %), kun rivillä on oma summa. */
  quoteNet: number | null;
  action: QuoteLineAction;
  /** Kulurivin tyyppi, jolla työraportin rivi esitäytetään (action = expense). */
  expenseType?: 'material' | 'parking' | 'other';
  /** Laiterivin tunniste billing_quote.purchase_lines -listassa (action = device). */
  purchaseLineId?: string;
  hint?: string;
};

export type QuoteLineGroup = {
  category: QuoteCategoryKey;
  label: string;
  lines: QuoteLineEntry[];
};

const GROUP_LABELS: Record<QuoteCategoryKey, string> = {
  labor: 'Työt',
  supplies: 'Tarvikkeet',
  expenses: 'Kulut (ajot ja muut)',
  device: 'Laite',
};

const GROUP_ORDER: QuoteCategoryKey[] = ['labor', 'supplies', 'expenses', 'device'];

function roundQty(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Tarjouspyynnön kulurivin nimi → työraportin kulutyyppi. */
export function expenseTypeForQuoteExpense(name: string): 'parking' | 'other' {
  return /pys[äa]k/i.test(name) ? 'parking' : 'other';
}

/**
 * Tarjouspyynnön rivit samoissa neljässä kategoriassa kuin "Tarjous ja kate" -vertailu,
 * jotta käyttäjä näkee, mihin kunkin rivin toteutunut kirjataan.
 */
export function quoteLinesByCategory(quoteData: unknown): QuoteLineGroup[] {
  if (!quoteData) return [];
  const quote = normalizeQuoteRequestData(quoteData);
  const lines: QuoteLineEntry[] = [];

  // Työt
  for (const item of quote.workItems ?? []) {
    const hours = Number(item.hours) || 0;
    if (hours <= 0) continue;
    lines.push({
      id: `labor:${item.id}`,
      category: 'labor',
      label: item.description?.trim() || 'Työ',
      qty: roundQty(hours),
      unit: 'h',
      quoteNet: null,
      action: 'labor',
    });
  }
  const itemHours = (quote.workItems ?? []).reduce((sum, item) => sum + (Number(item.hours) || 0), 0);
  if (itemHours <= 0 && Number(quote.laborHours) > 0) {
    lines.push({
      id: 'labor:hours',
      category: 'labor',
      label: 'Työtunnit',
      qty: roundQty(Number(quote.laborHours)),
      unit: 'h',
      quoteNet: null,
      action: 'labor',
    });
  }
  for (const row of quote.installationSupplies ?? []) {
    if (!row.name.trim() || resolveQuoteMaterialRowKind(row) !== 'labor') continue;
    lines.push({
      id: `labor:${row.id}`,
      category: 'labor',
      label: row.name.trim(),
      qty: roundQty(Number(row.quantity) || 0) || null,
      unit: 'h',
      quoteNet: null,
      action: 'labor',
    });
  }

  // Tarvikkeet, kulurivit ja laite tarjouksen hankintariveistä (samat kuin vertailussa)
  const quoteLines = extractQuotePurchaseLines(quoteData);
  let hasKmExpenseRow = false;
  for (const line of quoteLines) {
    if (line.id === 'group:installation-internal') continue;
    if (line.source === 'device') {
      lines.push({
        id: line.id,
        category: 'device',
        label: line.label,
        qty: line.quantity ?? null,
        unit: line.unit ?? null,
        quoteNet: line.quote_purchase_net,
        action: 'device',
        purchaseLineId: line.id,
        hint: 'Toteutunut = tarjouspyynnön hinta, ellei oikaista.',
      });
      continue;
    }
    if (line.row_kind === 'expense') {
      const km = isKmCompensationMaterial(line.label);
      if (km) hasKmExpenseRow = true;
      lines.push({
        id: line.id,
        category: 'expenses',
        label: line.label,
        qty: line.quantity ?? null,
        unit: km ? 'km' : line.unit ?? null,
        quoteNet: line.quote_purchase_net,
        action: km ? 'trip' : 'expense',
        ...(km ? { hint: 'Kirjaa ajot matkoina.' } : { expenseType: expenseTypeForQuoteExpense(line.label) }),
      });
      continue;
    }
    lines.push({
      id: line.id,
      category: 'supplies',
      label: line.label,
      qty: line.quantity ?? null,
      unit: line.unit ?? null,
      quoteNet: line.quote_purchase_net,
      action: 'expense',
      expenseType: 'material',
    });
  }

  // Ajot
  const travelKm = quoteTravelKm(quote);
  if (travelKm > 0 && !hasKmExpenseRow) {
    lines.push({
      id: 'expenses:travel-km',
      category: 'expenses',
      label: 'Ajokilometrit',
      qty: roundQty(travelKm),
      unit: 'km',
      quoteNet: null,
      action: 'trip',
      hint: 'Kirjaa ajot matkoina.',
    });
  }
  const vehicleNet = roundMoney(installationVehiclePurchaseNet(quote));
  if (vehicleNet > 0.005) {
    lines.push({
      id: 'expenses:vehicle',
      category: 'expenses',
      label: 'Huoltoautokorvaus',
      qty: null,
      unit: null,
      quoteNet: vehicleNet,
      action: 'trip',
      hint: 'Verrataan toteutuneisiin ajoihin.',
    });
  }

  return GROUP_ORDER.map((category) => ({
    category,
    label: GROUP_LABELS[category],
    lines: lines.filter((line) => line.category === category),
  })).filter((group) => group.lines.length > 0);
}

/**
 * Rivikohtainen summa näytetään vain, kun kategoriassa on useampi summallinen rivi —
 * yksittäisen rivin summa on jo vertailutaulukossa.
 */
export function showQuoteLineAmounts(group: QuoteLineGroup): boolean {
  return group.lines.filter((line) => line.quoteNet != null && line.quoteNet > 0.005).length > 1;
}
