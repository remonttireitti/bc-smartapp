import { deviceTypes } from './huoltoRaportti/constants';

/** Huoltoraporttien lajit: kylmälaitehuolto (nykyiset laitetyypit) + tarkastuslistapohjaiset lajit. */
export type HuoltoCategoryKey = 'kylma' | 'lvi' | 'iv' | 'sahko';
export type ChecklistCategoryKey = Exclude<HuoltoCategoryKey, 'kylma'>;

export type HuoltoCategory = {
  key: HuoltoCategoryKey;
  label: string;
  short: string;
  /** Hub-ruudun lyhyt kuvaus (1–2 riviä). */
  lines: string[];
  color: string;
};

export const HUOLTO_CATEGORIES: HuoltoCategory[] = [
  { key: 'kylma', label: 'Kylmälaitehuolto', short: 'Kylmä', lines: ['Lämpöpumput, kylmäkoneet', 'Kylmäaine ja vuototarkastus'], color: '#22c55e' },
  { key: 'lvi', label: 'LVI-huolto', short: 'LVI', lines: ['Käyttövesi ja lämmitysverkosto', 'Venttiilit, vuodot, viemärit'], color: '#0ea5e9' },
  { key: 'iv', label: 'IV-huolto', short: 'IV', lines: ['Suodattimet, LTO, puhaltimet', 'Ilmamäärät ja kanavisto'], color: '#14b8a6' },
  { key: 'sahko', label: 'Sähköhuolto', short: 'Sähkö', lines: ['Keskukset ja vikavirtasuojat', 'Mittaukset, lämpökamera'], color: '#f59e0b' },
];

export const CHECKLIST_CATEGORY_KEYS: ChecklistCategoryKey[] = ['lvi', 'iv', 'sahko'];

export function isChecklistCategory(value: unknown): value is ChecklistCategoryKey {
  return value === 'lvi' || value === 'iv' || value === 'sahko';
}

