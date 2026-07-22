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
  return `/j/${token}`;
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
  _companyId?: string,
): Promise<string> {
  void _companyId;
  const { data, error } = await supabase.rpc('ensure_work_report_print_share', {
    p_work_report_id: workReportId,
  });

  if (error) {
    throw new Error(error.message);
  }

  const token = typeof data === 'string' ? data.trim() : '';
  if (!token) {
    throw new Error('Tulostelinkin luonti epäonnistui.');
  }

  return token;
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
