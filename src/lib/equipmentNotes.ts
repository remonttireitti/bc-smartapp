import type { SupabaseClient } from '@supabase/supabase-js';

/** Laitteen huoltohistoriamerkintä (taulu equipment_notes, valinnainen — vaatii SQL:n). */
export type EquipmentNote = {
  id: string;
  equipment_id: string;
  entry_date: string;
  author_company_name: string | null;
  installer_name: string | null;
  installer_tukes: string | null;
  text: string;
  is_service_visit: boolean;
  created_at: string;
};

export const EQUIPMENT_NOTE_COLUMNS =
  'id, equipment_id, entry_date, author_company_name, installer_name, installer_tukes, text, is_service_visit, created_at';

export const EQUIPMENT_NOTE_QUICK_PICKS = ['Hälytys kuitattu', 'Höyrystin sulatettu'] as const;

/** null = taulua ei ole (tai ei oikeutta) → lisäys piilotetaan. */
export async function loadEquipmentNotes(
  supabase: SupabaseClient,
  filter: { equipmentId: string } | { customerId: string },
): Promise<EquipmentNote[] | null> {
  const base = 'equipmentId' in filter
    ? supabase.from('equipment_notes').select(EQUIPMENT_NOTE_COLUMNS).eq('equipment_id', filter.equipmentId)
    : supabase
        .from('equipment_notes')
        .select(`${EQUIPMENT_NOTE_COLUMNS}, equipment!inner(customer_id)`)
        .eq('equipment.customer_id', filter.customerId);
  const { data, error } = await base.order('entry_date', { ascending: false });
  if (error) return null;
  return ((data ?? []) as unknown as EquipmentNote[]).map((n) => ({ ...n, is_service_visit: n.is_service_visit === true }));
}

export async function insertEquipmentNote(
  supabase: SupabaseClient,
  input: {
    equipmentId: string;
    authorCompanyId: string;
    authorCompanyName: string | null;
    installerName: string | null;
    installerTukes: string | null;
    entryDate: string;
    text: string;
    isServiceVisit: boolean;
    createdBy: string;
  },
): Promise<void> {
  const { error } = await supabase.from('equipment_notes').insert({
    equipment_id: input.equipmentId,
    author_company_id: input.authorCompanyId,
    author_company_name: input.authorCompanyName,
    installer_name: input.installerName,
    installer_tukes: input.installerTukes,
    entry_date: input.entryDate,
    text: input.text,
    is_service_visit: input.isServiceVisit,
    created_by: input.createdBy,
  });
  if (error) throw new Error(error.message);
}

export function noteByline(n: Pick<EquipmentNote, 'author_company_name' | 'installer_name' | 'installer_tukes'>): string {
  const who = [n.installer_name, n.installer_tukes ? `Tukes ${n.installer_tukes}` : null].filter(Boolean).join(', ');
  return [n.author_company_name, who].filter(Boolean).join(' · ');
}
