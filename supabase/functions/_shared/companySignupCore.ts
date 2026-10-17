/**
 * Tilauslomakkeen yhteinen logiikka (selain + edge function): Y-tunnus, validointi, hinnoittelu.
 * Ei riippuvuuksia — tuodaan sekä Vitestä (src/lib) että Denosta.
 */

export type StaffRole = 'admin' | 'manager' | 'technician';
export const STAFF_ROLES: StaffRole[] = ['admin', 'manager', 'technician'];
export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  admin: 'Ylläpitäjä',
  manager: 'Esimies',
  technician: 'Asentaja',
};

export type AddonModuleKey = 'quotes' | 'billing' | 'remote_monitoring' | 'tools' | 'partners';
export const ADDON_MODULES: AddonModuleKey[] = ['quotes', 'billing', 'remote_monitoring', 'tools', 'partners'];
export const ADDON_MODULE_LABELS: Record<AddonModuleKey, string> = {
  quotes: 'Tarjoukset',
  billing: 'Laskutus',
  remote_monitoring: 'Etäseuranta',
  tools: 'Työkalut',
  partners: 'Kumppanuudet',
};
export const DEFAULT_MODULE_PRICES: Record<AddonModuleKey, number> = {
  quotes: 10,
  billing: 10,
  remote_monitoring: 30,
  tools: 10,
  partners: 10,
};

export type HuoltoCategoryKey = 'kylma' | 'lvi' | 'iv' | 'sahko';
export const HUOLTO_KEYS: HuoltoCategoryKey[] = ['kylma', 'lvi', 'iv', 'sahko'];
export const HUOLTO_LABELS: Record<HuoltoCategoryKey, string> = {
  kylma: 'Kylmälaitehuolto',
  lvi: 'LVI-huolto',
  iv: 'IV-huolto',
  sahko: 'Sähköhuolto',
};

/** Arvonlisävero 25,5 % (1.9.2024 alkaen). */
export const VAT_RATE = 0.255;

export type SignupUser = { name: string; email: string; phone: string; roles: StaffRole[] };

export type SignupForm = {
  company_name: string;
  business_id: string;
  address: string;
  postal_code: string;
  city: string;
  contact_name: string;
  email: string;
  phone: string;
  modules: Record<AddonModuleKey, boolean>;
  huolto: Record<HuoltoCategoryKey, boolean>;
  users: SignupUser[];
  message: string;
};

export type PriceList = {
  base_monthly_eur: number;
  module_prices: Record<AddonModuleKey, number>;
  huolto_prices: Record<HuoltoCategoryKey, number>;
  role_prices: Record<StaffRole, number>;
  /** Etäseurannan laitemaksu €/kk per laite (tyyppi → hinta; 'default' muille). */
  device_prices: Record<DeviceTypeKey, number>;
  /** Kokeilujakson pituus (pv). */
  trial_days: number;
};

export type DeviceTypeKey = 'jc3248' | 'esp32_ds18b20' | 'default';
export const DEVICE_TYPES: DeviceTypeKey[] = ['jc3248', 'esp32_ds18b20', 'default'];
export const DEVICE_TYPE_LABELS: Record<DeviceTypeKey, string> = {
  jc3248: 'JC3248-näyttölaite',
  esp32_ds18b20: 'ESP32 + DS18B20',
  default: 'Muu lämpötilalaite',
};
export const DEFAULT_DEVICE_PRICES: Record<DeviceTypeKey, number> = { jc3248: 5, esp32_ds18b20: 5, default: 5 };
export const DEFAULT_TRIAL_DAYS = 30;

/**
 * Mitä pelkkä Peruspaketti avaa (tarkistettu reittien LicenseModuleGate 'base' + ehdottomat reitit):
 * työraportit/toimeksiannot, asiakkaat + laitteet, varasto, tilaajaportaali, yritys- ja käyttäjähallinta.
 * Huoltoraporttilajit, moduulit ja käyttäjät hinnoitellaan erikseen.
 */
export const BASE_PACKAGE_DESCRIPTION =
  'Työraportit ja toimeksiannot, asiakkaat ja laiterekisteri, varasto (kylmäaine, materiaalit), tilaajaportaali sekä yritys- ja käyttäjähallinta';