export function huoltoCategoryLabel(key: HuoltoCategoryKey): string {
  return HUOLTO_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

/** Hinnoiteltava/kytkettävä raporttityyppi. Kylmä: laitetyypin arvo; muut: lajin avain. */
export type HuoltoReportType = {
  key: string;
  category: HuoltoCategoryKey;
  label: string;
};

export const HUOLTO_REPORT_TYPES: HuoltoReportType[] = [
  ...deviceTypes.map((d) => ({ key: d.value as string, category: 'kylma' as const, label: d.label as string })),
  { key: 'lvi', category: 'lvi', label: 'LVI-huolto' },
  { key: 'iv', category: 'iv', label: 'IV-huolto' },
  { key: 'sahko', category: 'sahko', label: 'Sähköhuolto' },
];

export function huoltoReportTypesOf(category: HuoltoCategoryKey): HuoltoReportType[] {
  return HUOLTO_REPORT_TYPES.filter((t) => t.category === category);
}

export function huoltoReportTypeLabel(key: string): string {
  return HUOLTO_REPORT_TYPES.find((t) => t.key === key)?.label ?? key;
}

export type HuoltoTypeSetting = {
  enabled: boolean;
  /** Perushinta €, alv 0 %. */
  price?: number | null;
  /** Lisätuntihinta €/h, alv 0 % (valinnainen). */
  hourly?: number | null;
};

/** companies.settings.huolto */
export type HuoltoSettings = {
  enabled: boolean;
  types: Record<string, HuoltoTypeSetting>;
};

function parsePrice(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/** Vanhat yritykset (ei huolto-asetusta): moduuli päällä ja kaikki kylmälaitetyypit käytössä. */
export function legacyHuoltoSettings(): HuoltoSettings {
  const types: Record<string, HuoltoTypeSetting> = {};
  for (const t of HUOLTO_REPORT_TYPES) types[t.key] = { enabled: t.category === 'kylma' };
  return { enabled: true, types };
}

/** Lukee companies.settings-JSONista; puuttuva huolto-avain = vanha yritys (legacy). */
export function parseHuoltoSettings(companySettings: unknown): HuoltoSettings {
  const raw =
    companySettings && typeof companySettings === 'object'
      ? (companySettings as Record<string, unknown>).huolto
      : undefined;
  if (!raw || typeof raw !== 'object') return legacyHuoltoSettings();
  const obj = raw as { enabled?: unknown; types?: unknown };
  const rawTypes = obj.types && typeof obj.types === 'object' ? (obj.types as Record<string, unknown>) : {};
  const types: Record<string, HuoltoTypeSetting> = {};
  for (const t of HUOLTO_REPORT_TYPES) {
    const entry = rawTypes[t.key];
    if (entry && typeof entry === 'object') {
      const e = entry as Record<string, unknown>;
      types[t.key] = { enabled: e.enabled === true, price: parsePrice(e.price), hourly: parsePrice(e.hourly) };
    } else {
      types[t.key] = { enabled: false };
    }
  }
  return { enabled: obj.enabled === true, types };
}

export function serializeHuoltoSettings(settings: HuoltoSettings): HuoltoSettings {
  const types: Record<string, HuoltoTypeSetting> = {};
  for (const t of HUOLTO_REPORT_TYPES) {
    const s = settings.types[t.key];
    types[t.key] = {
      enabled: s?.enabled === true,
      price: parsePrice(s?.price),
      hourly: parsePrice(s?.hourly),
    };
  }
  return { enabled: settings.enabled === true, types };
}

export type HuoltoAccess = {
  moduleEnabled: boolean;
  isTypeEnabled: (typeKey: string) => boolean;
  isCategoryEnabled: (category: HuoltoCategoryKey) => boolean;
  enabledCategories: HuoltoCategoryKey[];
  enabledKylmaTypes: string[];
};

export function huoltoAccess(settings: HuoltoSettings): HuoltoAccess {
  const typeOn = (key: string) => settings.enabled && settings.types[key]?.enabled === true;
  const categoryOn = (category: HuoltoCategoryKey) => huoltoReportTypesOf(category).some((t) => typeOn(t.key));
  const enabledCategories = HUOLTO_CATEGORIES.map((c) => c.key).filter(categoryOn);
  return {
    moduleEnabled: enabledCategories.length > 0,
    isTypeEnabled: typeOn,
    isCategoryEnabled: categoryOn,
    enabledCategories,
    enabledKylmaTypes: huoltoReportTypesOf('kylma').filter((t) => typeOn(t.key)).map((t) => t.key),
  };
}

/** Ladattaessa (null) ei piiloteta mitään, jotta valikko ei välky. */
export const HUOLTO_ACCESS_ALL: HuoltoAccess = huoltoAccess(legacyHuoltoSettings());

/** "Uusi huoltoraportti" -linkki: suoraan kylmälomakkeeseen, jos muita lajeja ei ole käytössä. */
export function newHuoltoReportHref(access: HuoltoAccess, query = ''): string {
  const q = query ? (query.startsWith('?') ? query : `?${query}`) : '';
  const cats = access.enabledCategories;
  if (cats.length === 1) {
    return cats[0] === 'kylma' ? `/huoltoraportit/uusi${q}` : `/huoltoraportit/uusi/${cats[0]}${q}`;
  }
  return `/huoltoraportit/valitse${q}`;
}

export function newHuoltoReportHrefForCategory(category: HuoltoCategoryKey, query = ''): string {
  const q = query ? (query.startsWith('?') ? query : `?${query}`) : '';
  return category === 'kylma' ? `/huoltoraportit/uusi${q}` : `/huoltoraportit/uusi/${category}${q}`;
}

/** Raportin laji datasta: tarkastuslistaraportilla reportCategory, muuten kylmä. */
export function reportCategoryOf(data: unknown): HuoltoCategoryKey {
  const cat = data && typeof data === 'object' ? (data as Record<string, unknown>).reportCategory : undefined;
  return isChecklistCategory(cat) ? cat : 'kylma';
}

/** Raportin hinnoittelutyyppi: tarkastuslista = laji, kylmä = laitetyyppi. */
export function reportTypeKeyOf(data: unknown): string {
  const cat = reportCategoryOf(data);
  if (cat !== 'kylma') return cat;
  const t = data && typeof data === 'object' ? (data as Record<string, unknown>).laiteTyyppi : '';
  return typeof t === 'string' ? t : '';
}

/** Listan Laji-sarake: "LVI-huolto" tai kylmälaitteen tyyppi ("Ilmalämpöpumppu"). */
export function reportTypeListLabel(data: unknown): string {
  const cat = reportCategoryOf(data);
  if (cat !== 'kylma') return huoltoCategoryLabel(cat);
  const key = reportTypeKeyOf(data).trim();
  return key ? huoltoReportTypeLabel(key) : '';
}
