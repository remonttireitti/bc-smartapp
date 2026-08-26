import { computeIilpNeedKw } from './calculations';
import { isPumpQuoteType, isRepairQuoteType } from './constants';
import type { QuoteDocumentTileEntry } from './quoteDocumentThemes';
import type { QuoteRequestData } from './types';

export type QuoteKohdeTileId =
  | 'iilp-mitoitus'
  | 'iilp-asennus'
  | 'vilp-kohde'
  | 'huolto-laite'
  | 'huolto-kuvaus'
  | 'huolto-tilanne';

export type QuoteKohdeTileEntry = QuoteDocumentTileEntry<QuoteKohdeTileId>;

export function buildQuoteKohdeTiles(form: QuoteRequestData): QuoteKohdeTileEntry[] {
  const entries: QuoteKohdeTileEntry[] = [];

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
      title: 'Kohde ja laite',
      subtitle: deviceLabel,
      themeKey: 'device',
    });
    entries.push({
      id: 'huolto-kuvaus',
      title: 'Työnkuvaus',
      subtitle: form.faultDescription?.trim() ? 'Kuvaus täytetty' : 'Vikakuvaus / työnkuvaus',
      themeKey: 'work',
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

  return entries;
}
