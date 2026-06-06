import type { SupabaseClient } from '@supabase/supabase-js';

export type OnboardingStats = {
  workReportCount: number;
  customerCount: number;
  companyUserCount: number;
};

const APP_VISIT_KEY = 'bc-smartapp-app-visits';

export function welcomeDismissStorageKey(userId: string) {
  return `bc-smartapp-welcome-dismissed-${userId}`;
}

export function incrementAppVisit(): number {
  try {
    const next = Number(localStorage.getItem(APP_VISIT_KEY) ?? '0') + 1;
    localStorage.setItem(APP_VISIT_KEY, String(next));
    return next;
  } catch {
    return 1;
  }
}

export function getAppVisitCount(): number {
  try {
    return Number(localStorage.getItem(APP_VISIT_KEY) ?? '0');
  } catch {
    return 0;
  }
}

export function isWelcomeDismissed(userId: string): boolean {
  try {
    return localStorage.getItem(welcomeDismissStorageKey(userId)) === '1';
  } catch {
    return false;
  }
}

export function dismissWelcome(userId: string) {
  try {
    localStorage.setItem(welcomeDismissStorageKey(userId), '1');
  } catch {
    /* ignore */
  }
}

export function isProfileStepComplete(profile: { display_name?: string | null } | null | undefined): boolean {
  return (profile?.display_name?.trim().length ?? 0) >= 2;
}

export function isWorkOrCustomerStepComplete(stats: OnboardingStats | null): boolean {
  if (!stats) return false;
  return stats.workReportCount > 0 || stats.customerCount > 0;
}

export function isInviteStepComplete(stats: OnboardingStats | null): boolean {
  if (!stats) return false;
  return stats.companyUserCount > 1;
}

export async function loadOnboardingStats(
  supabase: SupabaseClient,
  companyId: string,
): Promise<OnboardingStats> {
  const [reportsResult, customersResult, usersResult] = await Promise.all([
    supabase.from('work_reports').select('id', { count: 'exact', head: true }),
    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('owner_company_id', companyId),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId),
  ]);

  return {
    workReportCount: reportsResult.count ?? 0,
    customerCount: customersResult.count ?? 0,
    companyUserCount: usersResult.count ?? 0,
  };
}

export async function loadRealOnboardingStats(
  supabase: SupabaseClient,
  companyId: string,
): Promise<OnboardingStats> {
  const [reportsResult, customersResult, usersResult] = await Promise.all([
    supabase.from('work_reports').select('id', { count: 'exact', head: true }).eq('is_onboarding_demo', false),
    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('owner_company_id', companyId)
      .eq('is_onboarding_demo', false),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId),
  ]);

  return {
    workReportCount: reportsResult.count ?? 0,
    customerCount: customersResult.count ?? 0,
    companyUserCount: usersResult.count ?? 0,
  };
}
