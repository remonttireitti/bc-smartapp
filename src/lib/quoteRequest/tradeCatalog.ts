import type { QuoteMaterialRowKind, QuoteType } from './types';

/** LVI-, IV- ja sähkötarjousten tyyppirivit (pikalisäys). Hinta yrityksen tarjoushinnastosta tai 0 € = hinta puuttuu. */
export type TradeQuoteType = 'lvi' | 'iv' | 'sahko';

export const TRADE_QUOTE_TYPES: TradeQuoteType[] = ['lvi', 'iv', 'sahko'];

export function isTradeQuoteType(type: QuoteType | string | null | undefined): type is TradeQuoteType {
  return type === 'lvi' || type === 'iv' || type === 'sahko';
}

export type TradeCatalogItem = {
  key: string;
  name: string;
  unit: 'h' | 'kpl' | 'm' | 'kohde' | 'urakka' | 'km' | 'erä';
  kind: QuoteMaterialRowKind;
};

export type TradeCatalogGroup = { title: string; items: TradeCatalogItem[] };

const labor = (key: string, name: string, unit: TradeCatalogItem['unit']): TradeCatalogItem => ({ key, name, unit, kind: 'labor' });
const supply = (key: string, name: string, unit: TradeCatalogItem['unit']): TradeCatalogItem => ({ key, name, unit, kind: 'supply' });
const device = (key: string, name: string): TradeCatalogItem => ({ key, name, unit: 'kpl', kind: 'device' });

/** Yhteiset kulut: eivät kuulu kotitalousvähennykseen (vero.fi: ei matkakuluja eikä tarvikkeita). */
const EXPENSES = (prefix: TradeQuoteType): TradeCatalogGroup => ({
  title: 'Kulut',
  items: [
    { key: `${prefix}-kaynti`, name: 'Käynti- ja lähtömaksu', unit: 'kpl', kind: 'expense' },
    { key: `${prefix}-km`, name: 'Kilometrikorvaus', unit: 'km', kind: 'expense' },
    { key: `${prefix}-jate`, name: 'Jätemaksu', unit: 'erä', kind: 'expense' },
  ],
});

