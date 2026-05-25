import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types';

type ProfileRow = {
  id: string;
  display_name: string | null;
  email: string | null;
  tukes_number?: string | null;
  role: string;
  company_id: string | null;
  is_global_admin?: boolean;
};

async function fetchCompany(companyId: string) {
  const { data } = await supabase.from('companies').select('id, name').eq('id', companyId).maybeSingle();
  return data;
}

export function useProfile(session: Session | null) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const userId = session.user.id;
    const userEmail = session.user.email ?? '';
    const meta = session.user.user_metadata ?? {};
    const metaCompanyId = typeof meta.company_id === 'string' ? meta.company_id : null;
    const metaGlobalAdmin = meta.is_global_admin === true;

    async function loadProfile() {
      setLoading(true);

      let { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, email, tukes_number, role, company_id, is_global_admin')
        .eq('id', userId)
        .maybeSingle();

      if (error) console.error('Profiilin luku epäonnistui:', error.message);

      if (!data && metaCompanyId) {
        await supabase.from('profiles').upsert({
          id: userId,
          company_id: metaCompanyId,
          email: userEmail,
          display_name: (meta.display_name as string) ?? userEmail.split('@')[0] ?? 'Käyttäjä',
          role: (meta.role as string) ?? 'technician',
        });
        const retry = await supabase
          .from('profiles')
          .select('id, display_name, email, tukes_number, role, company_id, is_global_admin')
          .eq('id', userId)
          .maybeSingle();
        data = retry.data;
      }

      if (data && !data.company_id && metaCompanyId) {
        await supabase.from('profiles').update({
          company_id: metaCompanyId,
          role: (meta.role as string) ?? data.role,
        }).eq('id', userId);
        data = { ...data, company_id: metaCompanyId };
      }

      if (!data) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const row = data as ProfileRow;
      const isGlobalAdmin = row.is_global_admin === true || metaGlobalAdmin;
      let company = row.company_id ? await fetchCompany(row.company_id) : null;

      if (!company && metaCompanyId) {
        company = await fetchCompany(metaCompanyId);
        if (company && !row.company_id) {
          await supabase.from('profiles').update({ company_id: metaCompanyId }).eq('id', userId);
          row.company_id = metaCompanyId;
        }
      }

      setProfile({
        id: row.id,
        display_name: row.display_name,
        email: row.email,
        tukes_number: row.tukes_number ?? null,
        role: row.role,
        company_id: row.company_id ?? metaCompanyId,
        is_global_admin: isGlobalAdmin,
        companies: company,
      });
      setLoading(false);
    }

    void loadProfile();
  }, [session, reloadToken]);

  return { profile, loading, reload };
}
