import { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types';
import { claimInvitedProfile } from '../lib/profileClaim';

const PROFILE_SELECT =
  'id, display_name, email, tukes_number, home_address, workplace_address, trip_departure_source, role, company_id, subscriber_id, customer_id, is_global_admin, must_change_password';

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
  const profileRef = useRef<Profile | null>(null);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    const userId = session.user.id;
    const userEmail = session.user.email ?? '';
    const meta = session.user.user_metadata ?? {};
    const metaCompanyId = typeof meta.company_id === 'string' ? meta.company_id : null;

    let cancelled = false;

    async function loadProfile() {
      const alreadyLoadedForUser = profileRef.current?.id === userId;
      if (!alreadyLoadedForUser) {
        setLoading(true);
      }

      let { data, error } = await supabase.from('profiles').select(PROFILE_SELECT).eq('id', userId).maybeSingle();

      if (error) console.error('Profiilin luku epäonnistui:', error.message);

      if (!data || !data.company_id) {
        // Kutsun vastaanotto palvelimella; käyttäjä ei saa itse asettaa yritystä/roolia.
        const claim = await claimInvitedProfile(supabase);
        if (claim === 'claimed') {
          const retry = await supabase.from('profiles').select(PROFILE_SELECT).eq('id', userId).maybeSingle();
          data = retry.data;
        } else if (claim === 'unavailable' && metaCompanyId) {
          // Vanha polku vain ennen profile_security.sql-ajoa.
          if (!data) {
            await supabase.from('profiles').upsert({
              id: userId,
              company_id: metaCompanyId,
              email: userEmail,
              display_name: (meta.display_name as string) ?? userEmail.split('@')[0] ?? 'Käyttäjä',
              role: (meta.role as string) ?? 'technician',
            });
          } else {
            await supabase
              .from('profiles')
              .update({ company_id: metaCompanyId, role: (meta.role as string) ?? data.role })
              .eq('id', userId);
          }
          const retry = await supabase.from('profiles').select(PROFILE_SELECT).eq('id', userId).maybeSingle();
          data = retry.data;
        }
      }

      if (cancelled) return;

      if (!data) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const row = data as ProfileRow;
      // Globaali admin vain profiilista (user_metadata on käyttäjän itse muokattavissa).
      const isGlobalAdmin = row.is_global_admin === true;
      const company = row.company_id ? await fetchCompany(row.company_id) : null;

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
        company_id: row.company_id,
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
  }, [session.user.id, reloadToken]);

  return (
    <ProfileContext.Provider value={{ profile, loading, reload }}>{children}</ProfileContext.Provider>
  );
}

