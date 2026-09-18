import type { SupabaseClient } from '@supabase/supabase-js';
import type { Equipment } from '../types';
import { WORK_REPORT_NO_EQUIPMENT_LABEL, formatWorkReportEquipment } from '../types';

export type WorkReportEquipmentLink = {
  id: string;
  name: string;
  tag: string | null;
};

export function formatWorkReportEquipmentList(
  items: Array<{ name: string; tag?: string | null } | null | undefined>,
): string {
  const labels = items
    .filter((item): item is { name: string; tag?: string | null } => Boolean(item?.name))
    .map((item) => (item.tag ? `${item.tag} — ${item.name}` : item.name));
  if (labels.length === 0) return WORK_REPORT_NO_EQUIPMENT_LABEL;
  return labels.join(', ');
}

export function formatEquipmentOptionLabel(equipment: Pick<Equipment, 'name' | 'tag'>): string {
  return formatWorkReportEquipment({
    name: equipment.name,
    tag: equipment.tag,
  });
}

/** Load linked equipment for a work report (junction + legacy FK fallback). */
export async function loadWorkReportEquipmentLinks(
  supabase: SupabaseClient,
  reportId: string,
  legacyEquipmentId?: string | null,
): Promise<WorkReportEquipmentLink[]> {
  const { data, error } = await supabase
    .from('work_report_equipment')
    .select('equipment_id, sort_order, equipment:equipment_id(id, name, tag)')
    .eq('work_report_id', reportId)
    .order('sort_order', { ascending: true });

  if (error) {
    // Table may not exist yet in older envs — fall back to legacy FK only.
    if (legacyEquipmentId) {
      const { data: eq } = await supabase
        .from('equipment')
        .select('id, name, tag')
        .eq('id', legacyEquipmentId)
        .maybeSingle();
      if (eq) {
        return [{ id: eq.id as string, name: eq.name as string, tag: (eq.tag as string | null) ?? null }];
      }
    }
    return [];
  }

  const links = (data ?? [])
    .map((row) => {
      const rawEq = row.equipment as unknown;
      const eq = Array.isArray(rawEq)
        ? (rawEq[0] as { id: string; name: string; tag: string | null } | undefined)
        : (rawEq as { id: string; name: string; tag: string | null } | null);
      if (!eq?.id) return null;
      return { id: eq.id, name: eq.name, tag: eq.tag ?? null, sort: row.sort_order as number };
    })
    .filter((row): row is WorkReportEquipmentLink & { sort: number } => Boolean(row))
    .sort((a, b) => a.sort - b.sort)
    .map(({ id, name, tag }) => ({ id, name, tag }));

  if (links.length > 0) return links;

  if (legacyEquipmentId) {
    const { data: eq } = await supabase
      .from('equipment')
      .select('id, name, tag')
      .eq('id', legacyEquipmentId)
      .maybeSingle();
    if (eq) {
      return [{ id: eq.id as string, name: eq.name as string, tag: (eq.tag as string | null) ?? null }];
    }
  }

  return [];
}

/**
 * Replace work report ↔ equipment links.
 * Also mirrors the first selected id onto work_reports.equipment_id for legacy readers.
 */
export async function saveWorkReportEquipmentLinks(
  supabase: SupabaseClient,
  reportId: string,
  equipmentIds: string[],
): Promise<{ primaryEquipmentId: string | null; error: string | null }> {
  const uniqueIds = [...new Set(equipmentIds.map((id) => id.trim()).filter(Boolean))];
  const primaryEquipmentId = uniqueIds[0] ?? null;

  const { error: deleteError } = await supabase
    .from('work_report_equipment')
    .delete()
    .eq('work_report_id', reportId);

  if (deleteError) {
    // If junction table missing, still update legacy FK.
    const { error: legacyError } = await supabase
      .from('work_reports')
      .update({ equipment_id: primaryEquipmentId })
      .eq('id', reportId);
    return { primaryEquipmentId, error: legacyError?.message ?? deleteError.message };
  }

  if (uniqueIds.length > 0) {
    const { error: insertError } = await supabase.from('work_report_equipment').insert(
      uniqueIds.map((equipmentId, index) => ({
        work_report_id: reportId,
        equipment_id: equipmentId,
        sort_order: index,
      })),
    );
    if (insertError) {
      return { primaryEquipmentId, error: insertError.message };
    }
  }

  const { error: updateError } = await supabase
    .from('work_reports')
    .update({ equipment_id: primaryEquipmentId })
    .eq('id', reportId);

  return { primaryEquipmentId, error: updateError?.message ?? null };
}

/** Report IDs linked to this equipment via junction or legacy FK. */
export async function findWorkReportIdsForEquipment(
  supabase: SupabaseClient,
  equipmentId: string,
): Promise<string[]> {
  const ids = new Set<string>();

  const { data: links } = await supabase
    .from('work_report_equipment')
    .select('work_report_id')
    .eq('equipment_id', equipmentId);
  for (const row of links ?? []) {
    if (row.work_report_id) ids.add(row.work_report_id as string);
  }

  const { data: legacy } = await supabase
    .from('work_reports')
    .select('id')
    .eq('equipment_id', equipmentId);
  for (const row of legacy ?? []) {
    if (row.id) ids.add(row.id as string);
  }

  return [...ids];
}
