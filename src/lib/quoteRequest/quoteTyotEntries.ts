import { resolveIilpLaborPricingMode } from './calculations';
import { installationSuppliesSubtitle } from './installationSupplies';
import { isRepairQuoteType } from './constants';
import type { QuoteDocumentTileEntry } from './quoteDocumentThemes';
import type { QuoteRequestData } from './types';

export type QuoteTyotTileId =
  | 'huolto-tyot'
  | 'huolto-tarvikkeet'
  | 'iilp-laitteet'
  | 'tyorivit'
  | 'tarvikkeet';

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
  const laborHours = Number(form.installationLaborHours) || 0;
  const laborRate = Number(form.installationLaborPurchaseRate) || 0;
  if (laborHours > 0 && laborRate > 0) {
    parts.push(`${laborHours} h × ${formatEuro(laborRate)}/h`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Ei työrivejä';
}

export function buildQuoteTyotTiles(form: QuoteRequestData): QuoteTyotTileEntry[] {
  const entries: QuoteTyotTileEntry[] = [];

  if (isRepairQuoteType(form.type)) {
    entries.push({
      id: 'huolto-tyot',
      title: 'Työt',
      subtitle: workItemsSubtitle(form),
      themeKey: 'work',
    });
    entries.push({
      id: 'huolto-tarvikkeet',
      title: 'Tarvikkeet',
      subtitle: installationSuppliesSubtitle(form),
      themeKey: 'work',
    });
    return entries;
  }

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
    entries.push({
      id: 'tyorivit',
      title: 'Työrivit',
      subtitle: workItemsSubtitle(form),
      themeKey: 'work',
    });
    entries.push({
      id: 'tarvikkeet',
      title: 'Tarvikkeet',
      subtitle: installationSuppliesSubtitle(form),
      themeKey: 'work',
    });
  }

  return entries;
}
