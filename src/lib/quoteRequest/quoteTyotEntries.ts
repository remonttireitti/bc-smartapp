import { resolveIilpLaborPricingMode } from './calculations';
import { isRepairQuoteType } from './constants';
import type { QuoteDocumentTileEntry } from './quoteDocumentThemes';
import type { QuoteRequestData } from './types';

export type QuoteTyotTileId = 'huolto-tyot' | 'iilp-laitteet' | 'tyorivit' | 'tarvikkeet';

export type QuoteTyotTileEntry = QuoteDocumentTileEntry<QuoteTyotTileId>;

function workItemsSubtitle(form: QuoteRequestData): string {
  const count = form.workItems.length;
  const hours = form.workItems.reduce((sum, item) => sum + (Number(item.hours) || 0), 0);
  if (count === 0) return 'Ei työrivejä';
  return `${count} työ${count > 1 ? 'tä' : ''} · ${hours} h`;
}

function materialsSubtitle(form: QuoteRequestData): string {
  const count = form.materials.length;
  if (count === 0) return 'Ei tarvikkeita';
  const total = form.materials.reduce((sum, item) => sum + (Number(item.sellPrice) || 0) * (Number(item.quantity) || 0), 0);
  return `${count} riviä · ${total.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' })}`;
}

export function buildQuoteTyotTiles(form: QuoteRequestData): QuoteTyotTileEntry[] {
  const entries: QuoteTyotTileEntry[] = [];

  if (isRepairQuoteType(form.type)) {
    entries.push({
      id: 'huolto-tyot',
      title: 'Työt ja tarvikkeet',
      subtitle: `${form.workItems.length} työtä`,
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
      subtitle: materialsSubtitle(form),
      themeKey: 'work',
    });
  }

  return entries;
}
