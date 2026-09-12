import type { WorkReportDailyLog } from '../types';
import { createEmptyMaterial, normalizeQuoteRequestData } from './quoteRequest/defaults';
import {
  isOfferedDeviceRow,
  syncInstallationSupplyRow,
} from './quoteRequest/installationSupplies';
import { syncManualDeviceSalePatch } from './quoteRequest/manualDevicePricing';
import type { QuoteRequestData } from './quoteRequest/types';
import { sumQuotePurchaseLines, type BillingQuotePurchaseLine } from './quotePurchaseLines';
import type { BillingQuoteSettings } from './workReportBillingQuote';
import { normalizeBillingQuoteSettings } from './workReportBillingQuote';
import { analyzeWorkReportPurchaseCosts } from './workReportActualPurchase';

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function diarySuppliesPurchaseLine(
  suppliesActualNet: number,
  quoteSuppliesNet = 0,
): BillingQuotePurchaseLine {
  return {
    id: 'group:diary-supplies',
    label: 'Tarvikkeet (päiväkirja)',
    source: 'group',
    quantity: null,
    unit: null,
    quote_purchase_net: roundMoney(quoteSuppliesNet),
    actual_purchase_net: roundMoney(suppliesActualNet),
  };
}

function resolveDeviceActual(line: BillingQuotePurchaseLine): number {
  const quote = line.quote_purchase_net;
  const actual = line.actual_purchase_net;
  if (!(quote > 0.005)) return roundMoney(actual);
  // Vanha bugi: koko rivi korvautui päiväkirjan summalla.
  if (actual < quote * 0.5) return roundMoney(quote);
  return roundMoney(actual);
}

function deviceLabelFromBundled(label: string): string {
  const trimmed = label.trim();
  if (!trimmed || trimmed === 'Tarvikkeet' || trimmed === 'Asennustarvikkeet') {
    return 'Tarjotut laitteet';
  }
  if (/^laitteet\s*·/i.test(trimmed)) return trimmed.replace(/^laitteet\s*·\s*/i, '').trim() || 'Tarjotut laitteet';
  return trimmed;
}

/** Vanha yksirivinen rakenne: erottele laite (oikaisettava) ja päiväkirjan tarvikkeet. */
function splitBundledPurchaseLineIfNeeded(
  lines: BillingQuotePurchaseLine[],
  suppliesActualNet: number,
): BillingQuotePurchaseLine[] {
  const deviceLines = lines.filter((line) => line.source === 'device');
  const supplyLines = lines.filter(
    (line) => line.source !== 'device' && line.id !== 'group:diary-supplies',
  );

  if (deviceLines.length > 0 || supplyLines.length !== 1) {
    return lines;
  }

  const bundled = supplyLines[0];
  if (bundled.quote_purchase_net <= suppliesActualNet * 1.5 && suppliesActualNet > 0.005) {
    return lines;
  }

  return [
    {
      ...bundled,
      id: bundled.id.startsWith('device:') ? bundled.id : `device:${bundled.id}`,
      source: 'device',
      label: deviceLabelFromBundled(bundled.label),
      actual_purchase_net: resolveDeviceActual({
        ...bundled,
        quote_purchase_net: bundled.quote_purchase_net,
        actual_purchase_net: bundled.quote_purchase_net,
      }),
    },
  ];
}

function quoteSuppliesNetFromLines(lines: BillingQuotePurchaseLine[]): number {
  return roundMoney(
    lines
      .filter((line) => line.source !== 'device' && line.id !== 'group:diary-supplies')
      .reduce((sum, line) => sum + line.quote_purchase_net, 0),
  );
}

/**
 * Työraportin hankintarivit: laitteet (käsin oikaistava) + tarvikkeet (päiväkirjasta).
 * Tarjouksen tarvikerivejä ei toisteta toteutuneena — vain päiväkirjarivi.
 */
function assignSuppliesActualToPurchaseLines(
  lines: BillingQuotePurchaseLine[],
  suppliesActualNet: number,
): BillingQuotePurchaseLine[] {
  const deviceLines = lines
    .filter((line) => line.source === 'device')
    .map((line) => ({
      ...line,
      actual_purchase_net: resolveDeviceActual(line),
    }));

  const quoteSuppliesNet = quoteSuppliesNetFromLines(lines);
  const result: BillingQuotePurchaseLine[] = [...deviceLines];

  if (suppliesActualNet > 0.005 || quoteSuppliesNet > 0.005) {
    result.push(diarySuppliesPurchaseLine(suppliesActualNet, quoteSuppliesNet));
  }

  return result;
}

