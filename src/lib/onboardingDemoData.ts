import type { SupabaseClient } from '@supabase/supabase-js';

export type OnboardingDemoStatus = {
  hasDemo: boolean;
  customerCount: number;
  reportCount: number;
  equipmentCount: number;
  maintenanceReportCount: number;
};

type DemoRpcRow = {
  has_demo?: boolean;
  customers?: number;
  reports?: number;
  equipment?: number;
  maintenance_reports?: number;
  kept_customers?: number;
  kept_equipment?: number;
  ok?: boolean;
  error?: string;
};

export function parseDemoStatus(raw: unknown): OnboardingDemoStatus {
  const row = (raw ?? {}) as DemoRpcRow;
  return {
    hasDemo: row.has_demo === true,
    customerCount: Number(row.customers ?? 0),
    reportCount: Number(row.reports ?? 0),
    equipmentCount: Number(row.equipment ?? 0),
    maintenanceReportCount: Number(row.maintenance_reports ?? 0),
  };
}

/** Ilman yritystä = oma yritys (toimii myös ennen SQL-päivitystä); yrityksen kanssa = globaali admin. */
function args(companyId?: string | null) {
  return companyId ? { p_company_id: companyId } : undefined;
}

export async function fetchOnboardingDemoStatus(
  supabase: SupabaseClient,
  companyId?: string | null,
): Promise<OnboardingDemoStatus> {
  const { data, error } = await supabase.rpc('onboarding_demo_status', args(companyId));
  if (error) throw error;
  return parseDemoStatus(data);
}

export async function createOnboardingDemoData(supabase: SupabaseClient, companyId?: string | null): Promise<void> {
  const { data, error } = await supabase.rpc('create_onboarding_demo_data', args(companyId));
  if (error) throw error;
  const row = (data ?? {}) as DemoRpcRow;
  if (row.ok === false) {
    if (row.error === 'already_exists') throw new Error('Esimerkkitiedot on jo luotu.');
    if (row.error === 'not_allowed') throw new Error('Ei oikeutta.');
    throw new Error('Esimerkkitietojen luonti epäonnistui.');
  }
}

type StoragePath = { bucket: string; path: string };

/** Ryhmittelee poistettavat tiedostot säiliöittäin, enintään 100 polkua kerrallaan. */
export function chunkStoragePaths(paths: StoragePath[], size = 100): { bucket: string; paths: string[] }[] {
  const byBucket = new Map<string, string[]>();
  for (const p of paths) {
    if (!p?.bucket || !p?.path) continue;
    const list = byBucket.get(p.bucket) ?? [];
    if (!list.includes(p.path)) list.push(p.path);
    byBucket.set(p.bucket, list);
  }
  const out: { bucket: string; paths: string[] }[] = [];
  for (const [bucket, list] of byBucket) {
    for (let i = 0; i < list.length; i += size) out.push({ bucket, paths: list.slice(i, i + size) });
  }
  return out;
}

export type DemoDeleteResult = { keptCustomers: number; keptEquipment: number };

/** Poistaa ensin esimerkkiraporttien tiedostot, sitten merkityt rivit (SQL hoitaa järjestyksen). */
export async function deleteOnboardingDemoData(
  supabase: SupabaseClient,
  companyId?: string | null,
): Promise<DemoDeleteResult> {
  const { data: paths, error: pathsError } = await supabase.rpc('onboarding_demo_storage_paths', args(companyId));
  if (!pathsError && Array.isArray(paths)) {
    for (const chunk of chunkStoragePaths(paths as StoragePath[])) {
      const { error } = await supabase.storage.from(chunk.bucket).remove(chunk.paths);
      if (error) console.warn('[demo] storage remove', chunk.bucket, error.message);
    }
  }
  const { data, error } = await supabase.rpc('delete_onboarding_demo_data', args(companyId));
  if (error) throw error;
  const row = (data ?? {}) as DemoRpcRow;
  if (row.ok === false) {
    throw new Error(row.error === 'not_allowed' ? 'Vain yrityksen ylläpitäjä voi poistaa esimerkkitiedot.' : 'Poisto epäonnistui.');
  }
  return { keptCustomers: Number(row.kept_customers ?? 0), keptEquipment: Number(row.kept_equipment ?? 0) };
}
