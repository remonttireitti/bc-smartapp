import type { SupabaseClient } from '@supabase/supabase-js';

export async function deleteWorkReportById(supabase: SupabaseClient, reportId: string) {
  return supabase.from('work_reports').delete().eq('id', reportId);
}
