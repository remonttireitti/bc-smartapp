import type { SupabaseClient } from '@supabase/supabase-js';
import type { Customer } from '../types';

export type CreateRegistryCustomerInput = {
  ownerCompanyId: string;
  name: string;
  address?: string;
  city?: string;
  phone?: string;
  subscriberId?: string | null;
};

export async function createRegistryCustomer(
  supabase: SupabaseClient,
  input: CreateRegistryCustomerInput,
): Promise<{ customer: Customer | null; error: string | null }> {
  const { data, error } = await supabase.rpc('create_customer_for_registry', {
    p_owner_company_id: input.ownerCompanyId,
    p_name: input.name.trim(),
    p_address: input.address?.trim() || null,
    p_city: input.city?.trim() || null,
    p_phone: input.phone?.trim() || null,
    p_subscriber_id: input.subscriberId || null,
  });

  if (error) return { customer: null, error: error.message };

  const customer = (data as Customer | null) ?? null;
  if (!customer?.id) {
    return { customer: null, error: 'Asiakkaan luonti epäonnistui.' };
  }

  return { customer, error: null };
}