function preserveDeviceActuals(
  nextLines: BillingQuotePurchaseLine[],
  savedLines: BillingQuotePurchaseLine[],
): BillingQuotePurchaseLine[] {
  const savedDevices = savedLines.filter((line) => line.source === 'device');
  const savedById = new Map(savedLines.map((line) => [line.id, line]));

  return nextLines.map((line) => {
    if (line.source !== 'device') return line;
    const saved =
      savedById.get(line.id)
      ?? savedDevices.find(
        (row) => Math.abs(row.quote_purchase_net - line.quote_purchase_net) < 0.01,
      );
    if (!saved) return line;
    const actual = saved.actual_purchase_net;
    if (Math.abs(actual - line.quote_purchase_net) > 0.005) {
      return { ...line, actual_purchase_net: roundMoney(actual) };
    }
    return line;
  });
}

/** Päivitä työraportin hankintarivit päiväkirjan toteutuneista kuluista. */
export function mergeActualPurchaseFromWorkReportLogs(
  settings: BillingQuoteSettings,
  logs: WorkReportDailyLog[],
): BillingQuoteSettings {
  const analysis = analyzeWorkReportPurchaseCosts(logs);
  const lines = settings.purchase_lines ?? [];
  if (lines.length === 0) {
    return normalizeBillingQuoteSettings({
      ...settings,
      actual_purchase_net: analysis.suppliesNet > 0 ? analysis.suppliesNet : settings.actual_purchase_net,
    });
  }

  const splitLines = splitBundledPurchaseLineIfNeeded(lines, analysis.suppliesNet);
  const nextLines = preserveDeviceActuals(
    assignSuppliesActualToPurchaseLines(splitLines, analysis.suppliesNet),
    lines,
  );
  return normalizeBillingQuoteSettings({
    ...settings,
    purchase_lines: nextLines,
    actual_purchase_net: sumQuotePurchaseLines(nextLines, 'actual_purchase_net'),
  });
}

/** Päivitä tarjouspyynnön data toteutuneilla hankintahinnoilla työraportilta. */
export function patchQuoteRequestDataFromWorkReportActuals(
  quoteData: unknown,
  settings: BillingQuoteSettings,
  logs: WorkReportDailyLog[],
): QuoteRequestData {
  const normalized = normalizeQuoteRequestData(quoteData);
  const purchaseLines = settings.purchase_lines ?? [];
  const analysis = analyzeWorkReportPurchaseCosts(logs);
  let next: QuoteRequestData = { ...normalized };
  const existing = [...(next.installationSupplies ?? [])];

  for (const line of purchaseLines.filter((row) => row.source === 'device')) {
    const materialId = line.id.startsWith('device:') ? line.id.slice('device:'.length) : null;
    const materialIndex =
      materialId != null ? existing.findIndex((row) => row.id === materialId) : -1;
    if (
      materialIndex >= 0
      && Math.abs(line.actual_purchase_net - line.quote_purchase_net) > 0.005
    ) {
      const row = existing[materialIndex];
      const qty = Number(row.quantity) || 1;
      existing[materialIndex] = syncInstallationSupplyRow(row, {
        purchasePrice: roundMoney(line.actual_purchase_net / qty),
      });
      continue;
    }

    if (Math.abs(line.actual_purchase_net - line.quote_purchase_net) > 0.005) {
      const patch = syncManualDeviceSalePatch(next, {
        devicePurchaseOverrideNet: line.actual_purchase_net,
      });
      next = { ...next, ...patch };
    }
  }

  const expenseLines = analysis.lines.filter((line) => line.source === 'expense');
  if (expenseLines.length > 0) {
    const usedIds = new Set<string>();

    for (const expense of expenseLines) {
      const match = existing.find(
        (row) =>
          !usedIds.has(row.id)
          && !isOfferedDeviceRow(row)
          && row.name.trim().toLocaleLowerCase('fi') === expense.description.toLocaleLowerCase('fi'),
      );
      if (match) {
        usedIds.add(match.id);
        const index = existing.findIndex((row) => row.id === match.id);
        existing[index] = syncInstallationSupplyRow(match, {
          purchasePrice: expense.purchaseUnit,
        });
        continue;
      }

      existing.push(
        syncInstallationSupplyRow(
          createEmptyMaterial({
            name: expense.description,
            quantity: expense.qty,
            purchasePrice: expense.purchaseUnit,
            sellPrice: 0,
            marginPercent: 25,
            rowKind: 'supply',
          }),
          { purchasePrice: expense.purchaseUnit },
        ),
      );
    }
  }

  if (existing.some((row) => row.name.trim())) {
    next = { ...next, installationSupplies: existing };
  }

  return next;
}
