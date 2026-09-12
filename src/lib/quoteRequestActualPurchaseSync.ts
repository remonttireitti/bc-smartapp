import type { WorkReportDailyLog } from '../types';
import { reconcileQuotePurchaseLines, sumQuotePurchaseLines, type BillingQuotePurchaseLine } from './quotePurchaseLines';
import type { BillingQuoteSettings } from './workReportBillingQuote';
import { normalizeBillingQuoteSettings } from './workReportBillingQuote';
import { analyzeWorkReportPurchaseCosts } from './workReportActualPurchase';

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function suppliesPurchaseLine(
  suppliesActualNet: number,
  quoteSuppliesNet: number,
): BillingQuotePurchaseLine {
  return {
    id: 'group:diary-supplies',
    label: 'Tarvikkeet',
    source: 'group',
    quantity: null,
    unit: null,
    quote_purchase_net: roundMoney(quoteSuppliesNet),
    actual_purchase_net: roundMoney(suppliesActualNet),
  };
}

function resolveDeviceActual(
  line: BillingQuotePurchaseLine,
  savedLines: BillingQuotePurchaseLine[],
): number {
  const saved =
    savedLines.find((row) => row.id === line.id)
    ?? savedLines.find(
      (row) =>
        row.source === 'device'
        && Math.abs(row.quote_purchase_net - line.quote_purchase_net) < 0.01,
    );
  const quote = line.quote_purchase_net;
  const actual = saved?.actual_purchase_net ?? line.actual_purchase_net ?? quote;
  if (quote > 0.005 && actual < quote * 0.5) return roundMoney(quote);
  return roundMoney(actual);
}

function deviceLabelFromBundled(label: string): string {
  const trimmed = label.trim();
  if (!trimmed || trimmed === 'Tarvikkeet' || trimmed === 'Asennustarvikkeet') {
    return 'Tarjotut laitteet';
  }
  if (/^laitteet\s*·/i.test(trimmed)) {
    return trimmed.replace(/^laitteet\s*·\s*/i, '').trim() || 'Tarjotut laitteet';
  }
  return trimmed;
}

/** Vanha tallennettu rakenne: yksi rivi sisältää laitteen arvion. */
function splitLegacyBundledLine(
  lines: BillingQuotePurchaseLine[],
  suppliesActualNet: number,
): BillingQuotePurchaseLine[] {
  const deviceLines = lines.filter((line) => line.source === 'device');
  const supplyLines = lines.filter(
    (line) => line.source !== 'device' && line.id !== 'group:diary-supplies',
  );
  if (deviceLines.length > 0 || supplyLines.length !== 1) return lines;

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
      quote_purchase_net: roundMoney(bundled.quote_purchase_net),
      actual_purchase_net: roundMoney(bundled.quote_purchase_net),
    },
  ];
}

function quoteSuppliesNetFromLines(lines: BillingQuotePurchaseLine[]): number {
  return roundMoney(
    lines
      .filter(
        (line) =>
          line.source !== 'device'
          && line.id !== 'group:diary-supplies'
          && line.id !== 'group:installation-internal',
      )
      .reduce((sum, line) => sum + line.quote_purchase_net, 0),
  );
}

/**
 * Rakenna työraportin hankintarivit:
 * - Laite(t): tarjousarvio tarjouspyynnöstä, toteutunut = oikaisu (oletus = arvio)
 * - Tarvikkeet: tarjousarvio tarjouspyynnöstä, toteutunut = päiväkirja
 * Tarjouspyynnön arvioita EI muuteta.
 */
export function buildWorkReportPurchaseLines(
  settings: BillingQuoteSettings,
  logs: WorkReportDailyLog[],
  quoteData?: unknown | null,
): BillingQuotePurchaseLine[] {
  const analysis = analyzeWorkReportPurchaseCosts(logs);
  const saved = settings.purchase_lines ?? [];

  let quoteLines: BillingQuotePurchaseLine[] = [];
  if (quoteData) {
    quoteLines = reconcileQuotePurchaseLines(quoteData, saved);
  } else if (saved.length > 0) {
    quoteLines = splitLegacyBundledLine(saved, analysis.suppliesNet);
  }

  const deviceLines = quoteLines
    .filter((line) => line.source === 'device')
    .map((line) => ({
      ...line,
      actual_purchase_net: resolveDeviceActual(line, saved),
    }));

  const quoteSuppliesNet = quoteSuppliesNetFromLines(quoteLines);
  const result: BillingQuotePurchaseLine[] = [...deviceLines];

  if (quoteSuppliesNet > 0.005 || analysis.suppliesNet > 0.005) {
    result.push(suppliesPurchaseLine(analysis.suppliesNet, quoteSuppliesNet));
  }

  return result;
}

/** Päivitä työraportin hankintarivit — tarjousarvio pysyy, vain toteutuneet päivittyvät. */
export function mergeActualPurchaseFromWorkReportLogs(
  settings: BillingQuoteSettings,
  logs: WorkReportDailyLog[],
  quoteData?: unknown | null,
): BillingQuoteSettings {
  const nextLines = buildWorkReportPurchaseLines(settings, logs, quoteData);
  if (nextLines.length === 0) {
    const analysis = analyzeWorkReportPurchaseCosts(logs);
    return normalizeBillingQuoteSettings({
      ...settings,
      actual_purchase_net:
        analysis.suppliesNet > 0 ? analysis.suppliesNet : settings.actual_purchase_net,
    });
  }

  return normalizeBillingQuoteSettings({
    ...settings,
    purchase_lines: nextLines,
    quote_purchase_net: sumQuotePurchaseLines(nextLines, 'quote_purchase_net'),
    actual_purchase_net: sumQuotePurchaseLines(nextLines, 'actual_purchase_net'),
  });
}
