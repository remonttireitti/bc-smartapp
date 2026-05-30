import type { SupabaseClient } from '@supabase/supabase-js';

import { DEFAULT_TRIP_DESTINATIONS } from '../data/defaultTripDestinations';
import { customerAddressLine } from './customers';

export type TripDestination = {
  id: string;
  company_id: string;
  name: string;
  address: string;
  category: 'supplier' | 'custom';
  supplier_key: string | null;
  sort_order: number;
};

export type TripDestinationOption = {
  id: string;
  label: string;
  address: string;
  group: 'customer' | 'supplier' | 'custom';
};

export async function ensureDefaultTripDestinations(supabase: SupabaseClient, companyId: string) {
  const { data: existing, error: loadError } = await supabase
    .from('trip_destinations')
    .select('supplier_key')
    .eq('company_id', companyId)
    .not('supplier_key', 'is', null);

  if (loadError) throw loadError;

  const existingKeys = new Set((existing ?? []).map((row) => row.supplier_key).filter(Boolean));
  const missing = DEFAULT_TRIP_DESTINATIONS.filter((row) => !existingKeys.has(row.supplier_key));
  if (missing.length === 0) return;

  const { error } = await supabase.from('trip_destinations').insert(
    missing.map((row) => ({
      company_id: companyId,
      name: row.name,
      address: row.address,
      category: 'supplier' as const,
      supplier_key: row.supplier_key,
      sort_order: row.sort_order,
    })),
  );

  if (error) throw error;
}

export async function loadTripDestinations(supabase: SupabaseClient, companyId: string) {
  await ensureDefaultTripDestinations(supabase, companyId);

  const { data, error } = await supabase
    .from('trip_destinations')
    .select('id, company_id, name, address, category, supplier_key, sort_order')
    .eq('company_id', companyId)
    .order('sort_order')
    .order('name');

  if (error) throw error;
  return (data as TripDestination[]) ?? [];
}

export async function loadTripDestinationOptions(
  supabase: SupabaseClient,
  companyId: string,
  reportCustomer?: { id: string; name: string; address?: string | null; city?: string | null } | null,
): Promise<TripDestinationOption[]> {
  const [destinations, customersResult] = await Promise.all([
    loadTripDestinations(supabase, companyId),
    supabase
      .from('customers')
      .select('id, name, address, city')
      .eq('owner_company_id', companyId)
      .order('name'),
  ]);

  if (customersResult.error) throw customersResult.error;

  const options: TripDestinationOption[] = [];

  const reportCustomerLine = reportCustomer ? formatCustomerDestination(reportCustomer) : null;
  if (reportCustomer && reportCustomerLine) {
    options.push({
      id: `customer-report-${reportCustomer.id}`,
      label: `${reportCustomer.name} (työraportti)`,
      address: reportCustomerLine,
      group: 'customer',
    });
  }

  for (const customer of customersResult.data ?? []) {
    if (reportCustomer?.id === customer.id) continue;
    const address = formatCustomerDestination(customer);
    if (!address) continue;
    options.push({
      id: `customer-${customer.id}`,
      label: customer.name,
      address,
      group: 'customer',
    });
  }

  for (const dest of destinations) {
    options.push({
      id: dest.id,
      label: dest.name,
      address: dest.address,
      group: dest.category === 'supplier' ? 'supplier' : 'custom',
    });
  }

  return options;
}

export function formatCustomerDestination(customer: {
  name?: string | null;
  address?: string | null;
  city?: string | null;
}): string | null {
  const line = customerAddressLine(customer);
  if (line && line !== '—') return line;
  return customer.name?.trim() || null;
}

export async function addCustomTripDestination(
  supabase: SupabaseClient,
  companyId: string,
  name: string,
  address: string,
) {
  const { error } = await supabase.from('trip_destinations').insert({
    company_id: companyId,
    name: name.trim(),
    address: address.trim(),
    category: 'custom',
    sort_order: 900,
  });
  if (error) throw error;
}

export async function deleteCustomTripDestination(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from('trip_destinations').delete().eq('id', id).eq('category', 'custom');
  if (error) throw error;
}
