import type { SupabaseClient } from '@supabase/supabase-js';
import type { QuoteRequestData, QuoteRequestStatus } from './types';

export type UpdateQuoteRequestInput = {
  quoteId: string;
  ownerCompanyId: string;
  brandingCompanyId: string;
  partnershipId: string | null;
  customerId: string;
  subscriberId: string | null;
  subscriberPortalVisibility: string;
  equipmentId: string | null;
  title: string;
  status: QuoteRequestStatus;
  data: QuoteRequestData;
};

function isMissingRpcError(message: string | undefined): boolean {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return (
    normalized.includes('update_quote_request')
    && (normalized.includes('does not exist')
      || normalized.includes('could not find')
      || normalized.includes('schema cache'))
  );
}

async function updateQuoteRequestDirect(
  supabase: SupabaseClient,
  input: UpdateQuoteRequestInput,
): Promise<{ data: { data: QuoteRequestData } | null; error: { message: string } | null }> {
  const { data, error } = await supabase
    .from('quote_requests')
    .update({
      owner_company_id: input.ownerCompanyId,
      branding_company_id: input.brandingCompanyId,
      partnership_id: input.partnershipId,
      customer_id: input.customerId,
      subscriber_id: input.subscriberId,
      subscriber_portal_visibility: input.subscriberPortalVisibility,
      equipment_id: input.equipmentId,
      title: input.title,
      status: input.status,
      data: input.data,
    })
    .eq('id', input.quoteId)
    .select('data')
    .maybeSingle();

  if (error) return { data: null, error: { message: error.message } };
  if (!data) {
    const { data: stillReadable } = await supabase
      .from('quote_requests')
      .select('id')
      .eq('id', input.quoteId)
      .maybeSingle();
    return {
      data: null,
      error: {
        message: stillReadable
          ? 'Tallennus epäonnistui — ei kirjoitusoikeutta tähän tarjoukseen. Aja migraatio update_quote_request tuotantokantaan.'
          : 'Tallennus epäonnistui — tarjousta ei löytynyt tai sitä ei voi enää muokata.',
      },
    };
  }
  return { data: { data: (data as { data: QuoteRequestData }).data }, error: null };
}

export async function updateQuoteRequestViaRpc(
  supabase: SupabaseClient,
  input: UpdateQuoteRequestInput,
): Promise<{ data: { data: QuoteRequestData } | null; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('update_quote_request', {
    p_id: input.quoteId,
    p_owner_company_id: input.ownerCompanyId,
    p_branding_company_id: input.brandingCompanyId,
    p_partnership_id: input.partnershipId,
    p_customer_id: input.customerId,
    p_subscriber_id: input.subscriberId,
    p_subscriber_portal_visibility: input.subscriberPortalVisibility,
    p_equipment_id: input.equipmentId,
    p_title: input.title,
    p_status: input.status,
    p_data: input.data,
  });

  if (error) {
    if (isMissingRpcError(error.message)) {
      return updateQuoteRequestDirect(supabase, input);
    }
    return { data: null, error: { message: error.message } };
  }
  if (!data) {
    return {
      data: null,
      error: { message: 'Tallennus epäonnistui — tarjousta ei päivitetty.' },
    };
  }

  const row = data as { data?: QuoteRequestData };
  return {
    data: { data: (row.data ?? input.data) as QuoteRequestData },
    error: null,
  };
}
