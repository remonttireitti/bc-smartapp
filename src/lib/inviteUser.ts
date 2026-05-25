import { supabase } from './supabase';

export type InviteCompanyUserInput = {
  email: string;
  password: string;
  display_name: string;
  role: string;
  company_id: string | null;
  subscriber_id?: string | null;
};

export async function inviteCompanyUser(input: InviteCompanyUserInput) {
  if (import.meta.env.DEV) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('Ei kirjautumista');

    const response = await fetch('/api/invite-company-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(input),
    });

    const data = (await response.json()) as { ok?: boolean; error?: string; user_id?: string };
    if (!response.ok) {
      throw new Error(data.error ?? 'Käyttäjän luonti epäonnistui');
    }
    return data;
  }

  const { data, error } = await supabase.functions.invoke('invite-company-user', { body: input });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(String(data.error));
  return data as { ok: boolean; user_id?: string };
}
