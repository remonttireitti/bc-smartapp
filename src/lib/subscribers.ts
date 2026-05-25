import type { SupabaseClient } from '@supabase/supabase-js';
import { accessibleRegistryCompanyIds } from './reportCustomerRegistry';
import type { Customer, Partnership, Subscriber } from '../types';

export const SUBSCRIBER_SELECT =
  'id, name, business_id, email, phone, notes, owner_company_id, created_at';

export const CUSTOMER_SUBSCRIBER_EMBED = `
  subscriber_id,
  subscriber:subscribers!customers_subscriber_id_fkey(id, name)
`;

export function subscriberLabel(subscriber: Pick<Subscriber, 'name'> | null | undefined) {
  return subscriber?.name?.trim() || '—';
}

export function resolveSubscriberIdForReport(
  customerId: string,
  explicitSubscriberId: string,
  customers: Pick<Customer, 'id' | 'subscriber_id'>[],
): string | null {
  if (explicitSubscriberId) return explicitSubscriberId;
  if (!customerId) return null;
  const customer = customers.find((c) => c.id === customerId);
  return customer?.subscriber_id ?? null;
}

export async function loadAccessibleSubscribers(
  supabase: SupabaseClient,
  myCompanyId: string,
  partnerships: Partnership[],
): Promise<Subscriber[]> {
  const ownerIds = accessibleRegistryCompanyIds(myCompanyId, partnerships);
  const { data, error } = await supabase
    .from('subscribers')
    .select(SUBSCRIBER_SELECT)
    .in('owner_company_id', ownerIds)
    .order('name');

  if (error) throw error;
  return (data as Subscriber[]) ?? [];
}

export async function loadSubscribersForOwner(
  supabase: SupabaseClient,
  ownerCompanyId: string,
): Promise<Subscriber[]> {
  const { data, error } = await supabase
    .from('subscribers')
    .select(SUBSCRIBER_SELECT)
    .eq('owner_company_id', ownerCompanyId)
    .order('name');

  if (error) throw error;
  return (data as Subscriber[]) ?? [];
}
