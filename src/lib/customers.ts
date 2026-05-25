import {
  partnershipModuleAccess,
  partnershipPermsActingOnOwner,
} from './management';
import type { Partnership } from '../types';

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

export const CUSTOMER_SELECT = `
  id, name, address, city, phone, email, business_id, notes, owner_company_id, created_at,
  subscriber_id,
  subscriber:subscribers!customers_subscriber_id_fkey(id, name),
  owner_company:companies!customers_owner_company_id_fkey(name)
`;

export const EQUIPMENT_SELECT =
  'id, name, tag, customer_id, owner_company_id, model, serial_number, location, notes, device_type, huolto_technical_snapshot, created_at';
