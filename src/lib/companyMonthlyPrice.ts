import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ADDON_MODULES,
  HUOLTO_KEYS,
  STAFF_ROLES,
  estimateMonthly,
  normalizeRoles,
  parsePriceList,
  type PriceEstimate,
  type PricedSelection,
  type StaffRole,
} from '../../supabase/functions/_shared/companySignupCore';
import { huoltoAccess, parseHuoltoSettings } from './huoltoCategories';

type ProfileRow = { role: string | null; staff_roles?: string[] | null };

/** Yrityksen käytössä olevat moduulit ja käyttäjät hinnoittelua varten (puhdas funktio, testattava). */
export function companyPricedSelection(companySettings: unknown, profiles: ProfileRow[]): PricedSelection {
  const s = (companySettings && typeof companySettings === 'object' ? companySettings : {}) as Record<string, unknown>;
  const license = (s.license && typeof s.license === 'object' ? s.license : {}) as Record<string, unknown>;
  const modules = (license.modules && typeof license.modules === 'object' ? license.modules : {}) as Record<string, unknown>;
  const legacy = license.enrollment === 'legacy';
  const access = huoltoAccess(parseHuoltoSettings(s));
  const sel: PricedSelection = { base: legacy || license.base_active === true, modules: {}, huolto: {}, users: [] };
  for (const k of ADDON_MODULES) {
    // Hinnoittelu seuraa lisenssiä (ei yrityksen omaa näkyvyyskytkintä).
    sel.modules[k] = legacy || modules[k] === true;
  }
  for (const k of HUOLTO_KEYS) sel.huolto[k] = access.isCategoryEnabled(k);
  for (const p of profiles) {
    const roles = normalizeRoles([...(p.staff_roles ?? []), p.role]);
    if (roles.length) sel.users.push({ roles: roles as StaffRole[] });
  }
  return sel;
}

export async function loadCompanyMonthlyEstimate(
  supabase: SupabaseClient,
  companyId: string,
): Promise<PriceEstimate> {
  const [catalog, company] = await Promise.all([
    supabase.from('license_catalog').select('*').eq('id', 1).maybeSingle(),
    supabase.from('companies').select('settings').eq('id', companyId).maybeSingle(),
  ]);
  if (catalog.error) throw catalog.error;
  if (company.error) throw company.error;
  let profiles: ProfileRow[] = [];
  const withRoles = await supabase
    .from('profiles')
    .select('role, staff_roles')
    .eq('company_id', companyId)
    .in('role', [...STAFF_ROLES]);
  if (withRoles.error) {
    // Ennen SQL-ajoa staff_roles-saraketta ei ole.
    const basic = await supabase.from('profiles').select('role').eq('company_id', companyId).in('role', [...STAFF_ROLES]);
    if (basic.error) throw basic.error;
    profiles = (basic.data ?? []) as ProfileRow[];
  } else {
    profiles = (withRoles.data ?? []) as ProfileRow[];
  }
  return estimateMonthly(
    companyPricedSelection((company.data as { settings?: unknown } | null)?.settings, profiles),
    parsePriceList(catalog.data),
  );
}
