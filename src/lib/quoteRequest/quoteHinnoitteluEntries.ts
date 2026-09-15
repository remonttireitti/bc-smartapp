import { computeTravelNet, resolveIilpLaborPricingMode } from './calculations';
import { quoteUsesTravelCost, QUOTE_VAT_PROFILE_LABELS } from './constants';
import type { QuoteRequestData } from './types';

import type { QuoteDocumentTileEntry } from './quoteDocumentThemes';

export type QuoteHinnoitteluTileId =
  | 'vilp-config'
  | 'pump-devices'
  | 'iilp-options'
  | 'pump-pricing'
  | 'optional-items'
  | 'validity'
  | 'vat-discount'
  | 'notes';

export type QuoteHinnoitteluTileEntry = QuoteDocumentTileEntry<QuoteHinnoitteluTileId>;

function formatEuro(value: number): string {
  return value.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' });
}

function validitySubtitle(form: QuoteRequestData): string {
  if (form.validUntil) {
    const parts = [`Voimassa ${form.validUntil}`];
    if (quoteUsesTravelCost(form.type) && form.travelKmEnabled && form.travelKmDistance > 0) {
      parts.push(`${form.travelKmDistance} km`);
    }
    return parts.join(' · ');
  }
  if (quoteUsesTravelCost(form.type) && form.travelKmEnabled && form.travelKmDistance > 0) {
    return `Km ${form.travelKmDistance} · ${formatEuro(computeTravelNet(form))}`;
  }
  return 'Avaa asetukset';
}

function vatDiscountSubtitle(form: QuoteRequestData): string {
  const profile = QUOTE_VAT_PROFILE_LABELS[form.quoteVatProfile ?? 'business'];
  const discount = Number(form.overallDiscountPercent) || 0;
  return discount > 0 ? `${profile} · alennus ${discount} %` : profile;
}

export function buildQuoteHinnoitteluTiles(form: QuoteRequestData): QuoteHinnoitteluTileEntry[] {
  const entries: QuoteHinnoitteluTileEntry[] = [];

  if (form.type === 'vesi-ilma') {
    entries.push({
      id: 'vilp-config',
      title: 'Lämpöpumpun valinta',
      subtitle: form.vilpBrandChoice?.trim() || 'Valitse valmistaja ja paketti',
      themeKey: 'config',
    });
    entries.push({
      id: 'pump-devices',
      title: 'Laitteet ja hinnat',
      subtitle: form.selectedDeviceId?.trim() ? 'Laite valittu' : 'Valitse laitevaihtoehdot',
      themeKey: 'device',
    });
  }

  if (form.type === 'ilma-ilma') {
    entries.push({
      id: 'iilp-options',
      title: 'Asennusvaihtoehdot',
      subtitle: resolveIilpLaborPricingMode(form) === 'urakka' ? 'Urakkahinta' : 'Tuntityö',
      themeKey: 'config',
    });
    entries.push({
      id: 'pump-pricing',
      title: 'Laitteet ja hinnat',
      subtitle: form.selectedDeviceId?.trim() ? 'Laite valittu' : 'Valitse laitevaihtoehdot',
      themeKey: 'device',
    });
    entries.push({
      id: 'optional-items',
      title: 'Valinnaiset lisät',
      subtitle: `${(form.optionalItems ?? []).filter((item) => item.enabled).length} valittu`,
      themeKey: 'pricing',
    });
  }

  entries.push({
    id: 'validity',
    title: quoteUsesTravelCost(form.type) ? 'Voimassaolo ja km' : 'Voimassaolo',
    subtitle: validitySubtitle(form),
    themeKey: 'pricing',
  });

  entries.push({
    id: 'vat-discount',
    title: 'ALV ja alennus',
    subtitle: vatDiscountSubtitle(form),
    themeKey: 'pricing',
  });

  entries.push({
    id: 'notes',
    title: 'Huomautukset',
    subtitle: form.notes?.trim() ? 'Huomautuksia lisätty' : 'Ei huomautuksia',
    themeKey: 'notes',
  });

  return entries;
}
