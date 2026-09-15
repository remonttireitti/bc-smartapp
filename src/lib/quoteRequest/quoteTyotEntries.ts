import { resolveIilpLaborPricingMode } from './calculations';
import {
  installationSuppliesKindSubtitle,
  installationSuppliesLaborHours,
  filterInstallationSupplyRows,
} from './installationSupplies';
import type { QuoteDocumentTileEntry } from './quoteDocumentThemes';
import type { QuoteRequestData } from './types';

export type QuoteTyotTileId =
  | 'tyot'
  | 'tarvikkeet'
  | 'kulut'
  | 'laite'
  | 'iilp-laitteet';

export type QuoteTyotTileEntry = QuoteDocumentTileEntry<QuoteTyotTileId>;

function formatEuro(value: number): string {
  return value.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' });
}

function workItemsSubtitle(form: QuoteRequestData): string {
  const count = form.workItems.length;
  const hours = form.workItems.reduce((sum, item) => sum + (Number(item.hours) || 0), 0);
  const parts: string[] = [];
  if (count > 0) {
    parts.push(`${count} työ${count > 1 ? 'tä' : ''} · ${hours} h`);
  }
  const laborRate = Number(form.installationLaborPurchaseRate) || 0;
  if (hours > 0 && laborRate > 0) {
    parts.push(`${formatEuro(laborRate)}/h hankinta`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Ei työrivejä';
}

function tyotTileSubtitle(form: QuoteRequestData): string {
  const workItemsText = workItemsSubtitle(form);
  const laborRows = filterInstallationSupplyRows(form.installationSupplies, 'labor');
  const laborHours = installationSuppliesLaborHours(form.installationSupplies);

  if (workItemsText !== 'Ei työrivejä') {
    if (laborRows.length > 0) {
      return `${workItemsText} · +${laborRows.length} riviä`;
    }
    return workItemsText;
  }

  if (laborRows.length > 0) {
    const parts = [`${laborRows.length} rivi${laborRows.length > 1 ? 'ä' : ''}`];
    if (laborHours > 0) parts.push(`${laborHours} h`);
    return parts.join(' · ');
  }

  return 'Ei työrivejä';
}

function buildWorkMaterialTiles(form: QuoteRequestData): QuoteTyotTileEntry[] {
  return [
    {
      id: 'tyot',
      title: 'Työt',
      subtitle: tyotTileSubtitle(form),
      themeKey: 'work',
    },
    {
      id: 'tarvikkeet',
      title: 'Tarvikkeet',
      subtitle: installationSuppliesKindSubtitle(form, 'supply'),
      themeKey: 'work',
    },
    {
      id: 'kulut',
      title: 'Kulut',
      subtitle: installationSuppliesKindSubtitle(form, 'expense'),
      themeKey: 'pricing',
    },
    {
      id: 'laite',
      title: 'Laite',
      subtitle: installationSuppliesKindSubtitle(form, 'device'),
      themeKey: 'device',
    },
  ];
}

export function buildQuoteTyotTiles(form: QuoteRequestData): QuoteTyotTileEntry[] {
  const entries: QuoteTyotTileEntry[] = [];

  if (form.type === 'ilma-ilma') {
    entries.push({
      id: 'iilp-laitteet',
      title: 'Laitevalinta',
      subtitle: form.selectedDeviceId?.trim() ? 'Laite valittu' : 'Valitse laite',
      themeKey: 'device',
    });
  }

  const hideWorkMaterials =
    form.type === 'ilma-ilma' && resolveIilpLaborPricingMode(form) === 'urakka';

  if (!hideWorkMaterials) {
    entries.push(...buildWorkMaterialTiles(form));
  }

  return entries;
}
