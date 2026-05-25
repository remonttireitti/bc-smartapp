import type { Customer, Equipment } from '../types';

export type RegistryComboboxOption = {
  id: string;
  label: string;
  hint?: string;
};

export function filterCustomers(customers: Customer[], query: string): Customer[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return customers.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      (c.address ?? '').toLowerCase().includes(q) ||
      (c.city ?? '').toLowerCase().includes(q) ||
      (c.phone ?? '').toLowerCase().includes(q),
  );
}

export function customerToOption(
  customer: Customer & { owner_company?: { name: string } | null },
  myCompanyId?: string,
): RegistryComboboxOption {
  const addressHint = [customer.address, customer.city].filter(Boolean).join(', ');
  const registryLabel =
    myCompanyId && customer.owner_company_id !== myCompanyId
      ? customer.owner_company?.name ?? 'Kumppanin rekisteri'
      : myCompanyId
        ? 'Oma rekisteri'
        : undefined;
  const hint = [registryLabel, addressHint].filter(Boolean).join(' • ');
  return { id: customer.id, label: customer.name, hint: hint || undefined };
}

export function filterEquipment(equipment: Equipment[], query: string): Equipment[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return equipment.filter(
    (eq) =>
      eq.name.toLowerCase().includes(q) ||
      (eq.tag ?? '').toLowerCase().includes(q) ||
      (eq.model ?? '').toLowerCase().includes(q) ||
      (eq.serial_number ?? '').toLowerCase().includes(q) ||
      (eq.location ?? '').toLowerCase().includes(q),
  );
}

export function equipmentToOption(equipment: Equipment): RegistryComboboxOption {
  const label = equipment.tag ? `${equipment.tag} — ${equipment.name}` : equipment.name;
  const hint = [equipment.model, equipment.serial_number, equipment.location].filter(Boolean).join(' • ');
  return { id: equipment.id, label, hint: hint || undefined };
}
