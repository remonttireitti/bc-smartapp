import type { SupabaseClient } from '@supabase/supabase-js';
import type { Customer } from '../types';
import { formatCustomerAddressParts, type CustomerAddressFields } from './customers';
import type { HuoltoReportData } from './huoltoRaportti/types';

export type UpdateRegistryCustomerInput = {
  customerId: string;
  name: string;
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  business_id?: string | null;
  notes?: string | null;
  subscriberId?: string | null;
  touchSubscriberId?: boolean;
};

export function customerAddressLineParts(customer: CustomerAddressFields): string {
  return formatCustomerAddressParts(customer);
}

function parsePostalCity(value: string): { postal_code: string | null; city: string | null } {
  const trimmed = value.trim();
  if (!trimmed) return { postal_code: null, city: null };
  const match = trimmed.match(/^(\d{5})\s+(.+)$/);
  if (match) {
    return { postal_code: match[1], city: match[2].trim() || null };
  }
  return { postal_code: null, city: trimmed };
}

/** Kääntää huoltoraportin yhden osoiterivin takaisin rekisterin address/postal_code/city-kentiksi. */
export function parseReportOsoite(
  osoite: string,
  existing?: CustomerAddressFields | null,
): { address: string | null; postal_code: string | null; city: string | null } {
  const trimmed = osoite.trim();
  if (!trimmed) return { address: null, postal_code: null, city: null };

  const existingCombined = customerAddressLineParts(existing ?? {});
  if (existingCombined && trimmed === existingCombined) {
    return {
      address: existing?.address?.trim() || null,
      postal_code: existing?.postal_code?.trim() || null,
      city: existing?.city?.trim() || null,
    };
  }

  const commaIdx = trimmed.lastIndexOf(', ');
  if (commaIdx > 0) {
    const street = trimmed.slice(0, commaIdx).trim() || null;
    const { postal_code, city } = parsePostalCity(trimmed.slice(commaIdx + 2));
    return { address: street, postal_code, city };
  }

  const { postal_code, city } = parsePostalCity(trimmed);
  if (postal_code) {
    return { address: existing?.address?.trim() || null, postal_code, city };
  }

  return {
    address: trimmed,
    postal_code: existing?.postal_code?.trim() || null,
    city: existing?.city?.trim() || null,
  };
}

/** Täyttää huoltoraportin tyhjät asiakaskentät rekisteristä (ei ylikirjoita käyttäjän syöttöä). */
export function buildHuoltoCustomerFieldsFromRegistry(
  customer: Pick<Customer, 'id' | 'name' | 'address' | 'postal_code' | 'city' | 'phone' | 'email' | 'business_id'>,
  current: Pick<
    HuoltoReportData,
    'asiakas' | 'osoite' | 'asiakasYtunnus' | 'asiakasPuhelin' | 'asiakasEmail' | 'customerId'
  >,
): Partial<HuoltoReportData> {
  const registryAddress = formatCustomerAddressParts(customer);
  const patch: Partial<HuoltoReportData> = { customerId: customer.id };
  if (!String(current.asiakas ?? '').trim()) patch.asiakas = customer.name;
  if (!String(current.osoite ?? '').trim() && registryAddress) patch.osoite = registryAddress;
  if (!String(current.asiakasPuhelin ?? '').trim() && customer.phone) {
    patch.asiakasPuhelin = customer.phone;
  }
  if (!String(current.asiakasEmail ?? '').trim() && customer.email) {
    patch.asiakasEmail = customer.email;
  }
  if (!String(current.asiakasYtunnus ?? '').trim() && customer.business_id) {
    patch.asiakasYtunnus = customer.business_id;
  }
  return patch;
}

export function buildCustomerPatchFromMaintenanceData(
  data: Pick<
    HuoltoReportData,
    'asiakas' | 'osoite' | 'asiakasYtunnus' | 'asiakasPuhelin' | 'asiakasEmail'
  >,
  existing?: Pick<Customer, 'address' | 'postal_code' | 'city'> | null,
): Omit<UpdateRegistryCustomerInput, 'customerId'> | null {
  const name = data.asiakas?.trim();
  if (!name) return null;

  const { address, postal_code, city } = parseReportOsoite(data.osoite?.trim() ?? '', existing);

  return {
    name,
    address,
    postal_code,
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
    p_postal_code: input.postal_code?.trim() || null,
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
  existing?: Pick<Customer, 'address' | 'postal_code' | 'city'> | null,
): Promise<{ customer: Customer | null; error: string | null }> {
  const patch = buildCustomerPatchFromMaintenanceData(data, existing);
  if (!patch) return { customer: null, error: null };

  return updateRegistryCustomer(supabase, {
    customerId,
    ...patch,
  });
}
