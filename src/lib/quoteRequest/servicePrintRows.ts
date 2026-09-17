import { materialSellTotal } from './calculations';
import {
  filterInstallationSupplyRows,
  installationSuppliesExpenseSellNet,
  installationSuppliesLaborPurchaseNet,
  installationSuppliesLaborSellNet,
  installationSuppliesSupplySellNet,
  isOfferedDeviceRow,
  migrateLegacyMaterialsToInstallationSupplies,
  resolveQuoteMaterialRowKind,
} from './installationSupplies';
import type { QuoteCustomerPrintQuantitySettings } from '../quoteCustomerPrintSettings';
import { DEFAULT_QUOTE_CUSTOMER_PRINT_QUANTITY_SETTINGS } from '../quoteCustomerPrintSettings';
import { formatQuoteWorkHoursQtyLabel } from '../quoteCustomerPrintQuantity';
type QuotePrintMode = 'enduser' | 'creator';
import type { QuoteMaterial, QuoteRequestData } from './types';

export function serviceQuoteSuppliesSellTotal(data: QuoteRequestData): number {
  const migrated = migrateLegacyMaterialsToInstallationSupplies(data);
  let total = installationSuppliesSupplySellNet(migrated.installationSupplies);
  for (const item of migrated.workItems) {
    total += materialSellTotal((item.materials ?? []).filter((row) => row.name.trim()));
  }
  const nestedCount = migrated.workItems.reduce(
    (sum, item) => sum + (item.materials ?? []).filter((row) => row.name.trim()).length,
    0,
  );
  if (nestedCount === 0) {
    total += materialSellTotal(migrated.materials.filter((row) => row.name.trim()));
  }
  return total;
}

export function serviceQuoteExpensesSellTotal(data: QuoteRequestData): number {
  const migrated = migrateLegacyMaterialsToInstallationSupplies(data);
  return installationSuppliesExpenseSellNet(migrated.installationSupplies);
}

export function serviceQuoteLaborSuppliesSellTotal(data: QuoteRequestData): number {
  const migrated = migrateLegacyMaterialsToInstallationSupplies(data);
  return installationSuppliesLaborSellNet(migrated.installationSupplies);
}

export function serviceQuoteLaborSuppliesPurchaseTotal(data: QuoteRequestData): number {
  const migrated = migrateLegacyMaterialsToInstallationSupplies(data);
  return installationSuppliesLaborPurchaseNet(migrated.installationSupplies);
}

export function serviceQuoteDeviceRows(data: QuoteRequestData): QuoteMaterial[] {
  const migrated = migrateLegacyMaterialsToInstallationSupplies(data);
  return (migrated.installationSupplies ?? []).filter(
    (row) => row.name.trim() && isOfferedDeviceRow(row),
  );
}

export function serviceQuoteSupplyRows(data: QuoteRequestData): QuoteMaterial[] {
  const migrated = migrateLegacyMaterialsToInstallationSupplies(data);
  const rows: QuoteMaterial[] = [];
  for (const item of migrated.workItems) {
    rows.push(...(item.materials ?? []).filter((row) => row.name.trim()));
  }
  const nestedCount = rows.length;
  if (nestedCount === 0) {
    rows.push(...migrated.materials.filter((row) => row.name.trim()));
  }
  rows.push(...filterInstallationSupplyRows(migrated.installationSupplies, 'supply'));
  return rows.filter((row) => !isOfferedDeviceRow(row) && resolveQuoteMaterialRowKind(row) === 'supply');
}

export function serviceQuoteExpenseRows(data: QuoteRequestData): QuoteMaterial[] {
  const migrated = migrateLegacyMaterialsToInstallationSupplies(data);
  return filterInstallationSupplyRows(migrated.installationSupplies, 'expense');
}

export type ServicePrintRowBuilder = (
  label: string,
  qtyLabel: string,
  unitSell: number,
  lineSell: number,
  mode: QuotePrintMode,
  options?: { purchase?: number },
) => string;

