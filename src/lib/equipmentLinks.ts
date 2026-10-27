import type { SupabaseClient } from '@supabase/supabase-js';
import type { MaintenanceHistoryEntry } from './equipmentMaintenanceHistory';
import { formatMaintenanceDateFi } from './equipmentMaintenanceHistory';

/** Laitelinkitys yritysten välillä (RPC:t vaativat SQL:n; ilman niitä kaikki palauttaa null → UI piilossa). */

export type EquipmentLinkSuggestion = {
  mine_id: string;
  mine_label: string;
  other_id: string;
  other_label: string;
  other_serial: string | null;
  other_company: string | null;
  score: 'high' | 'medium';
  can_activate: boolean;
};
export type EquipmentLink = {
  link_id: string;
  other_id: string;
  other_label: string;
  other_company: string | null;
  status: 'proposed' | 'active';
  can_accept: boolean;
};
export type EquipmentLinkIncoming = { link_id: string; mine_id: string; mine_label: string; other_label: string; other_company: string | null };
export type SharedHistoryRow = {
  entry_date: string | null;
  kind: 'huoltopöytäkirja' | 'merkintä' | 'huoltokäynti' | 'työraportti';
  company: string | null;
  installer: string | null;
  tukes: string | null;
  work_done: string | null;
  summary: string | null;
  is_service: boolean;
  is_leak_check: boolean;
};
export type EquipmentFillValues = Partial<{
  model: string;
  serial_number: string;
  manufacturer: string;
  refrigerant: string;
  refrigerant_charge_kg: number;
  installed_on: string;
}>;

async function rpc<T>(supabase: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T | null> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return null;
  return data as T;
}

export const suggestEquipmentLinks = (s: SupabaseClient, customerId: string) =>
  rpc<EquipmentLinkSuggestion[]>(s, 'equipment_link_suggest', { p_customer_id: customerId });
export const listEquipmentLinks = (s: SupabaseClient, equipmentId: string) =>
  rpc<EquipmentLink[]>(s, 'equipment_link_list', { p_equipment: equipmentId });
export const incomingEquipmentLinks = (s: SupabaseClient, customerId: string) =>
  rpc<EquipmentLinkIncoming[]>(s, 'equipment_link_incoming', { p_customer_id: customerId });
export const loadSharedHistory = (s: SupabaseClient, equipmentId: string) =>
  rpc<SharedHistoryRow[]>(s, 'equipment_shared_history', { p_equipment: equipmentId });
export const loadEquipmentFillValues = (s: SupabaseClient, equipmentId: string) =>
  rpc<EquipmentFillValues>(s, 'equipment_link_fill_values', { p_equipment: equipmentId });

export async function requestEquipmentLink(s: SupabaseClient, mine: string, other: string): Promise<'active' | 'proposed'> {
  const { data, error } = await s.rpc('equipment_link_request', { p_mine: mine, p_other: other });
  if (error) throw new Error(error.message);
  return data === 'active' ? 'active' : 'proposed';
}
export async function acceptEquipmentLink(s: SupabaseClient, linkId: string): Promise<void> {
  const { error } = await s.rpc('equipment_link_accept', { p_link_id: linkId });
  if (error) throw new Error(error.message);
}
export async function removeEquipmentLink(s: SupabaseClient, linkId: string): Promise<void> {
  const { error } = await s.rpc('equipment_link_remove', { p_link_id: linkId });
  if (error) throw new Error(error.message);
}

const KIND_LABEL: Record<SharedHistoryRow['kind'], string> = {
  huoltopöytäkirja: 'Huoltopöytäkirja',
  merkintä: 'Merkintä',
  huoltokäynti: 'Huoltokäynti',
  työraportti: 'Työraportti',
};
export const sharedKindLabel = (k: SharedHistoryRow['kind']) => KIND_LABEL[k] ?? k;

export function sharedByline(r: Pick<SharedHistoryRow, 'company' | 'installer' | 'tukes'>): string {
  const who = [r.installer, r.tukes ? `Tukes ${r.tukes}` : null].filter(Boolean).join(', ');
  return [r.company, who].filter(Boolean).join(' · ');
}

/** Jaetut rivit huoltohistoriaan (vain yhteenveto). */
export function sharedRowsToHistoryEntries(rows: SharedHistoryRow[] | null | undefined): MaintenanceHistoryEntry[] {
  return (rows ?? []).map((r) => {
    const text = [r.summary, r.work_done].filter(Boolean).join(': ') || sharedKindLabel(r.kind);
    const by = sharedByline(r);
    return {
      kind: r.kind === 'työraportti' ? 'työraportti' : r.kind === 'merkintä' ? 'merkintä' : r.kind === 'huoltokäynti' ? 'huoltokäynti' : 'huoltoraportti',
      sortMs: r.entry_date ? Date.parse(r.entry_date) : 0,
      dateLabel: r.entry_date ? formatMaintenanceDateFi(r.entry_date) : '—',
      summary: by ? `${text} (${by})` : text,
    };
  });
}

export function latestSharedYmd(rows: SharedHistoryRow[] | null | undefined, which: 'service' | 'leak'): string | null {
  let best: string | null = null;
  for (const r of rows ?? []) {
    if (!r.entry_date) continue;
    if (which === 'service' ? !r.is_service : !r.is_leak_check) continue;
    const ymd = r.entry_date.slice(0, 10);
    if (!best || ymd > best) best = ymd;
  }
  return best;
}

export function maxYmd(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a > b ? a : b;
}

/**
 * Bulk-esivalinta: päälle vain yksiselitteiset parit (laitteella yksi ehdokas ja ehdokkaalla yksi laite).
 */
export function defaultSuggestionSelection(list: EquipmentLinkSuggestion[]): Set<string> {
  const mineCount = new Map<string, number>();
  const otherCount = new Map<string, number>();
  for (const s of list) {
    mineCount.set(s.mine_id, (mineCount.get(s.mine_id) ?? 0) + 1);
    otherCount.set(s.other_id, (otherCount.get(s.other_id) ?? 0) + 1);
  }
  return new Set(
    list.filter((s) => mineCount.get(s.mine_id) === 1 && otherCount.get(s.other_id) === 1).map(suggestionKey),
  );
}
export const suggestionKey = (s: Pick<EquipmentLinkSuggestion, 'mine_id' | 'other_id'>) => `${s.mine_id}:${s.other_id}`;

/** Linkitettyjen laitteiden viimeisin huolto / vuototarkastus per oma laite (RPC valinnainen → tyhjä). */
export async function loadLinkedLastService(
  s: SupabaseClient,
  customerId: string,
): Promise<Record<string, { service: string | null; leak: string | null }>> {
  const rows = await rpc<Array<{ equipment_id: string; last_service: string | null; last_leak_check: string | null }>>(
    s, 'equipment_linked_last_service', { p_customer_id: customerId });
  const out: Record<string, { service: string | null; leak: string | null }> = {};
  for (const r of rows ?? []) out[r.equipment_id] = { service: r.last_service?.slice(0, 10) ?? null, leak: r.last_leak_check?.slice(0, 10) ?? null };
  return out;
}

export function mergeLatest(own: Record<string, string>, linked: Record<string, { service: string | null; leak: string | null }>, which: 'service' | 'leak'): Record<string, string> {
  const out = { ...own };
  for (const [id, v] of Object.entries(linked)) {
    const m = maxYmd(out[id], v[which]);
    if (m) out[id] = m;
  }
  return out;
}
