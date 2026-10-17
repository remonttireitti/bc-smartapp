import type { SupabaseClient } from '@supabase/supabase-js';

type RpcError = { code?: string | null; message?: string | null } | null | undefined;

/** RPC puuttuu (SQL ajamatta): PostgREST PGRST202 / Postgres 42883. */
export function isMissingRpcError(error: RpcError): boolean {
  if (!error) return false;
  if (error.code === 'PGRST202' || error.code === '42883') return true;
  return /could not find the function|function .* does not exist/i.test(error.message ?? '');
}

export type ClaimResult = 'claimed' | 'unchanged' | 'no_invite' | 'rejected' | 'unavailable';

/**
 * Kutsun vastaanotto palvelimella (claim_invited_profile): yritys ja rooli luetaan vain
 * palvelimen asettamasta app_metadatasta. 'unavailable' = SQL ajamatta → vanha polku.
 */
export async function claimInvitedProfile(supabase: SupabaseClient): Promise<ClaimResult> {
  const { data, error } = await supabase.rpc('claim_invited_profile');
  if (error) return isMissingRpcError(error) ? 'unavailable' : 'rejected';
  const status = (data as { status?: string } | null)?.status;
  if (status === 'claimed' || status === 'unchanged' || status === 'no_invite') return status;
  return 'rejected';
}