export function buildAggregatedServiceCategoryRows(
  data: QuoteRequestData,
  mode: QuotePrintMode,
  printWorkRow: ServicePrintRowBuilder,
  printMaterialRow: (
    mat: QuoteMaterial,
    mode: QuotePrintMode,
    quantitySettings?: QuoteCustomerPrintQuantitySettings,
  ) => string,
  quantitySettings?: QuoteCustomerPrintQuantitySettings,
): string {
  if (mode === 'creator') return '';

  const settings = quantitySettings ?? DEFAULT_QUOTE_CUSTOMER_PRINT_QUANTITY_SETTINGS;
  const parts: string[] = [];

  const suppliesSell = serviceQuoteSuppliesSellTotal(data);
  if (suppliesSell > 0.005) {
    parts.push(printWorkRow('Tarvikkeet', '', suppliesSell, suppliesSell, mode));
  }

  const expensesSell = serviceQuoteExpensesSellTotal(data);
  if (expensesSell > 0.005) {
    parts.push(printWorkRow('Kulut', '', expensesSell, expensesSell, mode));
  }

  const laborRows = filterInstallationSupplyRows(
    migrateLegacyMaterialsToInstallationSupplies(data).installationSupplies,
    'labor',
  );
  for (const row of laborRows) {
    parts.push(printMaterialRow(row, mode, settings));
  }

  for (const row of serviceQuoteDeviceRows(data)) {
    parts.push(printMaterialRow(row, mode, settings));
  }

  return parts.join('');
}

export function buildServiceWorkItemRows(
  data: QuoteRequestData,
  mode: QuotePrintMode,
  printWorkRow: ServicePrintRowBuilder,
  quantitySettings?: QuoteCustomerPrintQuantitySettings,
  tableColspan = 5,
): string {
  const settings = quantitySettings ?? DEFAULT_QUOTE_CUSTOMER_PRINT_QUANTITY_SETTINGS;
  const laborPurchaseRate = Number(data.installationLaborPurchaseRate) || 0;
  const sections: string[] = [];
  let hasTaskContent = false;

  for (const item of data.workItems) {
    const desc = item.description.trim();
    const hours = Number(item.hours) || 0;
    const rate = Number(item.pricePerHour) || 0;
    const hasWork = Boolean(desc) || hours > 0 || rate > 0;
    if (!hasWork) continue;

    hasTaskContent = true;
    const header = desc || 'Työ';
    const equipmentLabel = item.equipmentName?.trim() || '';
    const equipmentSuffix = equipmentLabel
      ? `<span class="line-sub"> — ${equipmentLabel.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`
      : '';

    sections.push(
      `<tr class="task-section-header"><td colspan="${tableColspan}"><strong>${header.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</strong>${equipmentSuffix}</td></tr>`,
    );

    if (hours > 0 || (desc && rate > 0)) {
      const sell = hours * rate;
      const purchase = hours * laborPurchaseRate;
      const qtyLabel =
        formatQuoteWorkHoursQtyLabel(hours, settings)
        ?? (mode === 'creator' ? `${hours} h` : '');
      sections.push(
        printWorkRow(`${desc || 'Työ'} — työ`, qtyLabel, rate, sell, mode, { purchase }),
      );
    }
  }

  if (!hasTaskContent && Number(data.laborHours) > 0) {
    const hours = Number(data.laborHours);
    const rate = Number(data.laborRate) || 0;
    const sell = hours * rate;
    const purchase = hours * laborPurchaseRate;
    const qtyLabel =
      formatQuoteWorkHoursQtyLabel(hours, settings)
      ?? (mode === 'creator' ? `${hours} h` : '');
    sections.push(printWorkRow('Työ', qtyLabel, rate, sell, mode, { purchase }));
  }

  return sections.join('');
}
