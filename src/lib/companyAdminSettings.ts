import type { SupabaseClient } from '@supabase/supabase-js';

/** Kentät, joita globaali admin voi muuttaa toisen yrityksen settings-JSONiin. */
export const GBA_SETTINGS_KEYS = ['huolto', 'partnerships_enabled'] as const;
export type GbaSettingsPatch = Partial<Record<(typeof GBA_SETTINGS_KEYS)[number], unknown>>;

function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message ?? '');
}

/**
 * Tallentaa yrityksen nimen ja/tai settings-kentät.
 * Ensisijaisesti RPC global_admin_update_company; ennen SQL:n ajoa oma yritys päivitetään suoraan (RLS sallii).
 */
export async function saveCompanyAdminPatch(
  supabase: SupabaseClient,
  companyId: string,
  patch: { name?: string; settings?: GbaSettingsPatch },
  ownCompanyId: string | null | undefined,
): Promise<void> {
  const settingsPatch = Object.fromEntries(
    Object.entries(patch.settings ?? {}).filter(([k]) => (GBA_SETTINGS_KEYS as readonly string[]).includes(k)),
  );
  const { error } = await supabase.rpc('global_admin_update_company', {
    p_company_id: companyId,
    p_name: patch.name?.trim() || null,
    p_settings_patch: settingsPatch,
  });
  if (!error) return;
  if (!isMissingFunction(error)) throw new Error(error.message);
  if (companyId !== ownCompanyId) {
    throw new Error('Tietokantapäivitys puuttuu (global_admin_update_company). Aja SQL ensin.');
  }
  const { data, error: loadError } = await supabase.from('companies').select('settings').eq('id', companyId).single();
  if (loadError) throw new Error(loadError.message);
  const current = data?.settings && typeof data.settings === 'object' ? (data.settings as Record<string, unknown>) : {};
  const update: Record<string, unknown> = { settings: { ...current, ...settingsPatch } };
  if (patch.name?.trim()) update.name = patch.name.trim();
  const { error: updateError } = await supabase.from('companies').update(update).eq('id', companyId);
  if (updateError) throw new Error(updateError.message);
}
