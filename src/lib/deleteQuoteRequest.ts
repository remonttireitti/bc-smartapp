import type { SupabaseClient } from '@supabase/supabase-js';

export const QUOTE_DELETE_DENIED_MESSAGE =
  'Tarjouksen poisto epäonnistui — tarkista oikeudet.';

/** @deprecated Use QUOTE_DELETE_DENIED_MESSAGE */
export const QUOTE_DRAFT_DELETE_DENIED_MESSAGE = QUOTE_DELETE_DENIED_MESSAGE;

export async function deleteQuoteRequestById(supabase: SupabaseClient, quoteId: string) {
  const { data, error } = await supabase
    .from('quote_requests')
    .delete()
    .eq('id', quoteId)
    .select('id')
    .maybeSingle();

  if (error) return { data: null, error };
  if (!data) {
    return { data: null, error: { message: QUOTE_DELETE_DENIED_MESSAGE } };
  }
  return { data, error: null };
}
