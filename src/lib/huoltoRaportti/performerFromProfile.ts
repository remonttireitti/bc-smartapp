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

/**
 * Täyttäjän nimi on pöytäkirjan kiinteä tieto: asetetaan vain kun se puuttuu.
 * Toinen käyttäjä (esim. kumppani) avaa tai tulostaa → nimi ei vaihdu.
 */
export function huoltoPerformerFieldsKeepingFiller(
  current: { huoltoSuorittajaNimi?: string; huoltoSuorittajaTUKES?: string },
  profile: Profile | null,
  session: Session,
): { huoltoSuorittajaNimi: string; huoltoSuorittajaTUKES: string } {
  const name = String(current.huoltoSuorittajaNimi ?? '').trim();
  if (name && name !== '—') {
    return { huoltoSuorittajaNimi: name, huoltoSuorittajaTUKES: String(current.huoltoSuorittajaTUKES ?? '').trim() };
  }
  return huoltoPerformerFields(profile, session);
}
