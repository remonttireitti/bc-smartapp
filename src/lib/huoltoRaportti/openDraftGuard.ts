import type { SupabaseClient } from '@supabase/supabase-js';
import { draftMatchesMaintenanceSeason, type MaintenanceSeason } from '../maintenanceSeasonOverview';

export const OPEN_DRAFT_FLASH = 'Laitteella on jo avoin luonnos – avattiin se. Kaksoiskappaletta ei luotu.';

export type OpenDraftSeasonMatch = { season: MaintenanceSeason; year: number };

/**
 * Laitteen avoin huoltoraporttiluonnos (uusin), jos sellainen on.
 * season: vain sama eksplisiittinen kausi ja vuosi — muu luonnos tai korjaus ei kelpaa.
 */
export async function findOpenDraftForEquipment(
  supabase: Pick<SupabaseClient, 'from'>,
  equipmentId: string | null | undefined,
  excludeReportId?: string | null,
  season?: OpenDraftSeasonMatch | null,
): Promise<string | null> {
  if (!equipmentId) return null;
  const { data, error } = await supabase
    .from('maintenance_reports')
    .select('id, data')
    .eq('equipment_id', equipmentId)
    .eq('status', 'draft')
    .order('updated_at', { ascending: false })
    .limit(season ? 40 : 2);
  if (error || !data) return null;
  const rows = (data as unknown as { id: string; data?: unknown }[]).filter((r) => r.id !== excludeReportId);
  if (!season) return rows[0]?.id ?? null;
  return rows.find((row) => draftMatchesMaintenanceSeason(row.data, season.season, season.year))?.id ?? null;
}
