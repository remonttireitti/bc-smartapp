import { computeIilpNeedKw } from './calculations';
import { isPumpQuoteType, isRepairQuoteType } from './constants';
import type { QuoteDocumentTileEntry } from './quoteDocumentThemes';
import type { QuoteRequestData } from './types';

export type QuoteKohdeTileId =
  | 'tyoraportti-otsikko'
  | 'tyoraportti-kuvaus'
  | 'iilp-mitoitus'
  | 'iilp-asennus'
  | 'vilp-kohde'
  | 'huolto-laite'
  | 'huolto-tilanne'
  | 'terms';

export type QuoteKohdeTileEntry = QuoteDocumentTileEntry<QuoteKohdeTileId>;

function otsikkoSubtitle(form: QuoteRequestData): string {
  const text = form.introText?.trim() ?? '';
  if (!text) return 'Esim. ILK 22A korjaukset';
  if (text.length <= 48) return text;
  return `${text.slice(0, 47).trimEnd()}…`;
}

function tehtavaSubtitle(form: QuoteRequestData): string {
  const text = form.faultDescription?.trim() ?? '';
  if (!text) return 'Mitä työ sisältää?';
  if (text.length <= 48) return text;
  return `${text.slice(0, 47).trimEnd()}…`;
}

function termsSubtitle(form: QuoteRequestData): string {
  const parts: string[] = [];
  if (form.paymentTermsText?.trim()) parts.push('Maksuehdot');
  if (form.deliveryTermsText?.trim()) parts.push('Toimitus');
  if (isPumpQuoteType(form.type) && form.quoteTermsText?.trim()) parts.push('Tarjousehdot');
  return parts.length > 0 ? parts.join(' · ') : 'Maksu-, toimitus- ja tarjousehdot';
}

export function buildQuoteKohdeTiles(form: QuoteRequestData): QuoteKohdeTileEntry[] {
  const entries: QuoteKohdeTileEntry[] = [];

  entries.push({
    id: 'tyoraportti-otsikko',
    title: 'Otsikko',
    subtitle: otsikkoSubtitle(form),
    themeKey: 'work',
  });
  entries.push({
    id: 'tyoraportti-kuvaus',
    title: 'Tehtävän kuvaus',
    subtitle: tehtavaSubtitle(form),
    themeKey: 'work',
  });

  if (form.type === 'ilma-ilma') {
    const needKw = computeIilpNeedKw(form);
    entries.push({
      id: 'iilp-mitoitus',
      title: 'Mitoitus',
      subtitle: needKw > 0 ? `${needKw} kW` : `${form.heatedArea || 0} m²`,
      themeKey: 'site',
    });
    entries.push({
      id: 'iilp-asennus',
      title: 'Asennustiedot',
      subtitle:
        [form.iilpIndoorPlacement, form.iilpOutdoorPlacement]
          .map((v) => String(v ?? '').trim())
          .filter(Boolean)
          .join(' · ') || 'Sijainnit ja putkitus',
      themeKey: 'site',
    });
  }

  if (form.type === 'vesi-ilma') {
    entries.push({
      id: 'vilp-kohde',
      title: 'Kohteen tiedot',
      subtitle: `${form.heatedArea || 0} m² · ${form.buildingType || '—'}`,
      themeKey: 'site',
    });
  }

  if (isRepairQuoteType(form.type)) {
    const deviceLabel =
      [form.deviceBrand, form.deviceModel].map((v) => String(v ?? '').trim()).filter(Boolean).join(' ')
      || 'Merkki ja malli';
    entries.push({
      id: 'huolto-laite',
      title: 'Huollettava laite',
      subtitle: deviceLabel,
      themeKey: 'device',
    });
    entries.push({
      id: 'huolto-tilanne',
      title: 'Tilanneraportti',
      subtitle: form.situationReportEnabled ? 'Mukana tulosteessa' : 'Ei käytössä',
      themeKey: 'notes',
    });
  }

  if (!isPumpQuoteType(form.type) && !isRepairQuoteType(form.type)) {
    entries.push({
      id: 'huolto-laite',
      title: 'Kohde',
      subtitle: 'Valitse tarjouksen tyyppi',
      themeKey: 'site',
    });
  }

  entries.push({
    id: 'terms',
    title: 'Tekstit ja ehdot',
    subtitle: termsSubtitle(form),
    themeKey: 'terms',
  });

  return entries;
}
