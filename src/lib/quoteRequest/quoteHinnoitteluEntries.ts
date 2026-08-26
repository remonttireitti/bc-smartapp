import { computeTravelNet, resolveIilpLaborPricingMode } from './calculations';
import {
  isPumpQuoteType,
  quoteUsesTravelCost,
  QUOTE_VAT_PROFILE_LABELS,
} from './constants';
import { manualDevicePrintLabel, resolveNonPumpDeviceSellNet } from './manualDevicePricing';
import type { QuoteRequestData } from './types';

export type QuoteHinnoitteluTileId =
  | 'vilp-config'
  | 'pump-devices'
  | 'iilp-options'
  | 'pump-pricing'
  | 'optional-items'
  | 'device-pricing'
  | 'validity'
  | 'vat-discount'
  | 'terms'
  | 'notes';

export type QuoteHinnoitteluTileEntry = {
  id: QuoteHinnoitteluTileId;
  title: string;
  subtitle: string;
  themeKey: 'config' | 'device' | 'pricing' | 'terms' | 'notes';
};

export const QUOTE_TILE_THEMES = {
  config: { header: 'linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)' },
  device: { header: 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)' },
  pricing: { header: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)' },
  terms: { header: 'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%)' },
  notes: { header: 'linear-gradient(135deg, #64748b 0%, #94a3b8 100%)' },
} as const;

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

function devicePricingSubtitle(form: QuoteRequestData): string {
  const label = manualDevicePrintLabel(form);
  const sellNet = resolveNonPumpDeviceSellNet(form);
  if (sellNet > 0) return `${label} · ${formatEuro(sellNet)}`;
  if (form.deviceBrand?.trim() || form.deviceModel?.trim()) return label;
  return 'Syötä hankintahinta ja kate';
}

function vatDiscountSubtitle(form: QuoteRequestData): string {
  const profile = QUOTE_VAT_PROFILE_LABELS[form.quoteVatProfile ?? 'business'];
  const discount = Number(form.overallDiscountPercent) || 0;
  return discount > 0 ? `${profile} · alennus ${discount} %` : profile;
}

function termsSubtitle(form: QuoteRequestData): string {
  const parts: string[] = [];
  if (form.introText?.trim()) parts.push('Esittely');
  if (form.paymentTermsText?.trim()) parts.push('Maksuehdot');
  if (form.deliveryTermsText?.trim()) parts.push('Toimitus');
  if (isPumpQuoteType(form.type) && form.quoteTermsText?.trim()) parts.push('Tarjousehdot');
  return parts.length > 0 ? parts.join(' · ') : 'Avaa tekstit ja ehdot';
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

  if (!isPumpQuoteType(form.type)) {
    entries.push({
      id: 'device-pricing',
      title: 'Laite / urakka',
      subtitle: devicePricingSubtitle(form),
      themeKey: 'device',
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
    id: 'terms',
    title: 'Tekstit ja ehdot',
    subtitle: termsSubtitle(form),
    themeKey: 'terms',
  });

  entries.push({
    id: 'notes',
    title: 'Huomautukset',
    subtitle: form.notes?.trim() ? 'Huomautuksia lisätty' : 'Ei huomautuksia',
    themeKey: 'notes',
  });

  return entries;
}