export const TRADE_CATALOG: Record<TradeQuoteType, TradeCatalogGroup[]> = {
  iv: [
    {
      title: 'Työt',
      items: [
        labor('iv-tyo-h', 'Asennustyö', 'h'),
        labor('iv-urakka', 'Urakka (työ)', 'urakka'),
        labor('iv-kanava-asennus', 'Kanavien asennus', 'm'),
        labor('iv-venttiili-asennus', 'Venttiilin asennus', 'kpl'),
        labor('iv-kone-vaihto', 'IV-koneen vaihto', 'kohde'),
        labor('iv-kone-huolto', 'IV-koneen huolto ja LTO-kennon pesu', 'kohde'),
        labor('iv-puhdistus-venttiili', 'IV-kanavien puhdistus / venttiili', 'kpl'),
        labor('iv-puhdistus-m', 'IV-kanavien puhdistus', 'm'),
        labor('iv-puhdistus-kohde', 'IV-kanavien puhdistus', 'kohde'),
        labor('iv-rasvakanava', 'Rasvakanavan puhdistus', 'kpl'),
        labor('iv-saato', 'Ilmamäärien mittaus ja säätö', 'kohde'),
        labor('iv-poytakirja', 'Puhdistus- ja säätöpöytäkirja', 'kpl'),
      ],
    },
    {
      title: 'Tarvikkeet',
      items: [
        supply('iv-kanava-100', 'IV-kanava Ø100', 'm'),
        supply('iv-kanava-125', 'IV-kanava Ø125', 'm'),
        supply('iv-kanava-160', 'IV-kanava Ø160', 'm'),
        supply('iv-kanava-200', 'IV-kanava Ø200', 'm'),
        supply('iv-kanavaosat', 'Kanavan osat (käyrät, haarat)', 'kpl'),
        supply('iv-eristys', 'Kanavaeristys', 'm'),
        supply('iv-tuloventtiili', 'Tuloilmaventtiili', 'kpl'),
        supply('iv-poistoventtiili', 'Poistoilmaventtiili', 'kpl'),
        supply('iv-vaimennin', 'Äänenvaimennin', 'kpl'),
        supply('iv-suodattimet', 'Suodatinsarja', 'kpl'),
      ],
    },
    { title: 'Laitteet', items: [device('iv-kone', 'IV-kone (LTO)')] },
    EXPENSES('iv'),
  ],
  lvi: [
    {
      title: 'Työt',
      items: [
        labor('lvi-tyo-h', 'Asennustyö', 'h'),
        labor('lvi-urakka', 'Urakka (työ)', 'urakka'),
        labor('lvi-putkiasennus', 'Putkiasennus', 'm'),
        labor('lvi-kaluste-asennus', 'Kalusteen asennus', 'kpl'),
        labor('lvi-huuhtelu', 'Patteriverkoston huuhtelu', 'kohde'),
        labor('lvi-pesu', 'Järjestelmän pesu (kemiallinen)', 'kohde'),
        labor('lvi-perussaato', 'Perussäätö / patteri', 'kpl'),
        labor('lvi-linjasaato', 'Linjasäätö', 'kpl'),
        labor('lvi-painekoe', 'Painekoe', 'kohde'),
        labor('lvi-ljk', 'Lämmönjakokeskuksen vaihto', 'kohde'),
        labor('lvi-viemarikuvaus', 'Viemärikuvaus', 'kohde'),
        labor('lvi-viemarin-avaus', 'Viemärin avaus', 'kohde'),
      ],
    },
    {
      title: 'Tarvikkeet',
      items: [
        supply('lvi-putki', 'Putki', 'm'),
        supply('lvi-viemariputki', 'Viemäriputki', 'm'),
        supply('lvi-liittimet', 'Liittimet', 'kpl'),
        supply('lvi-sulkuventtiili', 'Sulkuventtiili', 'kpl'),
        supply('lvi-patteriventtiili', 'Patteriventtiili', 'kpl'),
        supply('lvi-linjasaatoventtiili', 'Linjasäätöventtiili', 'kpl'),
        supply('lvi-hana', 'Hana / sekoitin', 'kpl'),
        supply('lvi-wc', 'WC-istuin', 'kpl'),
        supply('lvi-pesuallas', 'Pesuallas', 'kpl'),
        supply('lvi-lattiakaivo', 'Lattiakaivo', 'kpl'),
        supply('lvi-kemikaalit', 'Pesu- ja suoja-aineet', 'erä'),
      ],
    },
    { title: 'Laitteet', items: [device('lvi-ljk-laite', 'Lämmönjakokeskus')] },
    EXPENSES('lvi'),
  ],
  sahko: [
    {
      title: 'Työt',
      items: [
        labor('sahko-tyo-h', 'Asennustyö', 'h'),
        labor('sahko-urakka', 'Urakka (työ)', 'urakka'),
        labor('sahko-kaapelointi', 'Kaapelin asennus', 'm'),
        labor('sahko-piste', 'Pisteen asennus (pistorasia, kytkin, valaisin)', 'kpl'),
        labor('sahko-keskus', 'Ryhmäkeskuksen asennus', 'kohde'),
        labor('sahko-lampopumppu', 'Lämpöpumpun sähköasennus', 'kohde'),
        labor('sahko-latausasema', 'Latausaseman asennus', 'kohde'),
        labor('sahko-mittaukset', 'Mittaukset (eristysvastus, vikavirtasuojat)', 'kohde'),
        labor('sahko-kayttoonotto', 'Käyttöönottotarkastus ja pöytäkirja', 'kohde'),
      ],
    },
    {
      title: 'Tarvikkeet',
      items: [
        supply('sahko-mmj-3x15', 'Kaapeli MMJ 3×1,5', 'm'),
        supply('sahko-mmj-3x25', 'Kaapeli MMJ 3×2,5', 'm'),
        supply('sahko-mmj-5x25', 'Kaapeli MMJ 5×2,5', 'm'),
        supply('sahko-rasia', 'Asennusrasia', 'kpl'),
        supply('sahko-pistorasia', 'Pistorasia', 'kpl'),
        supply('sahko-kytkin', 'Kytkin', 'kpl'),
        supply('sahko-valaisin', 'Valaisin', 'kpl'),
        supply('sahko-vikavirtasuoja', 'Vikavirtasuoja', 'kpl'),
        supply('sahko-sulake', 'Johdonsuojakatkaisija', 'kpl'),
      ],
    },
    {
      title: 'Laitteet',
      items: [device('sahko-ryhmakeskus', 'Ryhmäkeskus'), device('sahko-latausasema-laite', 'Latausasema')],
    },
    EXPENSES('sahko'),
  ],
};

export function tradeCatalogItems(type: TradeQuoteType): TradeCatalogItem[] {
  return TRADE_CATALOG[type].flatMap((g) => g.items);
}

export function findTradeCatalogItem(key: string): TradeCatalogItem | null {
  for (const type of TRADE_QUOTE_TYPES) {
    const hit = tradeCatalogItems(type).find((item) => item.key === key);
    if (hit) return hit;
  }
  return null;
}

/** Yrityksen tarjoushinnasto: avain → myyntihinta € / yksikkö (alv 0). */
export type TradeCatalogPrices = Record<string, number>;

export function parseTradeCatalogPrices(raw: unknown): TradeCatalogPrices {
  if (!raw || typeof raw !== 'object') return {};
  const out: TradeCatalogPrices = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
    if (Number.isFinite(n) && n > 0) out[key] = Math.round(n * 100) / 100;
  }
  return out;
}

/** Rivin oletushinta: oma hinta, tuntityölle asiakkaan oletustuntihinta, muuten 0 (hinta puuttuu). */
export function tradeCatalogDefaultPrice(
  item: TradeCatalogItem,
  prices: TradeCatalogPrices,
  hourlyRate?: number | null,
): number {
  const own = prices[item.key];
  if (own != null && own > 0) return own;
  if (item.kind === 'labor' && item.unit === 'h' && hourlyRate && hourlyRate > 0) return hourlyRate;
  return 0;
}

/** Tyyppirivi, jolta puuttuu myyntihinta. */
export function isTradeRowPriceMissing(row: { catalogKey?: string; sellPrice: number; name: string }): boolean {
  return Boolean(row.catalogKey) && !(Number(row.sellPrice) > 0);
}
