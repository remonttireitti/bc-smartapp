import { useContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ProfileContext } from '../contexts/ProfileContext';

const EMPTY_PROFILE = {
  profile: null,
  loading: false,
  reload: () => {},
} as const;

export function useProfile(session: Session | null) {
  const ctx = useContext(ProfileContext);
  if (!session || !ctx) return EMPTY_PROFILE;
  return ctx;
}