export const DEFAULT_ROLE_PRICES: Record<StaffRole, number> = { admin: 0, manager: 15, technician: 10 };
/** Sama kuin license_catalog.base_monthly_eur tuotannossa. */
export const DEFAULT_BASE_MONTHLY_EUR = 49;
export const DEFAULT_HUOLTO_PRICES: Record<HuoltoCategoryKey, number> = { kylma: 10, lvi: 10, iv: 10, sahko: 10 };

export function roundCents(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function num(raw: unknown, fallback: number): number {
  if (raw === null || raw === undefined || raw === '') return fallback;
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? roundCents(n) : fallback;
}

function rec(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

/** license_catalog-rivi → hinnasto (puuttuvat kentät oletuksilla). */
export function parsePriceList(row: unknown): PriceList {
  const r = rec(row);
  const mp = rec(r.module_prices);
  const hp = rec(r.huolto_prices);
  const rp = rec(r.role_prices);
  const module_prices = {} as Record<AddonModuleKey, number>;
  for (const k of ADDON_MODULES) module_prices[k] = num(mp[k], DEFAULT_MODULE_PRICES[k]);
  const huolto_prices = {} as Record<HuoltoCategoryKey, number>;
  for (const k of HUOLTO_KEYS) huolto_prices[k] = num(hp[k], DEFAULT_HUOLTO_PRICES[k]);
  const role_prices = {} as Record<StaffRole, number>;
  for (const k of STAFF_ROLES) role_prices[k] = num(rp[k], DEFAULT_ROLE_PRICES[k]);
  const dp = rec(r.temp_device_monthly_prices);
  const device_prices = {} as Record<DeviceTypeKey, number>;
  for (const k of DEVICE_TYPES) device_prices[k] = num(dp[k], DEFAULT_DEVICE_PRICES[k]);
  const trial = Math.round(num(r.trial_days, DEFAULT_TRIAL_DAYS));
  return {
    base_monthly_eur: num(r.base_monthly_eur, DEFAULT_BASE_MONTHLY_EUR),
    module_prices,
    huolto_prices,
    role_prices,
    device_prices,
    trial_days: trial >= 1 ? trial : DEFAULT_TRIAL_DAYS,
  };
}

export function normalizeRoles(raw: unknown): StaffRole[] {
  const list = Array.isArray(raw) ? raw : [];
  return STAFF_ROLES.filter((r) => list.includes(r));
}

/** Sovelluksen profiles.role (yksi arvo): laajin oikeus. Ylläpitäjä > Esimies > Asentaja. */
export function primaryRole(roles: StaffRole[]): StaffRole {
  if (roles.includes('admin')) return 'admin';
  if (roles.includes('manager')) return 'manager';
  return 'technician';
}

/**
 * Käyttäjän kuukausihinta: usean roolin käyttäjä maksaa kerran, kalleimman roolinsa hinnan.
 * Esim. Asentaja 10 € + Ylläpitäjä 0 € → 10 €; Esimies 15 € + Ylläpitäjä 0 € → 15 €.
 */
export function userMonthlyPrice(roles: StaffRole[], prices: PriceList): number {
  const rs = normalizeRoles(roles);
  if (!rs.length) return 0;
  return Math.max(...rs.map((r) => prices.role_prices[r] ?? 0));
}

export type PriceLine = { key: string; label: string; qty: number; unit: number; total: number };
export type PriceEstimate = { lines: PriceLine[]; net: number; vat: number; gross: number };

export type PricedSelection = {
  base: boolean;
  modules: Partial<Record<AddonModuleKey, boolean>>;
  huolto: Partial<Record<HuoltoCategoryKey, boolean>>;
  users: { roles: StaffRole[] }[];
  /** Etäseurannan laskutettavat laitteet tyypeittäin (tyyppi → kpl). */
  devices?: Partial<Record<string, number>>;
};

/** Laitemaksu yhteensä (sama kuin SQL company_remote_monitoring_devices_pricing). */
export function devicesMonthly(devices: PricedSelection['devices'], prices: PriceList): number {
  let cents = 0;
  for (const [type, count] of Object.entries(devices ?? {})) {
    const n = Math.max(0, Math.floor(Number(count) || 0));
    const unit = (prices.device_prices as Record<string, number>)[type] ?? prices.device_prices.default;
    cents += n * Math.round(unit * 100);
  }
  return cents / 100;
}

/** ALV sentilleen: kokonaisina sentteinä, puolikkaasta ylöspäin (= PostgreSQL round(numeric, 2)). */
export function vatOf(net: number): number {
  const netCents = Math.round(net * 100);
  return Math.floor((netCents * Math.round(VAT_RATE * 1000) + 500) / 1000) / 100;
}

/** Hinta sis. alv (net + vatOf(net)). */
export function grossOf(net: number): number {
  return (Math.round(net * 100) + Math.round(vatOf(net) * 100)) / 100;
}

export function estimateMonthly(sel: PricedSelection, prices: PriceList): PriceEstimate {
  const lines: PriceLine[] = [];
  const add = (key: string, label: string, qty: number, unit: number) => {
    if (qty <= 0) return;
    lines.push({ key, label, qty, unit: roundCents(unit), total: (qty * Math.round(unit * 100)) / 100 });
  };
  if (sel.base) add('base', 'Peruspaketti', 1, prices.base_monthly_eur);
  for (const k of ADDON_MODULES) {
    if (!sel.modules[k]) continue;
    add(`module:${k}`, ADDON_MODULE_LABELS[k], 1, prices.module_prices[k]);
    // Laitemaksut heti etäseurannan jälkeen (sama järjestys kuin company_monthly_price_breakdown).
    if (k === 'remote_monitoring') {
      const dev = devicesMonthly(sel.devices, prices);
      if (dev > 0) add('devices', 'Etäseurantalaitteet', 1, dev);
    }
  }
  // Huoltolajit ja käyttäjät laskutetaan peruspaketin kanssa (sama kuin SQL license_monthly_total).
  if (sel.base) for (const k of HUOLTO_KEYS) if (sel.huolto[k]) add(`huolto:${k}`, HUOLTO_LABELS[k], 1, prices.huolto_prices[k]);
  // Käyttäjät ryhmitellään laskutettavan (kalleimman) roolin mukaan.
  const groups = new Map<string, { label: string; qty: number; unit: number }>();
  for (const u of sel.base ? sel.users : []) {
    const rs = normalizeRoles(u.roles);
    if (!rs.length) continue;
    const unit = userMonthlyPrice(rs, prices);
    const billed = rs.reduce((best, r) => (prices.role_prices[r] > prices.role_prices[best] ? r : best), rs[0]);
    const key = `role:${billed}`;
    const g = groups.get(key) ?? { label: `Käyttäjä: ${STAFF_ROLE_LABELS[billed]}`, qty: 0, unit };
    g.qty += 1;
    groups.set(key, g);
  }
  for (const r of STAFF_ROLES) {
    const g = groups.get(`role:${r}`);
    if (g) add(`role:${r}`, g.label, g.qty, g.unit);
  }
  const net = roundCents(lines.reduce((s, l) => s + l.total, 0));
  const vat = vatOf(net);
  return { lines, net, vat, gross: grossOf(net) };
}

/** Y-tunnus: 1234567-8, tarkiste painoilla 7,9,10,5,8,4,2 (mod 11; jakojäännös 1 = virheellinen). */
export function normalizeBusinessId(raw: string): string {
  const t = String(raw ?? '').trim().replace(/\s+/g, '');
  const m = /^(\d{6,7})-?(\d)$/.exec(t);
  if (!m) return t;
  return `${m[1].padStart(7, '0')}-${m[2]}`;
}

export function isValidBusinessId(raw: string): boolean {
  const v = normalizeBusinessId(raw);
  const m = /^(\d{7})-(\d)$/.exec(v);
  if (!m) return false;
  const weights = [7, 9, 10, 5, 8, 4, 2];
  const sum = m[1].split('').reduce((s, d, i) => s + Number(d) * weights[i], 0);
  const rem = sum % 11;
  if (rem === 1) return false;
  const check = rem === 0 ? 0 : 11 - rem;
  return check === Number(m[2]);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function isValidEmail(raw: string): boolean {
  return EMAIL_RE.test(String(raw ?? '').trim());
}

export function isValidPhone(raw: string): boolean {
  const digits = String(raw ?? '').replace(/[\s()-]/g, '');
  return /^\+?\d{6,15}$/.test(digits);
}

export const MAX_SIGNUP_USERS = 50;

export type SignupErrors = Partial<Record<string, string>>;

/** Palauttaa kenttäkohtaiset virheet; tyhjä = kelvollinen. Käyttäjärivit: users.<i>.<kenttä>. */
export function validateSignup(form: SignupForm): SignupErrors {
  const e: SignupErrors = {};
  const req = (key: keyof SignupForm, label: string) => {
    if (!String(form[key] ?? '').trim()) e[key] = `${label} puuttuu`;
  };
  req('company_name', 'Yrityksen nimi');
  req('address', 'Osoite');
  req('contact_name', 'Yhteyshenkilö');
  if (!isValidBusinessId(form.business_id)) e.business_id = 'Tarkista Y-tunnus (muoto 1234567-8)';
  if (!/^\d{5}$/.test(String(form.postal_code ?? '').trim())) e.postal_code = 'Postinumero 5 numeroa';
  req('city', 'Postitoimipaikka');
  if (!isValidEmail(form.email)) e.email = 'Tarkista sähköposti';
  if (!isValidPhone(form.phone)) e.phone = 'Tarkista puhelinnumero';
  const users = Array.isArray(form.users) ? form.users : [];
  if (!users.length) e.users = 'Lisää vähintään yksi käyttäjä';
  if (users.length > MAX_SIGNUP_USERS) e.users = `Enintään ${MAX_SIGNUP_USERS} käyttäjää`;
  const seen = new Set<string>();
  users.forEach((u, i) => {
    if (!String(u.name ?? '').trim()) e[`users.${i}.name`] = 'Nimi puuttuu';
    const em = String(u.email ?? '').trim().toLowerCase();
    if (!isValidEmail(em)) e[`users.${i}.email`] = 'Tarkista sähköposti';
    else if (seen.has(em)) e[`users.${i}.email`] = 'Sama sähköposti kahdesti';
    seen.add(em);
    if (String(u.phone ?? '').trim() && !isValidPhone(u.phone)) e[`users.${i}.phone`] = 'Tarkista puhelin';
    if (!normalizeRoles(u.roles).length) e[`users.${i}.roles`] = 'Valitse rooli';
  });
  if (users.length && !users.some((u) => normalizeRoles(u.roles).includes('admin'))) {
    e.users = 'Vähintään yhdellä käyttäjällä pitää olla Ylläpitäjä-rooli';
  }
  return e;
}

/** Siistii lomakkeen tallennusta varten (trim, normalisoitu Y-tunnus, roolit). */
export function cleanSignup(form: SignupForm): SignupForm {
  const t = (s: unknown, max = 200) => String(s ?? '').trim().slice(0, max);
  const modules = {} as Record<AddonModuleKey, boolean>;
  for (const k of ADDON_MODULES) modules[k] = form.modules?.[k] === true;
  const huolto = {} as Record<HuoltoCategoryKey, boolean>;
  for (const k of HUOLTO_KEYS) huolto[k] = form.huolto?.[k] === true;
  return {
    company_name: t(form.company_name),
    business_id: normalizeBusinessId(form.business_id),
    address: t(form.address),
    postal_code: t(form.postal_code, 5),
    city: t(form.city, 100),
    contact_name: t(form.contact_name),
    email: t(form.email).toLowerCase(),
    phone: t(form.phone, 40),
    modules,
    huolto,
    users: (form.users ?? []).slice(0, MAX_SIGNUP_USERS).map((u) => ({
      name: t(u.name),
      email: t(u.email).toLowerCase(),
      phone: t(u.phone, 40),
      roles: normalizeRoles(u.roles),
    })),
    message: t(form.message, 2000),
  };
}

export function signupSelection(form: Pick<SignupForm, 'modules' | 'huolto' | 'users'>): PricedSelection {
  return { base: true, modules: form.modules, huolto: form.huolto, users: form.users };
}

export function formatEur(n: number): string {
  return `${n.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}
