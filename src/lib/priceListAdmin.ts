import { BILLING_MODULE_DESCRIPTION } from './companyLicense';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ADDON_MODULE_LABELS,
  BASE_PACKAGE_DESCRIPTION,
  DEVICE_TYPE_LABELS,
  DEVICE_TYPES,
  HUOLTO_KEYS,
  HUOLTO_LABELS,
  STAFF_ROLES,
  STAFF_ROLE_LABELS,
  type AddonModuleKey,
  type DeviceTypeKey,
  type HuoltoCategoryKey,
  type PriceList,
  type StaffRole,
} from '../../supabase/functions/_shared/companySignupCore';
import { isMissingRpcError } from './profileClaim';

/** Palvelun hallinta → Hinnasto: tilaushinnat (license_catalog id = 1). Eri asia kuin yrityksen Huoltohinnasto. */
export type PriceGroupKey = 'perus' | 'moduulit' | 'huolto' | 'kayttajat';

export type PriceRow = {
  key: string;
  group: PriceGroupKey;
  label: string;
  description: string;
  get: (p: PriceList) => number;
  set: (p: PriceList, v: number) => PriceList;
};

export const PRICE_GROUPS: { key: PriceGroupKey; title: string; note?: string }[] = [
  { key: 'perus', title: 'Peruspaketti' },
  { key: 'moduulit', title: 'Moduulit' },
  { key: 'huolto', title: 'Huoltoraportit', note: 'Tilaushinta lajia kohden. Asiakkailta laskettavat huoltohinnat ovat yrityksen Huoltohinnastossa.' },
  { key: 'kayttajat', title: 'Käyttäjät', note: 'Hinta käyttäjää kohden. Monta roolia: kalleimman roolin mukaan.' },
];

const MODULE_DESCRIPTIONS: Record<AddonModuleKey, string> = {
  quotes: 'Tarjouspyynnöt, laskelmat ja tulosteet',
  billing: BILLING_MODULE_DESCRIPTION,
  remote_monitoring: 'Lämpötilaseuranta ja etäohjaus (moduulimaksu)',
  tools: 'Työkaluinventaario ja lainaus',
  partners: 'Yhteistyö muiden yritysten kanssa',
};

const HUOLTO_DESCRIPTIONS: Record<HuoltoCategoryKey, string> = {
  kylma: 'Kylmälaitteet ja lämpöpumput',
  lvi: 'Käyttövesi, lämmitys, viemärit',
  iv: 'Ilmanvaihto, suodattimet, LTO',
  sahko: 'Keskukset, mittaukset',
};

const ROLE_DESCRIPTIONS: Record<StaffRole, string> = {
  admin: 'Yrityksen hallinta ja käyttäjät',
  manager: 'Työnjohto ja raportit',
  technician: 'Työraportit ja huollot',
};

const moduleRow = (k: AddonModuleKey): PriceRow => ({
  key: `module:${k}`,
  group: 'moduulit',
  label: ADDON_MODULE_LABELS[k],
  description: MODULE_DESCRIPTIONS[k],
  get: (p) => p.module_prices[k],
  set: (p, v) => ({ ...p, module_prices: { ...p.module_prices, [k]: v } }),
});

const deviceRow = (k: DeviceTypeKey): PriceRow => ({
  key: `device:${k}`,
  group: 'moduulit',
  label: `Laite: ${DEVICE_TYPE_LABELS[k]}`,
  description: 'Etäseuranta, €/kk per laite',
  get: (p) => p.device_prices[k],
  set: (p, v) => ({ ...p, device_prices: { ...p.device_prices, [k]: v } }),
});

export const PRICE_ROWS: PriceRow[] = [
  {
    key: 'base',
    group: 'perus',
    label: 'Peruspaketti',
    description: BASE_PACKAGE_DESCRIPTION,
    get: (p) => p.base_monthly_eur,
    set: (p, v) => ({ ...p, base_monthly_eur: v }),
  },
  moduleRow('quotes'),
  moduleRow('billing'),
  moduleRow('remote_monitoring'),
  ...DEVICE_TYPES.map(deviceRow),
  moduleRow('tools'),
  moduleRow('partners'),
  ...HUOLTO_KEYS.map<PriceRow>((k) => ({
    key: `huolto:${k}`,
    group: 'huolto',
    label: HUOLTO_LABELS[k],
    description: HUOLTO_DESCRIPTIONS[k],
    get: (p) => p.huolto_prices[k],
    set: (p, v) => ({ ...p, huolto_prices: { ...p.huolto_prices, [k]: v } }),
  })),
  ...STAFF_ROLES.map<PriceRow>((k) => ({
    key: `role:${k}`,
    group: 'kayttajat',
    label: STAFF_ROLE_LABELS[k],
    description: ROLE_DESCRIPTIONS[k],
    get: (p) => p.role_prices[k],
    set: (p, v) => ({ ...p, role_prices: { ...p.role_prices, [k]: v } }),
  })),
];

/** "12,50" / "12.5" → 12.5; tyhjä, negatiivinen tai > 100 000 → null. */
export function parseEurInput(raw: string): number | null {
  const s = String(raw ?? '').replace(/\s/g, '').replace(',', '.');
  if (s === '' || !/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 100000 ? Math.round(n * 100) / 100 : null;
}

export function eurInput(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');
}

/** Lomakkeen luonnos → hinnasto. Palauttaa ensimmäisen virheellisen rivin nimen. */
export function applyDraft(
  base: PriceList,
  draft: Record<string, string>,
  trialDraft: string,
): { prices: PriceList } | { error: string } {
  let next = base;
  for (const r of PRICE_ROWS) {
    const v = parseEurInput(draft[r.key] ?? '');
    if (v === null) return { error: `Tarkista hinta: ${r.label}` };
    next = r.set(next, v);
  }
  const t = Number(String(trialDraft).trim());
  if (!Number.isInteger(t) || t < 1 || t > 365) return { error: 'Kokeilujakso 1–365 päivää' };
  return { prices: { ...next, trial_days: t } };
}

/** RPC:n parametri (global_admin_save_price_list). */
export function priceListPayload(p: PriceList) {
  return {
    trial_days: p.trial_days,
    base_monthly_eur: p.base_monthly_eur,
    module_prices: { ...p.module_prices },
    huolto_prices: { ...p.huolto_prices },
    role_prices: { ...p.role_prices },
    temp_device_monthly_prices: { ...p.device_prices },
  };
}

/** Yksi tallennus. Ennen price_list.sql-ajoa: vanhat RPC:t peräkkäin. */
export async function savePriceList(supabase: SupabaseClient, p: PriceList): Promise<void> {
  const payload = priceListPayload(p);
  const one = await supabase.rpc('global_admin_save_price_list', { p_prices: payload });
  if (!one.error) return;
  if (!isMissingRpcError(one.error)) throw new Error(one.error.message);

  const a = await supabase.rpc('global_admin_update_license_catalog', {
    p_trial_days: payload.trial_days,
    p_base_monthly_eur: payload.base_monthly_eur,
    p_module_prices: payload.module_prices,
    p_temp_device_monthly_prices: payload.temp_device_monthly_prices,
  });
  if (a.error) throw new Error(a.error.message);
  const b = await supabase.rpc('global_admin_update_subscription_prices', {
    p_base_monthly_eur: null,
    p_module_prices: null,
    p_huolto_prices: payload.huolto_prices,
    p_role_prices: payload.role_prices,
  });
  if (b.error) throw new Error(b.error.message);
}
