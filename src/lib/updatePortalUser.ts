import { supabase } from './supabase';

export type UpdatePortalUserInput = {
  user_id: string;
  email: string;
  display_name: string;
  password?: string;
  subscriber_id?: string | null;
  customer_id?: string | null;
};

export async function updatePortalUser(input: UpdatePortalUserInput) {
  if (import.meta.env.DEV) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('Ei kirjautumista');

    const response = await fetch('/api/update-portal-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(input),
    });

    const data = (await response.json()) as { ok?: boolean; error?: string; user_id?: string };
    if (!response.ok) {
      throw new Error(data.error ?? 'Portaalikäyttäjän päivitys epäonnistui');
    }
    return data;
  }

  const { data, error } = await supabase.functions.invoke('update-portal-user', { body: input });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(String(data.error));
  return data as { ok: boolean; user_id?: string };
}
