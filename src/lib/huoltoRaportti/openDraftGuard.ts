import type { SupabaseClient } from '@supabase/supabase-js';

export const OPEN_DRAFT_FLASH = 'Laitteella on jo avoin luonnos – avattiin se. Kaksoiskappaletta ei luotu.';

/** Laitteen avoin huoltoraporttiluonnos (uusin), jos sellainen on. Yksi luonnos per laite. */
export async function findOpenDraftForEquipment(
  supabase: Pick<SupabaseClient, 'from'>,
  equipmentId: string | null | undefined,
  excludeReportId?: string | null,
): Promise<string | null> {
  if (!equipmentId) return null;
  const { data, error } = await supabase
    .from('maintenance_reports')
    .select('id')
    .eq('equipment_id', equipmentId)
    .eq('status', 'draft')
    .order('updated_at', { ascending: false })
    .limit(2);
  if (error || !data) return null;
  const rows = (data as { id: string }[]).filter((r) => r.id !== excludeReportId);
  return rows[0]?.id ?? null;
}
