import type { SupabaseClient } from '@supabase/supabase-js';

export type OnboardingDemoStatus = {
  hasDemo: boolean;
  customerCount: number;
  reportCount: number;
  equipmentCount: number;
};

type DemoRpcRow = {
  has_demo?: boolean;
  customers?: number;
  reports?: number;
  equipment?: number;
  ok?: boolean;
  error?: string;
};

function parseDemoStatus(raw: unknown): OnboardingDemoStatus {
  const row = (raw ?? {}) as DemoRpcRow;
  return {
    hasDemo: row.has_demo === true,
    customerCount: Number(row.customers ?? 0),
    reportCount: Number(row.reports ?? 0),
    equipmentCount: Number(row.equipment ?? 0),
  };
}

export async function fetchOnboardingDemoStatus(
  supabase: SupabaseClient,
): Promise<OnboardingDemoStatus> {
  const { data, error } = await supabase.rpc('onboarding_demo_status');
  if (error) throw error;
  return parseDemoStatus(data);
}

export async function createOnboardingDemoData(supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase.rpc('create_onboarding_demo_data');
  if (error) throw error;
  const row = (data ?? {}) as DemoRpcRow;
  if (row.ok === false) {
    if (row.error === 'already_exists') {
      throw new Error('Esimerkkidata on jo luotu.');
    }
    throw new Error('Esimerkkidatan luonti epäonnistui.');
  }
}

export async function deleteOnboardingDemoData(supabase: SupabaseClient): Promise<OnboardingDemoStatus> {
  const { data, error } = await supabase.rpc('delete_onboarding_demo_data');
  if (error) throw error;
  const row = (data ?? {}) as DemoRpcRow;
  if (row.ok === false) {
    throw new Error('Esimerkkidatan poisto epäonnistui.');
  }
  return fetchOnboardingDemoStatus(supabase);
}
