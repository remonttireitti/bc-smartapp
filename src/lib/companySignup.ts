import { supabase } from './supabase';
import type { PriceList, SignupErrors, SignupForm } from '../../supabase/functions/_shared/companySignupCore';

export * from '../../supabase/functions/_shared/companySignupCore';

const FN = 'company-signup';

export type SignupConfig = { enabled: boolean; prices?: PriceList };

/** Lomake näytetään vain, kun edge function ja taulu ovat käytössä. */
export async function fetchSignupConfig(): Promise<SignupConfig> {
  try {
    const { data, error } = await supabase.functions.invoke(FN, { body: { action: 'config' } });
    if (error || !data || (data as SignupConfig).enabled !== true) return { enabled: false };
    return data as SignupConfig;
  } catch {
    return { enabled: false };
  }
}

async function readFnError(error: unknown): Promise<{ message: string; fields?: SignupErrors }> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = (await ctx.json()) as { error?: string; fields?: SignupErrors };
      return { message: body.error ?? 'Lähetys epäonnistui', fields: body.fields };
    } catch {
      /* ignore */
    }
  }
  return { message: error instanceof Error ? error.message : 'Lähetys epäonnistui' };
}

export async function submitSignup(
  form: SignupForm,
  meta: { website: string; startedAt: number },
): Promise<{ ok: true } | { ok: false; message: string; fields?: SignupErrors }> {
  const { data, error } = await supabase.functions.invoke(FN, {
    body: { action: 'submit', form, website: meta.website, started_at: meta.startedAt },
  });
  if (error) return { ok: false, ...(await readFnError(error)) };
  if ((data as { ok?: boolean })?.ok) return { ok: true };
  return { ok: false, message: (data as { error?: string })?.error ?? 'Lähetys epäonnistui' };
}

export type InviteResult = { email: string; status: 'invited' | 'exists' | 'error'; user_id?: string; error?: string };
export type ApproveResult = { company_id: string; invite_results: { users: InviteResult[]; demo: unknown } };

export async function approveSignup(requestId: string): Promise<ApproveResult> {
  const { data, error } = await supabase.functions.invoke(FN, { body: { action: 'approve', request_id: requestId } });
  if (error) throw new Error((await readFnError(error)).message);
  return data as ApproveResult;
}

export async function rejectSignup(requestId: string, reason: string): Promise<{ mail_sent: boolean }> {
  const { data, error } = await supabase.functions.invoke(FN, {
    body: { action: 'reject', request_id: requestId, reason },
  });
  if (error) throw new Error((await readFnError(error)).message);
  return data as { mail_sent: boolean };
}

export type SignupRequestRow = {
  id: string;
  created_at: string;
  status: 'pending' | 'approved' | 'rejected';
  company_name: string;
  business_id: string;
  address: string;
  postal_code: string;
  city: string;
  contact_name: string;
  email: string;
  phone: string;
  modules: Record<string, boolean>;
  huolto: Record<string, boolean>;
  users: { name: string; email: string; phone: string; roles: string[] }[];
  message: string;
  estimate: { net: number; vat: number; gross: number } | null;
  decided_at: string | null;
  reject_reason: string | null;
  company_id: string | null;
  invite_results: { users?: InviteResult[]; demo?: unknown } | null;
};

export const SIGNUP_STATUS_LABELS: Record<SignupRequestRow['status'], string> = {
  pending: 'Odottaa',
  approved: 'Hyväksytty',
  rejected: 'Hylätty',
};

export function emptySignupForm(): SignupForm {
  return {
    company_name: '',
    business_id: '',
    address: '',
    postal_code: '',
    city: '',
    contact_name: '',
    email: '',
    phone: '',
    modules: { quotes: false, billing: false, remote_monitoring: false, tools: false, partners: false },
    huolto: { kylma: true, lvi: false, iv: false, sahko: false },
    users: [{ name: '', email: '', phone: '', roles: ['admin'] }],
    message: '',
  };
}
