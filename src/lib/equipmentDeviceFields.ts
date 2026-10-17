import type { SupabaseClient } from '@supabase/supabase-js';

/** Laitteen merkki, kylmäaine, täytös ja asennuspäivä (equipment-sarakkeet, migraatio 2026-10). */
export type EquipmentDeviceFields = {
  manufacturer: string | null;
  refrigerant: string | null;
  refrigerant_charge_kg: number | null;
  installed_on: string | null;
};

export const EQUIPMENT_DEVICE_FIELD_COLUMNS = 'id, manufacturer, refrigerant, refrigerant_charge_kg, installed_on';

const EMPTY: EquipmentDeviceFields = { manufacturer: null, refrigerant: null, refrigerant_charge_kg: null, installed_on: null };

function text(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t && t !== '—' && t !== '-' ? t : null;
}

export function parseChargeKg(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  const t = text(v);
  if (!t) return null;
  const n = Number(t.replace(',', '.').replace(/\s*kg$/i, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Huoltoraportin teknisestä tilannekuvasta johdetut arvot (vain luku -varavaihtoehto). */
export function deviceFieldsFromSnapshot(snapshot: unknown): EquipmentDeviceFields {
  if (!snapshot || typeof snapshot !== 'object') return { ...EMPTY };
  const s = snapshot as Record<string, unknown>;
  return {
    manufacturer: null,
    refrigerant: text(s.kylmaaineTyyppi) ?? text(s.kylmaaineLaatu),
    refrigerant_charge_kg: parseChargeKg(s.kylmaaineMaaraYhteensa),
    installed_on: null,
  };
}

/** Sarakkeen arvo ensin, muuten tilannekuva. */
export function effectiveDeviceFields(
  columns: Partial<EquipmentDeviceFields> | null | undefined,
  snapshot: unknown,
): EquipmentDeviceFields {
  const fb = deviceFieldsFromSnapshot(snapshot);
  return {
    manufacturer: columns?.manufacturer ?? fb.manufacturer,
    refrigerant: columns?.refrigerant ?? fb.refrigerant,
    refrigerant_charge_kg: columns?.refrigerant_charge_kg ?? fb.refrigerant_charge_kg,
    installed_on: columns?.installed_on ?? fb.installed_on,
  };
}

export function formatRefrigerant(f: Pick<EquipmentDeviceFields, 'refrigerant' | 'refrigerant_charge_kg'>): string {
  const kg = f.refrigerant_charge_kg != null ? `${f.refrigerant_charge_kg.toLocaleString('fi-FI')} kg` : '';
  return [f.refrigerant, kg].filter(Boolean).join(' · ');
}

/**
 * Lataa sarakkeet laitteille. Palauttaa null, jos sarakkeita ei vielä ole (migraatio ajamatta)
 * — silloin käytetään tilannekuvaa vain luku -tilassa.
 */
export async function loadEquipmentDeviceFields(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Map<string, EquipmentDeviceFields> | null> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from('equipment').select(EQUIPMENT_DEVICE_FIELD_COLUMNS).in('id', ids);
  if (error) return null;
  const map = new Map<string, EquipmentDeviceFields>();
  for (const row of (data ?? []) as Array<EquipmentDeviceFields & { id: string }>) {
    map.set(row.id, {
      manufacturer: row.manufacturer ?? null,
      refrigerant: row.refrigerant ?? null,
      refrigerant_charge_kg: row.refrigerant_charge_kg != null ? Number(row.refrigerant_charge_kg) : null,
      installed_on: row.installed_on ?? null,
    });
  }
  return map;
}

/** Huoltoraportin tallennus: täytä tyhjät sarakkeet (ei ylikirjoita). Hiljaa ohi, jos sarakkeita ei ole. */
export async function fillEmptyEquipmentDeviceFields(
  supabase: SupabaseClient,
  equipmentId: string,
  values: Partial<EquipmentDeviceFields>,
): Promise<void> {
  const current = await loadEquipmentDeviceFields(supabase, [equipmentId]);
  if (!current) return;
  const row = current.get(equipmentId) ?? { ...EMPTY };
  const patch = emptyFieldPatch(row, values);
  if (Object.keys(patch).length === 0) return;
  await supabase.from('equipment').update(patch).eq('id', equipmentId);
}

export function emptyFieldPatch(
  row: EquipmentDeviceFields,
  values: Partial<EquipmentDeviceFields>,
): Partial<EquipmentDeviceFields> {
  const patch: Partial<EquipmentDeviceFields> = {};
  const m = text(values.manufacturer);
  if (!row.manufacturer && m) patch.manufacturer = m;
  const r = text(values.refrigerant);
  if (!row.refrigerant && r) patch.refrigerant = r;
  const kg = parseChargeKg(values.refrigerant_charge_kg);
  if (row.refrigerant_charge_kg == null && kg != null) patch.refrigerant_charge_kg = kg;
  const d = text(values.installed_on);
  if (!row.installed_on && d && /^\d{4}-\d{2}-\d{2}$/.test(d)) patch.installed_on = d;
  return patch;
}
