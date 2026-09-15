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
  | 'maksuehdot'
  | 'toimitusehdot'
  | 'iilp-tuloste'
  | 'tarjousehdot';

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

function truncateSubtitle(text: string, fallback: string): string {
  const trimmed = text.trim();
  if (!trimmed) return fallback;
  if (trimmed.length <= 48) return trimmed;
  return `${trimmed.slice(0, 47).trimEnd()}…`;
}

function maksuehdotSubtitle(form: QuoteRequestData): string {
  const text = form.paymentTermsText?.trim() ?? '';
  if (text) return truncateSubtitle(text, '14 pv netto');
  if (form.type === 'ilma-ilma' && form.laborRate > 0) {
    return `Lisätyöt ${form.laborRate} €/h`;
  }
  return '14 pv netto';
}

function toimitusehdotSubtitle(form: QuoteRequestData): string {
  return truncateSubtitle(form.deliveryTermsText ?? '', 'Työt sovitaan erikseen');
}

function iilpTulosteSubtitle(form: QuoteRequestData): string {
  const text = form.iilpEnergySavingsText?.trim() ?? '';
  if (text) return truncateSubtitle(text, 'Säästölaskelma tulosteessa');
  if (form.iilpPurpose === 'cooling' || form.buildingType === 'kerrostalo') {
    return 'Jäähdytyskulutus tulosteessa';
  }
  return 'Säästölaskelma tulosteessa';
}

function tarjousehdotSubtitle(form: QuoteRequestData): string {
  const text = form.quoteTermsText?.trim() ?? '';
  return truncateSubtitle(text, 'Takuut, huolto ja asennusehdot');
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
    id: 'maksuehdot',
    title: 'Maksuehdot',
    subtitle: maksuehdotSubtitle(form),
    themeKey: 'terms',
  });
  entries.push({
    id: 'toimitusehdot',
    title: 'Toimitusehdot',
    subtitle: toimitusehdotSubtitle(form),
    themeKey: 'terms',
  });

  if (form.type === 'ilma-ilma') {
    entries.push({
      id: 'iilp-tuloste',
      title: 'Tulostetekstit',
      subtitle: iilpTulosteSubtitle(form),
      themeKey: 'notes',
    });
  }

  if (isPumpQuoteType(form.type)) {
    entries.push({
      id: 'tarjousehdot',
      title: 'Tarjousehdot',
      subtitle: tarjousehdotSubtitle(form),
      themeKey: 'terms',
    });
  }

  return entries;
}
