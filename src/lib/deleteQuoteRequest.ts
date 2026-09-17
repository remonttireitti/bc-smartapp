import type { SupabaseClient } from '@supabase/supabase-js';

export const QUOTE_DRAFT_DELETE_DENIED_MESSAGE =
  'Luonnoksen poisto epäonnistui — tarkista oikeudet.';

export async function deleteQuoteRequestById(supabase: SupabaseClient, quoteId: string) {
  const { data, error } = await supabase
    .from('quote_requests')
    .delete()
    .eq('id', quoteId)
    .select('id')
    .maybeSingle();

  if (error) return { data: null, error };
  if (!data) {
    return { data: null, error: { message: QUOTE_DRAFT_DELETE_DENIED_MESSAGE } };
  }
  return { data, error: null };
}
