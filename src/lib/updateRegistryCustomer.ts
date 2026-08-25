import type { SupabaseClient } from '@supabase/supabase-js';
import type { Customer } from '../types';
import type { HuoltoReportData } from './huoltoRaportti/types';

export type UpdateRegistryCustomerInput = {
  customerId: string;
  name: string;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  business_id?: string | null;
  notes?: string | null;
  subscriberId?: string | null;
  touchSubscriberId?: boolean;
};

export function customerAddressLineParts(customer: {
  address?: string | null;
  city?: string | null;
}): string {
  return [customer.address, customer.city].filter(Boolean).join(', ');
}

/** Kääntää huoltoraportin yhden osoiterivin takaisin rekisterin address/city-kentiksi. */
export function parseReportOsoite(
  osoite: string,
  existing?: { address?: string | null; city?: string | null } | null,
): { address: string | null; city: string | null } {
  const trimmed = osoite.trim();
  if (!trimmed) return { address: null, city: null };

  const existingCombined = customerAddressLineParts(existing ?? {});
  if (existingCombined && trimmed === existingCombined) {
    return {
      address: existing?.address?.trim() || null,
      city: existing?.city?.trim() || null,
    };
  }

  const commaIdx = trimmed.lastIndexOf(', ');
  if (commaIdx > 0) {
    return {
      address: trimmed.slice(0, commaIdx).trim() || null,
      city: trimmed.slice(commaIdx + 2).trim() || null,
    };
  }

  return { address: trimmed, city: existing?.city?.trim() || null };
}

export function buildCustomerPatchFromMaintenanceData(
  data: Pick<
    HuoltoReportData,
    'asiakas' | 'osoite' | 'asiakasYtunnus' | 'asiakasPuhelin' | 'asiakasEmail'
  >,
  existing?: Pick<Customer, 'address' | 'city'> | null,
): Omit<UpdateRegistryCustomerInput, 'customerId'> | null {
  const name = data.asiakas?.trim();
  if (!name) return null;

  const { address, city } = parseReportOsoite(data.osoite?.trim() ?? '', existing);

  return {
    name,
    address,
    city,
    phone: data.asiakasPuhelin?.trim() || null,
    email: data.asiakasEmail?.trim() || null,
    business_id: data.asiakasYtunnus?.trim() || null,
  };
}

export async function updateRegistryCustomer(
  supabase: SupabaseClient,
  input: UpdateRegistryCustomerInput,
): Promise<{ customer: Customer | null; error: string | null }> {
  const { data, error } = await supabase.rpc('update_customer_for_registry', {
    p_customer_id: input.customerId,
    p_name: input.name.trim(),
    p_address: input.address?.trim() || null,
    p_city: input.city?.trim() || null,
    p_phone: input.phone?.trim() || null,
    p_email: input.email?.trim() || null,
    p_business_id: input.business_id?.trim() || null,
    p_notes: input.notes?.trim() || null,
    p_subscriber_id: input.subscriberId ?? null,
    p_touch_subscriber_id: input.touchSubscriberId ?? false,
  });

  if (error) return { customer: null, error: error.message };

  const customer = (data as Customer | null) ?? null;
  if (!customer?.id) {
    return { customer: null, error: 'Asiakkaan tallennus epäonnistui.' };
  }

  return { customer, error: null };
}

export async function syncCustomerFromMaintenanceReport(
  supabase: SupabaseClient,
  customerId: string,
  data: Pick<
    HuoltoReportData,
    'asiakas' | 'osoite' | 'asiakasYtunnus' | 'asiakasPuhelin' | 'asiakasEmail'
  >,
  existing?: Pick<Customer, 'address' | 'city'> | null,
): Promise<{ customer: Customer | null; error: string | null }> {
  const patch = buildCustomerPatchFromMaintenanceData(data, existing);
  if (!patch) return { customer: null, error: null };

  return updateRegistryCustomer(supabase, {
    customerId,
    ...patch,
  });
}
