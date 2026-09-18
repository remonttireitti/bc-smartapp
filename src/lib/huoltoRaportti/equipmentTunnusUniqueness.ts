import type { SupabaseClient } from '@supabase/supabase-js';

export type EquipmentTunnusMatch = {
  id: string;
  name: string;
  tag: string | null;
};

function normalizeTunnusKey(value: string): string {
  return value.trim().toLowerCase();
}

/** Onko laitetunnus (tag tai name) jo käytössä tällä asiakkaalla. */
export function equipmentTunnusConflicts(
  rows: Array<{ id: string; name: string | null; tag: string | null }>,
  tunnus: string,
  excludeEquipmentId?: string | null,
): EquipmentTunnusMatch | null {
  const needle = normalizeTunnusKey(tunnus);
  if (!needle) return null;
  for (const row of rows) {
    if (excludeEquipmentId && row.id === excludeEquipmentId) continue;
    const tag = normalizeTunnusKey(row.tag ?? '');
    const name = normalizeTunnusKey(row.name ?? '');
    if (tag === needle || name === needle) {
      return { id: row.id, name: row.name ?? row.tag ?? tunnus, tag: row.tag };
    }
  }
  return null;
}

export function duplicateEquipmentTunnusError(tunnus: string): Error {
  const label = tunnus.trim() || '—';
  return new Error(`Laitetunnus "${label}" on jo käytössä tällä asiakkaalla. Valitse uniikki tunnus.`);
}

/** Hae asiakkaan laitteet ja tarkista ettei tunnus/nimi törmää. */
export async function assertUniqueCustomerEquipmentTunnus(
  supabase: SupabaseClient,
  customerId: string,
  tunnus: string,
  excludeEquipmentId?: string | null,
): Promise<void> {
  const normalized = tunnus.trim();
  if (!normalized) return;

  const { data, error } = await supabase
    .from('equipment')
    .select('id, name, tag')
    .eq('customer_id', customerId);

  if (error) throw new Error(error.message);

  const conflict = equipmentTunnusConflicts(
    (data ?? []) as Array<{ id: string; name: string | null; tag: string | null }>,
    normalized,
    excludeEquipmentId,
  );
  if (conflict) throw duplicateEquipmentTunnusError(normalized);
}
