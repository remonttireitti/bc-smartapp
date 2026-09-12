import type { WorkReportDailyLog } from '../types';
import { createEmptyMaterial, normalizeQuoteRequestData } from './quoteRequest/defaults';
import { syncInstallationSupplyRow } from './quoteRequest/installationSupplies';
import { syncManualDeviceSalePatch } from './quoteRequest/manualDevicePricing';
import type { QuoteRequestData } from './quoteRequest/types';
import { sumQuotePurchaseLines, type BillingQuotePurchaseLine } from './quotePurchaseLines';
import type { BillingQuoteSettings } from './workReportBillingQuote';
import { normalizeBillingQuoteSettings } from './workReportBillingQuote';
import { analyzeWorkReportPurchaseCosts } from './workReportActualPurchase';

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function assignSuppliesActualToPurchaseLines(
  lines: BillingQuotePurchaseLine[],
  suppliesActualNet: number,
): BillingQuotePurchaseLine[] {
  const supplyLines = lines.filter((line) => line.source !== 'device');
  if (supplyLines.length === 0 || suppliesActualNet <= 0.005) return lines;

  if (supplyLines.length === 1) {
    return lines.map((line) =>
      line.id === supplyLines[0].id
        ? { ...line, actual_purchase_net: roundMoney(suppliesActualNet) }
        : line,
    );
  }

  const groupLine =
    supplyLines.find((line) => line.source === 'group')
    ?? supplyLines.find((line) => line.id.startsWith('group:'));
  if (groupLine) {
    return lines.map((line) =>
      line.id === groupLine.id
        ? { ...line, actual_purchase_net: roundMoney(suppliesActualNet) }
        : line,
    );
  }

  const quoteSupplyTotal = roundMoney(
    supplyLines.reduce((sum, line) => sum + line.quote_purchase_net, 0),
  );
  if (quoteSupplyTotal <= 0.005) {
    return lines.map((line, index) =>
      line.source !== 'device' && index === lines.findIndex((row) => row.source !== 'device')
        ? { ...line, actual_purchase_net: roundMoney(suppliesActualNet) }
        : line,
    );
  }

  return lines.map((line) => {
    if (line.source === 'device') return line;
    const share = line.quote_purchase_net / quoteSupplyTotal;
    return {
      ...line,
      actual_purchase_net: roundMoney(suppliesActualNet * share),
    };
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

  let nextLines = assignSuppliesActualToPurchaseLines(lines, analysis.suppliesNet);
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

  const deviceLine = purchaseLines.find((line) => line.source === 'device');
  if (
    deviceLine
    && Math.abs(deviceLine.actual_purchase_net - deviceLine.quote_purchase_net) > 0.005
  ) {
    const patch = syncManualDeviceSalePatch(next, {
      devicePurchaseOverrideNet: deviceLine.actual_purchase_net,
    });
    next = { ...next, ...patch };
  }

  const expenseLines = analysis.lines.filter((line) => line.source === 'expense');
  if (expenseLines.length > 0) {
    const existing = [...(next.installationSupplies ?? [])];
    const usedIds = new Set<string>();

    for (const expense of expenseLines) {
      const match = existing.find(
        (row) =>
          !usedIds.has(row.id)
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
          }),
          { purchasePrice: expense.purchaseUnit },
        ),
      );
    }

    if (existing.some((row) => row.name.trim())) {
      next = { ...next, installationSupplies: existing };
    }
  }

  return next;
}
