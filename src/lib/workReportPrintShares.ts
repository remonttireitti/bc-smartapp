import { supabase } from './supabase';
import type { WorkReport, WorkReportDailyLog } from '../types';

export type WorkReportPrintShareBundle = {
  report: WorkReport;
  logs: WorkReportDailyLog[];
  logImages: Record<string, Array<{ fileName: string; url: string; caption: string }>>;
  meta: {
    companyName: string;
    logoUrl: string | null;
  };
};

export function workReportPrintSharePath(token: string): string {
  return `/tyoraportti/jako/${token}`;
}

export function workReportPrintShareUrl(token: string): string {
  if (typeof window === 'undefined') return workReportPrintSharePath(token);
  return `${window.location.origin}${workReportPrintSharePath(token)}`;
}

export function workReportPrintShareFunctionUrl(): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/work-report-print-share`;
}

export async function ensureWorkReportPrintShare(
  workReportId: string,
  companyId: string,
): Promise<string> {
  const { data: existing, error: existingError } = await supabase
    .from('work_report_print_shares')
    .select('access_token, enabled')
    .eq('work_report_id', workReportId)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existing?.access_token && existing.enabled !== false) {
    return existing.access_token;
  }

  const { data, error } = await supabase
    .from('work_report_print_shares')
    .upsert(
      {
        work_report_id: workReportId,
        company_id: companyId,
        enabled: true,
      },
      { onConflict: 'work_report_id' },
    )
    .select('access_token')
    .single();

  if (error || !data?.access_token) {
    throw new Error(error?.message ?? 'Tulostelinkin luonti epäonnistui.');
  }

  return String(data.access_token);
}

export async function loadWorkReportPrintSharePublic(token: string): Promise<WorkReportPrintShareBundle> {
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const response = await fetch(workReportPrintShareFunctionUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
    body: JSON.stringify({ token }),
  });

  const data = (await response.json()) as WorkReportPrintShareBundle & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? 'Jaetun tulosteen lataus epäonnistui');
  }

  return data;
}
