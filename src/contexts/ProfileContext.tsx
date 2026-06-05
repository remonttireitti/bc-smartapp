import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types';

type ProfileRow = {
  id: string;
  display_name: string | null;
  email: string | null;
  tukes_number?: string | null;
  home_address?: string | null;
  workplace_address?: string | null;
  trip_departure_source?: 'workplace' | 'home' | null;
  role: string;
  company_id: string | null;
  subscriber_id?: string | null;
  customer_id?: string | null;
  is_global_admin?: boolean;
  must_change_password?: boolean;
};

type ProfileContextValue = {
  profile: Profile | null;
  loading: boolean;
  reload: () => void;
};

export const ProfileContext = createContext<ProfileContextValue | null>(null);

async function fetchCompany(companyId: string) {
  const { data } = await supabase.from('companies').select('id, name').eq('id', companyId).maybeSingle();
  return data;
}

export function ProfileProvider({ session, children }: { session: Session; children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    const userId = session.user.id;
    const userEmail = session.user.email ?? '';
    const meta = session.user.user_metadata ?? {};
    const metaCompanyId = typeof meta.company_id === 'string' ? meta.company_id : null;
    const metaGlobalAdmin = meta.is_global_admin === true;

    let cancelled = false;

    async function loadProfile() {
      setLoading(true);

      let { data, error } = await supabase
        .from('profiles')
        .select(
          'id, display_name, email, tukes_number, home_address, workplace_address, trip_departure_source, role, company_id, subscriber_id, customer_id, is_global_admin, must_change_password',
        )
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
          .select(
            'id, display_name, email, tukes_number, home_address, workplace_address, trip_departure_source, role, company_id, subscriber_id, customer_id, is_global_admin, must_change_password',
          )
          .eq('id', userId)
          .maybeSingle();
        data = retry.data;
      }

      if (data && !data.company_id && metaCompanyId) {
        await supabase
          .from('profiles')
          .update({
            company_id: metaCompanyId,
            role: (meta.role as string) ?? data.role,
          })
          .eq('id', userId);
        data = { ...data, company_id: metaCompanyId };
      }

      if (cancelled) return;

      if (!data) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const row = data as ProfileRow;
      if (metaGlobalAdmin && !row.is_global_admin) {
        await supabase.from('profiles').update({ is_global_admin: true }).eq('id', userId);
        row.is_global_admin = true;
      }
      const isGlobalAdmin = row.is_global_admin === true || metaGlobalAdmin;
      let company = row.company_id ? await fetchCompany(row.company_id) : null;

      if (!company && metaCompanyId) {
        company = await fetchCompany(metaCompanyId);
        if (company && !row.company_id) {
          await supabase.from('profiles').update({ company_id: metaCompanyId }).eq('id', userId);
          row.company_id = metaCompanyId;
        }
      }

      if (cancelled) return;

      setProfile({
        id: row.id,
        display_name: row.display_name,
        email: row.email,
        tukes_number: row.tukes_number ?? null,
        home_address: row.home_address ?? null,
        workplace_address: row.workplace_address ?? null,
        trip_departure_source: row.trip_departure_source === 'home' ? 'home' : 'workplace',
        role: row.role,
        company_id: row.company_id ?? metaCompanyId,
        subscriber_id: row.subscriber_id ?? null,
        customer_id: row.customer_id ?? null,
        is_global_admin: isGlobalAdmin,
        must_change_password: row.must_change_password === true,
        companies: company,
      });
      setLoading(false);
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [session.user.id, session.user.email, session.user.user_metadata, reloadToken]);

  return (
    <ProfileContext.Provider value={{ profile, loading, reload }}>{children}</ProfileContext.Provider>
  );
}

