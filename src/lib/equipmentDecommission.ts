import type { SupabaseClient } from '@supabase/supabase-js';
import { todayYmdLocal } from './huoltoSchedule';

/**
 * Laite poistettu käytöstä (ei poistettu rekisteristä): equipment.decommissioned_at (date).
 * Sarake tulee SQL:llä — ilman sitä loaderit palauttavat null ja toiminto piilotetaan.
 */
export type DecommissionedMap = Map<string, string>;

type Row = { id: string; decommissioned_at: string | null };

function toMap(data: unknown): DecommissionedMap {
  const map: DecommissionedMap = new Map();
  for (const r of (data ?? []) as Row[]) {
    if (r.decommissioned_at) map.set(r.id, String(r.decommissioned_at).slice(0, 10));
  }
  return map;
}

/** Asiakkaan käytöstä poistetut laitteet (id → pvm). null = sarake puuttuu (SQL ajamatta). */
export async function loadDecommissionedForCustomer(
  supabase: SupabaseClient,
  customerId: string,
): Promise<DecommissionedMap | null> {
  const { data, error } = await supabase.from('equipment').select('id, decommissioned_at').eq('customer_id', customerId);
  if (error) return null;
  return toMap(data);
}

export async function loadDecommissionedByIds(
  supabase: SupabaseClient,
  ids: string[],
): Promise<DecommissionedMap | null> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from('equipment').select('id, decommissioned_at').in('id', ids);
  if (error) return null;
  return toMap(data);
}

/** Merkitse laite poistetuksi käytöstä (pvm oletuksena tänään) tai palauta käyttöön (null). */
export async function setEquipmentDecommissioned(
  supabase: SupabaseClient,
  equipmentId: string,
  ymd: string | null,
): Promise<void> {
  const value = ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : ymd === null ? null : todayYmdLocal();
  const { data, error } = await supabase
    .from('equipment')
    .update({ decommissioned_at: value })
    .eq('id', equipmentId)
    .select('id');
  if (error) throw new Error(error.message);
  // RLS: vain laitteen omistajayritys voi päivittää; tyhjä tulos = ei oikeutta.
  if (!data || data.length === 0) throw new Error('Ei oikeutta muuttaa laitteen tilaa.');
}

/** Valitsimiin: pudota käytöstä poistetut (paitsi keepId). Sarakkeen puuttuessa palauttaa kaiken. */
export async function withoutDecommissioned<T extends { id: string }>(
  supabase: SupabaseClient,
  customerId: string,
  rows: T[],
  keepId?: string | null,
): Promise<T[]> {
  if (rows.length === 0) return rows;
  const map = await loadDecommissionedForCustomer(supabase, customerId);
  if (!map || map.size === 0) return rows;
  return rows.filter((r) => !map.has(r.id) || r.id === keepId);
}

export function splitByDecommissioned<T extends { id: string }>(
  rows: T[],
  map: DecommissionedMap | null,
): { active: T[]; removed: T[] } {
  if (!map || map.size === 0) return { active: rows, removed: [] };
  return {
    active: rows.filter((r) => !map.has(r.id)),
    removed: rows.filter((r) => map.has(r.id)),
  };
}
