import type { SupabaseClient } from '@supabase/supabase-js';

export const QUOTE_REVERT_TO_DRAFT_DENIED_MESSAGE =
  'Palautus luonnokseksi epäonnistui — tarkista oikeudet.';

export async function revertQuoteRequestToDraft(supabase: SupabaseClient, quoteId: string) {
  const { data, error } = await supabase
    .from('quote_requests')
    .update({ status: 'draft' })
    .eq('id', quoteId)
    .eq('status', 'sent')
    .select('id, status')
    .maybeSingle();

  if (error) return { data: null, error };
  if (!data) {
    return { data: null, error: { message: QUOTE_REVERT_TO_DRAFT_DENIED_MESSAGE } };
  }
  return { data, error: null };
}
