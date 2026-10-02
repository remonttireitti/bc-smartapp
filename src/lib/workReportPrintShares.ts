import { supabase } from './supabase';
export {
  PUBLIC_APP_ORIGIN,
  parseWorkReportPrintShareResponse,
  resolvePublicShareOrigin,
  workReportPrintSharePath,
  workReportPrintShareUrl,
  type WorkReportPrintShareBundle,
} from './workReportPrintShareLink';
import { parseWorkReportPrintShareResponse, type WorkReportPrintShareBundle } from './workReportPrintShareLink';

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

  return parseWorkReportPrintShareResponse(response.status, await response.text());
}
