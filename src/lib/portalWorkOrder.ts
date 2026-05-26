import type { SupabaseClient } from '@supabase/supabase-js';
import { CUSTOMER_SELECT, EQUIPMENT_SELECT } from './customers';
import { isPortalView } from './portalPreview';
import type { Customer, Equipment, Profile } from '../types';

export function isPortalUser(profile: Pick<Profile, 'role'> | null | undefined) {
  return isPortalView(profile);
}

/** Portaali on vain luku — ei asiakas-/huoltoraportin muokkausta. */
export function isPortalReadOnly(profile: Pick<Profile, 'role'> | null | undefined) {
  return isPortalView(profile);
}

export {
  getPortalSubscriberId,
  getPortalCustomerId,
  needsPortalClientFilter,
  reportMatchesPortalSubscriber,
  filterMaintenanceReportsForPortalView,
} from './portalPreview';

export async function loadPortalOrderCustomers(
  supabase: SupabaseClient,
  profile: Pick<Profile, 'role' | 'subscriber_id' | 'customer_id' | 'company_id'>,
): Promise<Customer[]> {
  if (profile.role === 'customer' && profile.customer_id) {
    const { data, error } = await supabase
      .from('customers')
      .select(CUSTOMER_SELECT)
      .eq('id', profile.customer_id)
      .maybeSingle();
    if (error) throw error;
    return data ? [data as unknown as Customer] : [];
  }

  if (profile.role === 'subscriber' && profile.subscriber_id) {
    const { data, error } = await supabase
      .from('customers')
      .select(CUSTOMER_SELECT)
      .eq('subscriber_id', profile.subscriber_id)
      .order('name');
    if (error) throw error;
    return (data as unknown as Customer[]) ?? [];
  }

  return [];
}

export async function loadPortalOrderEquipment(
  supabase: SupabaseClient,
  customerId: string,
): Promise<Equipment[]> {
  const { data, error } = await supabase
    .from('equipment')
    .select(EQUIPMENT_SELECT)
    .eq('customer_id', customerId)
    .order('name');
  if (error) throw error;
  return (data as Equipment[]) ?? [];
}

export function resolvePortalOwnerCompanyId(
  profile: Pick<Profile, 'role' | 'company_id'>,
  customer: Pick<Customer, 'owner_company_id'> | undefined,
): string | null {
  if (customer?.owner_company_id) return customer.owner_company_id;
  return profile.company_id ?? null;
}
