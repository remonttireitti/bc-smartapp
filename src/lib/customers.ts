import { isPortalPreviewActive, isPortalUser } from './portalPreview';
import {
  partnershipModuleAccess,
  partnershipPermsActingOnOwner,
} from './management';
import type { Partnership, Profile } from '../types';
import { loadAccessibleReportCustomers } from './reportCustomerRegistry';

export function canWriteCustomersModule(
  ownerCompanyId: string,
  myCompanyId: string | null | undefined,
  partnerships: Partnership[],
) {
  if (!myCompanyId) return false;
  if (ownerCompanyId === myCompanyId) return true;

  for (const p of partnerships) {
    if (p.company_a_id !== myCompanyId && p.company_b_id !== myCompanyId) continue;
    const partnerId = p.company_a_id === myCompanyId ? p.company_b_id : p.company_a_id;
    if (partnerId !== ownerCompanyId) continue;
    const perms = partnershipPermsActingOnOwner(p, myCompanyId, ownerCompanyId);
    if (partnershipModuleAccess(perms, 'customers', 'write')) return true;
  }

  return false;
}

export function canEditCustomersAsStaff(
  profile: Pick<Profile, 'role'> | null | undefined,
  ownerCompanyId: string,
  myCompanyId: string | null | undefined,
  partnerships: Partnership[],
) {
  if (isPortalUser(profile) || isPortalPreviewActive()) return false;
  return canWriteCustomersModule(ownerCompanyId, myCompanyId, partnerships);
}

export function customerAddressLine(customer: {
  address?: string | null;
  city?: string | null;
}) {
  return [customer.address, customer.city].filter(Boolean).join(', ') || '—';
}

export function companiesWithCustomerWrite(
  myCompanyId: string,
  myCompanyName: string,
  partnerships: Partnership[],
) {
  const options: { id: string; name: string }[] = [{ id: myCompanyId, name: myCompanyName }];

  for (const p of partnerships) {
    const partnerId = p.company_a_id === myCompanyId ? p.company_b_id : p.company_a_id;
    const perms = partnershipPermsActingOnOwner(p, myCompanyId, partnerId);
    if (!partnershipModuleAccess(perms, 'customers', 'write')) continue;
    if (!options.some((o) => o.id === p.partner_company.id)) {
      options.push({ id: p.partner_company.id, name: p.partner_company.name });
    }
  }

  return options;
}

export async function loadCustomersForOwner(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  ownerCompanyId: string,
) {
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, address, city, subscriber_id')
    .eq('owner_company_id', ownerCompanyId)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export type WarehouseCustomerPickerOption = {
  id: string;
  name: string;
  label: string;
};

/** Asiakkaat, joita käyttäjä näkee ja jotka kuuluvat valitun varaston yrityksen rekisteriin. */
export async function loadWarehouseCustomerPicker(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  myCompanyId: string,
  warehouseCompanyId: string,
  partnerships: Partnership[],
): Promise<WarehouseCustomerPickerOption[]> {
  const rows = await loadAccessibleReportCustomers(supabase, myCompanyId, partnerships);
  const seen = new Set<string>();
  const options: WarehouseCustomerPickerOption[] = [];

  for (const customer of rows) {
    if (customer.owner_company_id !== warehouseCompanyId) continue;
    if (seen.has(customer.id)) continue;
    seen.add(customer.id);
    const addr = customerAddressLine(customer);
    options.push({
      id: customer.id,
      name: customer.name,
      label: addr !== '—' ? `${customer.name} · ${addr}` : customer.name,
    });
  }

  options.sort((a, b) => a.name.localeCompare(b.name, 'fi'));
  return options;
}

export const CUSTOMER_SELECT = `
  id, name, address, city, phone, email, business_id, notes, owner_company_id, created_at,
  subscriber_id,
  subscriber:subscribers!customers_subscriber_id_fkey(id, name),
  owner_company:companies!customers_owner_company_id_fkey(name)
`;

export const EQUIPMENT_SELECT =
  'id, name, tag, customer_id, owner_company_id, model, serial_number, location, notes, device_type, huolto_technical_snapshot, created_at';
