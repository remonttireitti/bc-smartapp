import { supabase } from './supabase';

export type CompanyUserDeletionImpact = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  role: string;
  as_creator: number;
  as_assignee: number;
  daily_logs: number;
};

export type DeleteCompanyUserInput = {
  user_id: string;
  company_id: string | null;
  transfer_to_user_id?: string | null;
};

type DeleteCompanyUserResponse = {
  ok?: boolean;
  error?: string;
  impact?: CompanyUserDeletionImpact;
};

function readFunctionErrorMessage(
  data: DeleteCompanyUserResponse | null,
  error: { message: string } | null,
) {
  if (data?.error) return data.error;
  if (error?.message && !error.message.includes('non-2xx')) return error.message;
  return data?.error ?? error?.message ?? 'Käyttäjän poisto epäonnistui';
}

async function callDeleteCompanyUserApi(body: Record<string, unknown>) {
  if (import.meta.env.DEV) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('Ei kirjautumista');

    const response = await fetch('/api/delete-company-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as DeleteCompanyUserResponse;
    if (!response.ok) {
      throw new Error(data.error ?? 'Käyttäjän poisto epäonnistui');
    }
    return data;
  }

  const { data, error } = await supabase.functions.invoke<DeleteCompanyUserResponse>(
    'delete-company-user',
    { body },
  );

  if (error || data?.error || !data?.ok) {
    throw new Error(readFunctionErrorMessage(data, error));
  }

  return data;
}

export async function fetchCompanyUserDeletionImpact(userId: string): Promise<CompanyUserDeletionImpact> {
  const { data, error } = await supabase.rpc('get_company_user_deletion_impact', {
    p_user_id: userId,
  });

  if (error) throw new Error(error.message);
  return data as CompanyUserDeletionImpact;
}

export async function deleteCompanyUser(input: DeleteCompanyUserInput) {
  return callDeleteCompanyUserApi({
    user_id: input.user_id,
    company_id: input.company_id,
    transfer_to_user_id: input.transfer_to_user_id ?? null,
  });
}
