import type { Session } from '@supabase/supabase-js';
import type { Profile } from '../../types';

export function huoltoPerformerDisplayName(profile: Profile | null, session: Session): string {
  const name = profile?.display_name?.trim();
  if (name) return name;
  const email = profile?.email ?? session.user.email ?? '';
  const local = email.split('@')[0]?.trim();
  return local || '—';
}

export function huoltoPerformerFields(
  profile: Profile | null,
  session: Session,
): { huoltoSuorittajaNimi: string; huoltoSuorittajaTUKES: string } {
  return {
    huoltoSuorittajaNimi: huoltoPerformerDisplayName(profile, session),
    huoltoSuorittajaTUKES: (profile?.tukes_number ?? '').trim(),
  };
}
